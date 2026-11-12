import { NextRequest, NextResponse } from 'next/server';
import type { MenuAction } from '@/lib/contracts';

/** GET /api/v1/actions/{type}/{id}?surface=list (spec §B.4.2)
 *  Returns the right-click/context menu actions for a record.
 *  Follows the 8-section grammar (spec §1.7). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await params;

  const isDocument = ['invoice', 'bill', 'estimate', 'purchase_order', 'sales_receipt', 'credit_memo', 'vendor_credit', 'rma', 'order', 'journal_entry', 'expense', 'check'].includes(type);
  const isParty = type === 'party' || type === 'customer' || type === 'vendor' || type === 'supplier' || type === 'lead';

  const actions: MenuAction[] = [];

  // Section 1: Open / Edit / Duplicate
  actions.push(
    { id: 'open', label: 'Open', icon: 'open_in_new', section: 'open' },
    { id: 'edit', label: 'Edit', icon: 'edit', section: 'open' },
    { id: 'duplicate', label: 'Duplicate', icon: 'content_copy', section: 'open' },
  );

  // Section 2: Create from this (cross-module)
  if (isDocument) {
    actions.push(
      { id: 'create_credit_memo', label: 'Credit memo', icon: 'credit_card', section: 'create' },
      { id: 'create_rma', label: 'Return / RMA', icon: 'assignment_return', section: 'create' },
      { id: 'create_ticket', label: 'Ticket', icon: 'support_agent', section: 'create' },
      { id: 'create_task', label: 'Task (follow up)', icon: 'task_alt', section: 'create' },
      { id: 'create_payment_link', label: 'Payment link', icon: 'link', section: 'create' },
    );
  }
  if (isParty) {
    actions.push(
      { id: 'create_invoice', label: 'Invoice', icon: 'receipt_long', section: 'create' },
      { id: 'create_estimate', label: 'Estimate', icon: 'request_quote', section: 'create' },
      { id: 'create_sales_order', label: 'Sales order', icon: 'shopping_bag', section: 'create' },
      { id: 'create_bill', label: 'Bill', icon: 'description', section: 'create' },
      { id: 'create_po', label: 'Purchase order', icon: 'shopping_bag', section: 'create' },
      { id: 'create_expense', label: 'Expense', icon: 'credit_card', section: 'create' },
      { id: 'create_ticket', label: 'Ticket', icon: 'support_agent', section: 'create' },
      { id: 'create_task', label: 'Task', icon: 'task_alt', section: 'create' },
      { id: 'create_note', label: 'Note', icon: 'edit_note', section: 'create' },
    );
  }

  // Section 3: Communicate
  if (isDocument) {
    actions.push(
      { id: 'send', label: 'Send', icon: 'send', section: 'communicate' },
      { id: 'remind', label: 'Remind', icon: 'notifications', section: 'communicate' },
      { id: 'email_customer', label: 'Email customer', icon: 'mail', section: 'communicate' },
      { id: 'add_note', label: 'Add note', icon: 'edit_note', section: 'communicate' },
    );
  }
  if (isParty) {
    actions.push(
      { id: 'email', label: 'Email', icon: 'mail', section: 'communicate' },
      { id: 'call', label: 'Call', icon: 'call', section: 'communicate' },
      { id: 'add_note', label: 'Add note', icon: 'edit_note', section: 'communicate' },
    );
  }

  // Section 4: Money
  if (isDocument) {
    actions.push(
      { id: 'record_payment', label: 'Record payment', icon: 'payments', section: 'money' },
      { id: 'refund', label: 'Refund', icon: 'currency_exchange', section: 'money' },
      { id: 'mark_paid', label: 'Mark paid', icon: 'check_circle', section: 'money' },
    );
  }

  // Section 5: Print / Export
  actions.push(
    { id: 'print', label: 'Print', icon: 'print', section: 'print' },
    { id: 'pdf', label: 'PDF', icon: 'picture_as_pdf', section: 'print' },
  );
  if (isDocument) {
    actions.push({ id: 'download_attachment', label: 'Download attachment', icon: 'download', section: 'print' });
  }

  // Section 6: Organize
  actions.push(
    { id: 'tag', label: 'Tag', icon: 'label', section: 'organize' },
    { id: 'favorite', label: 'Favorite', icon: 'star', section: 'organize' },
  );
  if (isParty) {
    actions.push({ id: 'add_role', label: 'Add role…', icon: 'person_add', section: 'organize' });
  }

  // Section 7: Danger
  if (isDocument) {
    actions.push(
      { id: 'void', label: 'Void', icon: 'block', section: 'danger', confirm: { title: 'Void', message: 'Void this document? It will be kept for audit but cannot be edited.', requireReason: true } },
      { id: 'delete', label: 'Delete', icon: 'delete', section: 'danger', confirm: { title: 'Delete', message: 'Are you sure? This cannot be undone.' } },
    );
  }
  if (isParty) {
    actions.push(
      { id: 'archive', label: 'Archive', icon: 'archive', section: 'danger', confirm: { title: 'Archive', message: 'Archive this record? It will be hidden from active lists.' } },
    );
  }

  return NextResponse.json({ actions });
}
