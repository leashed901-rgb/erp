import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { deliverOutboxRow, sendEmailViaResend, resolveDefaultFrom, ResendNotConfiguredError } from '@/lib/resend';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/** POST /api/v1/documents/[id]/send?type=invoice[&remind=1]
 *  Registry actions `invoice.send` / `invoice.remind`.
 *
 *  Invoices go through `acct_send_invoice`, which enqueues the mail in
 *  email_outbox — and nothing in this repo drains that queue, so the
 *  route now delivers the queued row through Resend itself and marks it
 *  sent via email_mark_sent. If the RPC rejects the row, the route
 *  composes the invoice email directly and sends it via Resend instead.
 *  A failed delivery is reported as a failure — the invoice is never
 *  reported 'sent' when the email did not go out. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type');
  const TABLE_MAP: Record<string, string> = { Invoice: 'acct_ar_invoices', Bill: 'acct_ap_bills', Estimate: 'acct_estimates', PurchaseOrder: 'erp_purchase_orders', SalesOrder: 'erp_orders' };
  const table = TABLE_MAP[type || ''];
  if (!table) return err('VALIDATION', 'Valid type required', 400);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body is fine */ }
  const remind = searchParams.get('remind') === '1' || body.remind === true;

  if (table === 'acct_ar_invoices') {
    const { data: rpcResult, error: rpcError } = await supabaseAdmin().rpc('acct_send_invoice', {
      p_invoice_id: id,
      p_reminder: remind,
      p_message: (body.message as string) || null,
      p_pay_url_base: (body.pay_url_base as string) || null,
      p_pdf_path: (body.pdf_path as string) || null,
    });
    if (!rpcError && rpcResult) {
      // Enqueued (the RPC also flipped the invoice to 'sent'). Deliver it.
      try {
        const { resendId } = await deliverOutboxRow(String(rpcResult));
        return NextResponse.json({
          data: { id, receipt_id: rpcResult, email_id: resendId },
          message: remind ? 'Invoice reminder sent' : 'Invoice sent',
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return NextResponse.json(
          {
            error: {
              code: 'EMAIL_DELIVERY_FAILED',
              message: `Invoice is marked sent in the app, but the email did not go out and stays queued in the outbox: ${message}`,
              requestId: crypto.randomUUID(),
            },
            meta: { invoice_id: id, outbox_id: rpcResult, invoice_marked_sent: true },
          },
          { status: 502 },
        );
      }
    }

    // RPC rejected the row — send the invoice email directly via Resend.
    const sb = supabaseAdmin();
    const { data: invoice } = await sb
      .from('acct_ar_invoices')
      .select('id, invoice_number, customer_id, customer_email, total, open_balance, currency, due_date, message_to_customer, email_body, public_token')
      .eq('id', id)
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .single();
    if (!invoice) return err('NOT_FOUND', 'Invoice not found', 404);
    const { data: customer } = await sb
      .from('crm_customers')
      .select('email, first_name, last_name, company_name')
      .eq('id', invoice.customer_id)
      .maybeSingle();
    const to = invoice.customer_email || customer?.email;
    if (!to) return err('VALIDATION', 'Customer has no email address', 400);
    const name = [customer?.first_name, customer?.last_name].filter(Boolean).join(' ') || customer?.company_name || '';
    const payUrl =
      body.pay_url_base && invoice.public_token
        ? `${String(body.pay_url_base).replace(/\/$/, '')}/pay/${invoice.public_token}`
        : null;
    const subject = `${remind ? 'Reminder: invoice ' : 'Invoice '}${invoice.invoice_number} - ${Number(invoice.open_balance).toFixed(2)} ${invoice.currency || 'USD'} due ${invoice.due_date || ''}`.trim();
    const messageText =
      (body.message as string) ||
      invoice.message_to_customer ||
      invoice.email_body ||
      `Invoice ${invoice.invoice_number} for ${Number(invoice.total).toFixed(2)} is due ${invoice.due_date || ''}.`;
    try {
      const { id: emailId } = await sendEmailViaResend({
        from: await resolveDefaultFrom(),
        to: [to],
        subject,
        html: `<p>Hello ${name},</p><p>${messageText}</p>${payUrl ? `<p><a href="${payUrl}">View and pay</a></p>` : ''}`,
        text: `Hello ${name},\n\n${messageText}${payUrl ? `\n\nView and pay: ${payUrl}` : ''}`,
      });
      const { data, error } = await sb
        .from(table)
        .update({ status: 'sent', sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .select('*')
        .single();
      if (error) return err('INTERNAL', error.message, 500);
      return NextResponse.json({ data, meta: { email_id: emailId }, message: 'Invoice sent' });
    } catch (e) {
      if (e instanceof ResendNotConfiguredError) {
        return NextResponse.json(
          { error: { code: 'EMAIL_NOT_CONFIGURED', message: e.message, requestId: crypto.randomUUID() } },
          { status: 502 },
        );
      }
      const message = e instanceof Error ? e.message : String(e);
      return NextResponse.json(
        { error: { code: 'EMAIL_DELIVERY_FAILED', message, requestId: crypto.randomUUID() } },
        { status: 502 },
      );
    }
  }

  // PurchaseOrder: erp_purchase_orders has no 'sent' status and no
  // sent_at column, so the generic branch below would 400. Send the PO
  // to the vendor via Resend and record the send as status 'approved'
  // (the sent state for a PO — the inventory view treats 'approved' as
  // an open PO). The acct_ap_* PO tables are retired compat views.
  if (table === 'erp_purchase_orders') {
    const { data: po } = await supabaseAdmin()
      .from('erp_purchase_orders')
      .select('id, po_number, vendor_id, total, currency, order_date, expected_date, status')
      .eq('id', id)
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .single();
    if (!po) return err('NOT_FOUND', 'Purchase order not found', 404);
    const { data: vendor } = await supabaseAdmin()
      .from('acct_vendors')
      .select('email, legal_name, display_name')
      .eq('id', po.vendor_id)
      .maybeSingle();
    const to = vendor?.email;
    if (!to) return err('VALIDATION', 'Vendor has no email address', 400);
    const { data: poLines } = await supabaseAdmin()
      .from('erp_purchase_order_lines')
      .select('description, quantity, unit_cost')
      .eq('purchase_order_id', id)
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .order('created_at', { ascending: true });
    const vendorName = vendor?.display_name || vendor?.legal_name || 'Vendor';
    const linesHtml = (poLines || [])
      .map((l, i) => `<tr><td>${i + 1}</td><td>${String(l.description || '')}</td><td style="text-align:right">${Number(l.quantity || 0)}</td><td style="text-align:right">${Number(l.unit_cost || 0).toFixed(2)}</td></tr>`)
      .join('');
    try {
      const { id: emailId } = await sendEmailViaResend({
        from: await resolveDefaultFrom(),
        to: [to],
        subject: `Purchase order ${po.po_number} — ${Number(po.total || 0).toFixed(2)} ${po.currency || 'USD'}`,
        html: `<p>Hello ${vendorName},</p><p>Please find our purchase order ${po.po_number} below. Order date ${po.order_date || ''}${po.expected_date ? `, expected delivery ${po.expected_date}` : ''}. Total ${Number(po.total || 0).toFixed(2)} ${po.currency || 'USD'}.</p><table><thead><tr><th>#</th><th>Item</th><th>Qty</th><th>Unit cost</th></tr></thead><tbody>${linesHtml}</tbody></table><p>Please include the PO number on all packing slips and invoices.</p>`,
        text: `Hello ${vendorName},\n\nPurchase order ${po.po_number}. Total ${Number(po.total || 0).toFixed(2)} ${po.currency || 'USD'}. Order date ${po.order_date || ''}${po.expected_date ? `, expected delivery ${po.expected_date}` : ''}.\n\nPlease include the PO number on all packing slips and invoices.`,
      });
      const { data, error } = await supabaseAdmin()
        .from(table)
        .update({ status: 'approved' })
        .eq('id', id)
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .select('*')
        .single();
      if (error) return err('INTERNAL', error.message, 500);
      return NextResponse.json({ data, meta: { email_id: emailId }, message: 'Purchase order sent' });
    } catch (e) {
      if (e instanceof ResendNotConfiguredError) {
        return NextResponse.json(
          { error: { code: 'EMAIL_NOT_CONFIGURED', message: e.message, requestId: crypto.randomUUID() } },
          { status: 502 },
        );
      }
      const message = e instanceof Error ? e.message : String(e);
      return NextResponse.json(
        { error: { code: 'EMAIL_DELIVERY_FAILED', message, requestId: crypto.randomUUID() } },
        { status: 502 },
      );
    }
  }

  // SalesOrder: send the customer an order confirmation via Resend.
  // erp_orders has no 'sent' status or sent_at column, and sending a
  // confirmation must not move fulfillment state — the order row is
  // returned unchanged, with the email id in meta.
  if (table === 'erp_orders') {
    const sb = supabaseAdmin();
    const { data: order } = await sb
      .from('erp_orders')
      .select('id, order_number, crm_customer_id, customer_email, total, currency, order_date, status')
      .eq('id', id)
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .single();
    if (!order) return err('NOT_FOUND', 'Order not found', 404);
    let to = order.customer_email as string | null;
    if (!to && order.crm_customer_id) {
      const { data: customer } = await sb
        .from('crm_customers')
        .select('email')
        .eq('id', order.crm_customer_id as string)
        .maybeSingle();
      to = (customer?.email as string) || null;
    }
    if (!to) return err('VALIDATION', 'Customer has no email address', 400);
    const { data: orderLines } = await sb
      .from('erp_order_lines')
      .select('description, quantity, unit_price')
      .eq('order_id', id)
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .order('created_at', { ascending: true });
    const linesHtml = (orderLines || [])
      .map((l, i) => `<tr><td>${i + 1}</td><td>${String(l.description || '')}</td><td style="text-align:right">${Number(l.quantity || 0)}</td><td style="text-align:right">${Number(l.unit_price || 0).toFixed(2)}</td></tr>`)
      .join('');
    try {
      const { id: emailId } = await sendEmailViaResend({
        from: await resolveDefaultFrom(),
        to: [to],
        subject: `Order confirmation ${order.order_number} — ${Number(order.total || 0).toFixed(2)} ${order.currency || 'USD'}`,
        html: `<p>Thank you for your order.</p><p>Order ${order.order_number} placed ${order.order_date || ''}. Total ${Number(order.total || 0).toFixed(2)} ${order.currency || 'USD'}.</p><table><thead><tr><th>#</th><th>Item</th><th>Qty</th><th>Unit price</th></tr></thead><tbody>${linesHtml}</tbody></table>`,
        text: `Thank you for your order.\n\nOrder ${order.order_number}. Total ${Number(order.total || 0).toFixed(2)} ${order.currency || 'USD'}.`,
      });
      return NextResponse.json({ data: order, meta: { email_id: emailId }, message: 'Order confirmation sent' });
    } catch (e) {
      if (e instanceof ResendNotConfiguredError) {
        return NextResponse.json(
          { error: { code: 'EMAIL_NOT_CONFIGURED', message: e.message, requestId: crypto.randomUUID() } },
          { status: 502 },
        );
      }
      const message = e instanceof Error ? e.message : String(e);
      return NextResponse.json(
        { error: { code: 'EMAIL_DELIVERY_FAILED', message, requestId: crypto.randomUUID() } },
        { status: 502 },
      );
    }
  }

  const { data, error } = await supabaseAdmin().from(table).update({ status: 'sent', sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', id).eq('tenant_id', DEFAULT_TENANT_ID).select('*').single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data, message: 'Document sent' });
}
