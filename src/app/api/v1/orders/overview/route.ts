import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { apiError } from '@/lib/podServer';
import { toOrder } from '@/lib/orderDto';

/**
 * GET /api/v1/orders/overview — Orders overview KPIs (kpis-2.md).
 *   Orders today · Awaiting fulfillment · Shipments in transit ·
 *   Revenue MTD (revenue account lines via acct__account_amounts) ·
 *   Avg order value · Late shipments.
 * Plus the pipeline, attention items, recent orders, top products (30d),
 * activity, and the payment funnel — all from live rows, nothing hardcoded.
 */
export async function GET() {
  try {
    const sb = supabaseAdmin();
    const now = new Date();
    // America/Chicago "today" — the tenant's local day, not UTC.
    const chicagoToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    const monthStart = `${chicagoToday.slice(0, 8)}01`;
    const chicagoDay = (iso: string) =>
      new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString();

    const [{ data: orders, error }, { data: shipments }, { data: history }] = await Promise.all([
      sb.from('erp_orders').select('*').eq('tenant_id', DEFAULT_TENANT_ID).order('order_date', { ascending: false }).limit(500),
      sb.from('erp_shipments').select('id,fulfillment_id,status,delivered_at,created_at').eq('tenant_id', DEFAULT_TENANT_ID).order('created_at', { ascending: false }).limit(500),
      sb.from('erp_order_status_history').select('order_id,from_status,to_status,reason,changed_at').eq('tenant_id', DEFAULT_TENANT_ID).order('changed_at', { ascending: false }).limit(20),
    ]);
    if (error) return apiError(error.message);
    const rows = (orders || []) as Record<string, unknown>[];

    // In-production flags for the display statuses (same source as the list).
    const ids = rows.map((o) => String(o.id));
    const inProduction = new Set<string>();
    if (ids.length) {
      const [{ data: fuls }, { data: pos }] = await Promise.all([
        sb.from('erp_fulfillment_orders').select('order_id').in('order_id', ids)
          .not('status', 'in', '("cancelled","shipped","delivered","closed","completed")'),
        sb.from('fulfillment_orders').select('order_id').in('order_id', ids)
          .in('status', ['pending', 'processing', 'in_transit']),
      ]);
      (fuls || []).forEach((f) => inProduction.add(f.order_id as string));
      (pos || []).forEach((p) => inProduction.add(p.order_id as string));
    }
    const dtos = rows.map((o) => toOrder({ ...o, in_production: inProduction.has(String(o.id)) }, 0, null));

    // Orders today, by Chicago calendar day. (A string comparison against
    // "…T00:00:00-06:00" miscounts 00:00–06:00 UTC orders: their wall
    // time sorts after midnight even though they are the previous
    // Chicago evening — e.g. the two midnight-UTC SAL orders.)
    const ordersToday = dtos.filter((o) => o.orderDate && chicagoDay(o.orderDate) === chicagoToday).length;
    const awaiting = dtos.filter((o) => ['New', 'Ready to ship', 'In production', 'Needs attention'].includes(o.displayStatus)).length;
    const shipRows = (shipments || []) as Record<string, unknown>[];
    const inTransit = shipRows.filter((s) => ['in_transit', 'shipped'].includes(String(s.status)) && !s.delivered_at).length;

    // Revenue MTD — posted revenue-account activity for the current month.
    let revenueMtd = 0;
    const { data: amounts } = await sb.rpc('acct__account_amounts', {
      p_tenant_id: DEFAULT_TENANT_ID, p_from: monthStart, p_to: chicagoToday, p_entity_id: null,
    });
    if (Array.isArray(amounts)) {
      revenueMtd = (amounts as Record<string, unknown>[])
        .filter((a) => String(a.account_type) === 'revenue')
        .reduce((s, a) => s + (Number(a.activity) || 0), 0);
    }

    const monthOrders = dtos.filter((o) => o.orderDate && chicagoDay(o.orderDate) >= monthStart);
    const avgOrderValue = monthOrders.length ? monthOrders.reduce((s, o) => s + o.total, 0) / monthOrders.length : 0;

    // Late shipments — open shipment whose order's SLA date has passed.
    let lateShipments = 0;
    const fulIds = shipRows.map((s) => String(s.fulfillment_id)).filter(Boolean);
    const slaByOrder = new Map<string, string>();
    if (fulIds.length) {
      const { data: fuls } = await sb.from('erp_fulfillment_orders').select('id,order_id').in('id', fulIds);
      const orderIds = [...new Set((fuls || []).map((f) => String(f.order_id)))];
      if (orderIds.length) {
        const { data: os } = await sb.from('erp_orders').select('id,sla_due_at').in('id', orderIds);
        (os || []).forEach((o) => { if (o.sla_due_at) slaByOrder.set(String(o.id), String(o.sla_due_at)); });
        const fulToOrder = new Map((fuls || []).map((f) => [String(f.id), String(f.order_id)]));
        lateShipments = shipRows.filter((s) => {
          if (s.delivered_at) return false;
          if (!['in_transit', 'shipped'].includes(String(s.status))) return false;
          const sla = slaByOrder.get(fulToOrder.get(String(s.fulfillment_id)) || '');
          return sla ? new Date(sla) < now : false;
        }).length;
      }
    }
    const late = lateShipments;

    // Pipeline + attention + recent + payment funnel.
    const pipeline = {
      New: dtos.filter((o) => o.displayStatus === 'New').length,
      needsAttention: dtos.filter((o) => o.displayStatus === 'Needs attention').length,
      inProduction: dtos.filter((o) => o.displayStatus === 'In production').length,
      readyToShip: dtos.filter((o) => o.displayStatus === 'Ready to ship').length,
      shipped: dtos.filter((o) => o.displayStatus === 'Shipped').length,
      delivered: dtos.filter((o) => o.displayStatus === 'Delivered').length,
      returned: dtos.filter((o) => o.displayStatus === 'Returned').length,
      canceled: dtos.filter((o) => o.displayStatus === 'Canceled').length,
    };
    const attention = dtos.filter((o) => o.needsAttention).slice(0, 4).map((o) => ({
      id: o.id, orderNumber: o.orderNumber, reason: o.attentionReason || 'Review required',
    }));
    const recent = dtos.slice(0, 5).map((o) => ({
      id: o.id, orderNumber: o.orderNumber, customer: o.customerName || o.customerEmail || '—',
      total: o.total, status: o.displayStatus, orderDate: o.orderDate,
    }));
    const funnel = {
      unpaid: dtos.filter((o) => o.paymentStatus === 'unpaid').length,
      partial: dtos.filter((o) => o.paymentStatus === 'partial').length,
      paid: dtos.filter((o) => o.paymentStatus === 'paid').length,
      refunded: dtos.filter((o) => o.paymentStatus === 'refunded').length,
    };

    // Top products (30d) — aggregate live order lines by description.
    const orderIds30 = dtos.filter((o) => o.orderDate && o.orderDate >= thirtyDaysAgo).map((o) => o.id);
    let topProducts: { name: string; units: number; revenue: number }[] = [];
    if (orderIds30.length) {
      const { data: lines } = await sb.from('erp_order_lines')
        .select('description,quantity,unit_price,line_total').in('order_id', orderIds30);
      const agg = new Map<string, { units: number; revenue: number }>();
      (lines || []).forEach((l) => {
        const name = String(l.description || 'Unnamed item');
        const a = agg.get(name) || { units: 0, revenue: 0 };
        a.units += Number(l.quantity) || 0;
        a.revenue += Number(l.line_total ?? (Number(l.quantity) || 0) * (Number(l.unit_price) || 0)) || 0;
        agg.set(name, a);
      });
      topProducts = [...agg.entries()].map(([name, a]) => ({ name, units: a.units, revenue: +a.revenue.toFixed(2) }))
        .sort((a, b) => b.revenue - a.revenue).slice(0, 5);
    }

    // On-time rate + avg fulfillment time, from real status history + ships.
    const shippedCount = dtos.filter((o) => ['Shipped', 'Delivered'].includes(o.displayStatus)).length;
    const lateCount = dtos.filter((o) => o.slaDueAt && new Date(o.slaDueAt) < now && ['Shipped', 'Delivered'].includes(o.displayStatus)).length;
    const onTimeRate = shippedCount ? Math.round(((shippedCount - lateCount) / shippedCount) * 100) : null;
    let avgFulfillmentDays: number | null = null;
    const shipTimes = dtos.filter((o) => o.orderDate).map((o) => {
      const h = (history || []).find((x) => String(x.order_id) === o.id && ['shipped', 'fulfilled'].includes(String(x.to_status).toLowerCase()));
      if (!h) return null;
      return (new Date(String(h.changed_at)).getTime() - new Date(o.orderDate as string).getTime()) / 86400000;
    }).filter((v): v is number => v !== null && v >= 0);
    if (shipTimes.length) avgFulfillmentDays = +(shipTimes.reduce((s, v) => s + v, 0) / shipTimes.length).toFixed(1);

    const activity = ((history || []) as Record<string, unknown>[]).slice(0, 4).map((h) => {
      const o = dtos.find((d) => d.id === String(h.order_id));
      return {
        orderNumber: o?.orderNumber || String(h.order_id).slice(0, 8),
        text: `Order ${o?.orderNumber || ''} ${String(h.to_status || '')}`,
        time: String(h.changed_at || '').slice(0, 10),
      };
    });

    return NextResponse.json({ data: {
      kpis: {
        ordersToday, awaitingFulfillment: awaiting, shipmentsInTransit: inTransit,
        revenueMtd: +revenueMtd.toFixed(2), avgOrderValue: +avgOrderValue.toFixed(2), lateShipments: late,
      },
      pipeline, attention, recent, topProducts, funnel, activity,
      onTimeRate, avgFulfillmentDays,
      pastSla: dtos.filter((o) => o.slaDueAt && new Date(o.slaDueAt) < now && !['Shipped', 'Delivered', 'Canceled', 'Returned'].includes(o.displayStatus)).length,
      totalOrders: dtos.length,
    } });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to load orders overview.');
  }
}
