import { NextRequest, NextResponse } from 'next/server';
import type { CreateAction } from '@/lib/contracts';

/** GET /api/v1/create-menu?module=crm&tab=parties (spec §B.4.2)
 *  Returns the create actions filtered by module context. */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const moduleName = searchParams.get('module') || 'all';

  const ALL_ACTIONS: CreateAction[] = [
    // Customers group
    { id: 'invoice', label: 'Invoice', icon: 'receipt_long', group: 'Customers', surface: 'page', entity: 'document', documentType: 'Invoice', envelopeKeys: ['party_id', 'order_id'] },
    { id: 'estimate', label: 'Estimate', icon: 'request_quote', group: 'Customers', surface: 'page', entity: 'document', documentType: 'Estimate', envelopeKeys: ['party_id'] },
    { id: 'sales_receipt', label: 'Sales receipt', icon: 'point_of_sale', group: 'Customers', surface: 'page', entity: 'document', documentType: 'SalesReceipt', envelopeKeys: ['party_id', 'order_id'] },
    { id: 'credit_memo', label: 'Credit memo', icon: 'credit_card', group: 'Customers', surface: 'page', entity: 'document', documentType: 'CreditMemo', envelopeKeys: ['invoice_id'] },
    { id: 'payment_link', label: 'Payment link', icon: 'link', group: 'Customers', surface: 'modal', entity: 'payment_link', envelopeKeys: ['party_id', 'invoice_id'] },
    { id: 'receive_payment', label: 'Receive payment', icon: 'payments', group: 'Customers', surface: 'modal', entity: 'payment', envelopeKeys: ['party_id'] },
    { id: 'statement', label: 'Statement', icon: 'description', group: 'Customers', surface: 'workspace', entity: 'statement', envelopeKeys: ['party_id'] },
    { id: 'add_customer', label: 'Add customer', icon: 'person_add', group: 'Customers', surface: 'drawer', entity: 'party', envelopeKeys: [] },
    // Vendors group
    { id: 'expense', label: 'Expense', icon: 'credit_card', group: 'Vendors', surface: 'drawer', entity: 'document', documentType: 'Expense', envelopeKeys: ['party_id'] },
    { id: 'check', label: 'Check', icon: 'payments', group: 'Vendors', surface: 'drawer', entity: 'document', documentType: 'Check', envelopeKeys: ['party_id'] },
    { id: 'bill', label: 'Bill', icon: 'description', group: 'Vendors', surface: 'page', entity: 'document', documentType: 'Bill', envelopeKeys: ['party_id', 'po_id'] },
    { id: 'pay_bills', label: 'Pay bills', icon: 'payments', group: 'Vendors', surface: 'workspace', entity: 'bill_payment', envelopeKeys: [] },
    { id: 'purchase_order', label: 'Purchase order', icon: 'shopping_bag', group: 'Vendors', surface: 'page', entity: 'document', documentType: 'PurchaseOrder', envelopeKeys: ['party_id', 'item_id'] },
    { id: 'vendor_credit', label: 'Vendor credit', icon: 'credit_card', group: 'Vendors', surface: 'page', entity: 'document', documentType: 'VendorCredit', envelopeKeys: ['bill_id'] },
    { id: 'add_vendor', label: 'Add vendor', icon: 'person_add', group: 'Vendors', surface: 'drawer', entity: 'party', envelopeKeys: [] },
    // Team group
    { id: 'add_contractor', label: 'Add contractor', icon: 'person_add', group: 'Team', surface: 'drawer', entity: 'party', envelopeKeys: [] },
    { id: 'time_entry', label: 'Time entry', icon: 'schedule', group: 'Team', surface: 'modal', entity: 'time_entry', envelopeKeys: ['party_id'] },
    // Books group
    { id: 'task', label: 'Task', icon: 'task_alt', group: 'Books', surface: 'drawer', entity: 'task', envelopeKeys: [] },
    { id: 'bank_deposit', label: 'Bank deposit', icon: 'account_balance', group: 'Books', surface: 'workspace', entity: 'deposit', envelopeKeys: [] },
    { id: 'journal_entry', label: 'Journal entry', icon: 'menu_book', group: 'Books', surface: 'page', entity: 'document', documentType: 'JournalEntry', envelopeKeys: ['account_id'] },
    { id: 'transfer', label: 'Transfer', icon: 'swap_horiz', group: 'Books', surface: 'modal', entity: 'transfer', envelopeKeys: ['account_id'] },
    { id: 'reconcile', label: 'Reconcile', icon: 'fact_check', group: 'Books', surface: 'workspace', entity: 'reconciliation', envelopeKeys: ['account_id'] },
    { id: 'add_product', label: 'Add product/service', icon: 'inventory_2', group: 'Books', surface: 'drawer', entity: 'item', envelopeKeys: ['category', 'supplier'] },
    { id: 'add_account', label: 'Add account', icon: 'account_tree', group: 'Books', surface: 'drawer', entity: 'account', envelopeKeys: [] },
    // Catalog group
    { id: 'design', label: 'Design', icon: 'palette', group: 'Catalog', surface: 'studio', entity: 'design', envelopeKeys: ['blank_id', 'collection_id'] },
    { id: 'product', label: 'Product', icon: 'inventory_2', group: 'Catalog', surface: 'drawer', entity: 'item', envelopeKeys: ['design_id'] },
    { id: 'collection', label: 'Collection', icon: 'collections_bookmark', group: 'Catalog', surface: 'studio', entity: 'collection', envelopeKeys: ['item_ids'] },
    { id: 'category', label: 'Category', icon: 'category', group: 'Catalog', surface: 'drawer', entity: 'category', envelopeKeys: ['parent_id'] },
    // Marketing group
    { id: 'banner', label: 'Banner', icon: 'view_carousel', group: 'Marketing', surface: 'drawer', entity: 'banner', envelopeKeys: ['product_id', 'collection_id'] },
    { id: 'popup', label: 'Popup', icon: 'open_in_new', group: 'Marketing', surface: 'drawer', entity: 'popup', envelopeKeys: ['segment_id'] },
    { id: 'discount_code', label: 'Discount code', icon: 'sell', group: 'Marketing', surface: 'drawer', entity: 'discount', envelopeKeys: ['product_id'] },
    { id: 'campaign', label: 'Campaign', icon: 'campaign', group: 'Marketing', surface: 'page', entity: 'campaign', envelopeKeys: ['product_id', 'design_id'] },
    { id: 'post', label: 'Post', icon: 'share', group: 'Marketing', surface: 'drawer', entity: 'post', envelopeKeys: ['product_id', 'design_id'] },
    { id: 'newsletter', label: 'Newsletter', icon: 'mail', group: 'Marketing', surface: 'page', entity: 'newsletter', envelopeKeys: ['segment_id'] },
    // Support & Orders group
    { id: 'sales_order', label: 'Sales order', icon: 'shopping_bag', group: 'Support & Orders', surface: 'page', entity: 'document', documentType: 'SalesOrder', envelopeKeys: ['party_id', 'channel_id'] },
    { id: 'rma', label: 'Return / RMA', icon: 'assignment_return', group: 'Support & Orders', surface: 'drawer', entity: 'document', documentType: 'RMA', envelopeKeys: ['order_id'] },
    { id: 'ticket', label: 'Ticket', icon: 'support_agent', group: 'Support & Orders', surface: 'drawer', entity: 'ticket', envelopeKeys: ['party_id', 'order_id'] },
    { id: 'add_note', label: 'Add note', icon: 'edit_note', group: 'Support & Orders', surface: 'modal', entity: 'note', envelopeKeys: [] },
  ];

  // Filter by module context — spec: "Create menu filters by tab context"
  if (moduleName === 'crm') {
    return NextResponse.json({ actions: ALL_ACTIONS.filter((a) => a.group === 'Customers' || a.group === 'Support & Orders') });
  }
  if (moduleName === 'finance') {
    return NextResponse.json({ actions: ALL_ACTIONS.filter((a) => a.group === 'Customers' || a.group === 'Vendors' || a.group === 'Books') });
  }
  if (moduleName === 'catalog') {
    return NextResponse.json({ actions: ALL_ACTIONS.filter((a) => a.group === 'Catalog' || a.group === 'Marketing') });
  }
  if (moduleName === 'support') {
    return NextResponse.json({ actions: ALL_ACTIONS.filter((a) => a.group === 'Support & Orders') });
  }

  return NextResponse.json({ actions: ALL_ACTIONS });
}
