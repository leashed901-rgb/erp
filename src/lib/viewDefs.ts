/**
 * viewDefs.ts — ViewDef configs for every list view in the CRM.
 * TableShell renders any list from these configs. (spec §B.5)
 */
import type { ViewDef } from './contracts';

export const VIEW_DEFS: Record<string, ViewDef> = {
  // ── Sales ──────────────────────────────────────────────────
  invoices: {
    id: 'invoices', entity: 'document', documentType: 'Invoice', title: 'Invoices',
    columns: [
      { id: 'number', label: 'Invoice #', kind: 'text', sortable: true, defaultVisible: true },
      { id: 'customer', label: 'Customer', kind: 'party', sortable: true, defaultVisible: true, roleFilter: 'Customer' },
      { id: 'date', label: 'Invoice date', kind: 'date', sortable: true, defaultVisible: true },
      { id: 'dueDate', label: 'Due date', kind: 'date', sortable: true, defaultVisible: true },
      { id: 'total', label: 'Amount', kind: 'money', sortable: true, defaultVisible: true, align: 'right' },
      { id: 'balance', label: 'Balance due', kind: 'money', sortable: true, defaultVisible: true, align: 'right' },
      { id: 'status', label: 'Status', kind: 'status', sortable: true, defaultVisible: true },
      { id: 'source', label: 'Source', kind: 'pill', defaultVisible: false },
    ],
    defaultSort: 'date',
    statusTabs: [
      { id: 'all', label: 'All', filter: {} },
      { id: 'draft', label: 'Draft', filter: { status: 'DRAFT' } },
      { id: 'unpaid', label: 'Unpaid', filter: { status: 'OPEN' } },
      { id: 'overdue', label: 'Overdue', filter: { status: 'OVERDUE' } },
      { id: 'paid', label: 'Paid', filter: { status: 'PAID' } },
    ],
    filters: [
      { id: 'customer', label: 'Customer', kind: 'party' },
      { id: 'dates', label: 'Invoice date', kind: 'date_range' },
      { id: 'tags', label: 'Tags', kind: 'tag' },
    ],
    rowClick: 'page',
    bulkActions: ['send', 'remind', 'print', 'tag', 'export', 'record_payment'],
    supportsImport: false, supportsExport: true,
    totalsFooter: ['sum:total', 'sum:balance'],
    apiPath: '/api/invoices',
  },

  // ── Expenses & Bills ────────────────────────────────────────
  bills: {
    id: 'bills', entity: 'document', documentType: 'Bill', title: 'Bills',
    columns: [
      { id: 'vendor', label: 'Vendor', kind: 'party', sortable: true, defaultVisible: true, roleFilter: 'Vendor' },
      { id: 'number', label: 'Bill no', kind: 'text', sortable: true, defaultVisible: true },
      { id: 'issueDate', label: 'Bill date', kind: 'date', sortable: true, defaultVisible: true },
      { id: 'dueDate', label: 'Due date', kind: 'date', sortable: true, defaultVisible: true },
      { id: 'total', label: 'Bill amount', kind: 'money', sortable: true, defaultVisible: true, align: 'right' },
      { id: 'balance', label: 'Open balance', kind: 'money', sortable: true, defaultVisible: true, align: 'right' },
      { id: 'status', label: 'Status', kind: 'status', sortable: true, defaultVisible: true },
      { id: 'approval', label: 'Approval', kind: 'status', defaultVisible: true },
    ],
    defaultSort: 'dueDate',
    statusTabs: [
      { id: 'review', label: 'For review', filter: { status: 'ForReview' } },
      { id: 'unpaid', label: 'Unpaid', filter: { status: 'unpaid' } },
      { id: 'paid', label: 'Paid', filter: { status: 'paid' } },
    ],
    filters: [
      { id: 'vendor', label: 'Vendor', kind: 'party' },
      { id: 'dates', label: 'Bill date', kind: 'date_range' },
      { id: 'tags', label: 'Tags', kind: 'tag' },
    ],
    rowClick: 'page',
    bulkActions: ['approve', 'pay', 'categorize', 'tag', 'print_checks'],
    supportsImport: true, supportsExport: true,
    totalsFooter: ['sum:total', 'sum:balance'],
    apiPath: '/api/crm/bills',
  },

  // ── CRM: Parties ────────────────────────────────────────────
  parties: {
    id: 'parties', entity: 'party', title: 'Parties',
    columns: [
      { id: 'name', label: 'Name', kind: 'text', sortable: true, defaultVisible: true },
      { id: 'roles', label: 'Role', kind: 'pill', defaultVisible: true },
      { id: 'email', label: 'Email', kind: 'text', sortable: true, defaultVisible: true },
      { id: 'phone', label: 'Phone', kind: 'text', defaultVisible: true },
      { id: 'balance', label: 'Open balance', kind: 'money', sortable: true, defaultVisible: true, align: 'right' },
      { id: 'lifetimeValue', label: 'Lifetime value', kind: 'money', sortable: true, defaultVisible: true, align: 'right' },
      { id: 'lastActivity', label: 'Last activity', kind: 'date', sortable: true, defaultVisible: true },
      { id: 'segments', label: 'Segments', kind: 'pill', defaultVisible: false },
    ],
    defaultSort: 'lastActivity',
    statusTabs: [
      { id: 'all', label: 'All', filter: {} },
      { id: 'customers', label: 'Customers', filter: { role: 'Customer' } },
      { id: 'vendors', label: 'Vendors', filter: { role: 'Vendor' } },
      { id: 'suppliers', label: 'Suppliers', filter: { role: 'Supplier' } },
      { id: 'contractors', label: 'Contractors', filter: { role: 'Contractor' } },
      { id: 'sellers', label: 'Sellers', filter: { role: 'Seller' } },
      { id: 'leads', label: 'Leads', filter: { role: 'Lead' } },
      { id: 'archived', label: 'Archived', filter: { archived: true } },
    ],
    filters: [
      { id: 'role', label: 'Role', kind: 'select', options: [
        { value: 'Customer', label: 'Customer' },
        { value: 'Vendor', label: 'Vendor' },
        { value: 'Supplier', label: 'Supplier' },
        { value: 'Contractor', label: 'Contractor' },
        { value: 'Seller', label: 'Seller' },
        { value: 'Lead', label: 'Lead' },
      ]},
      { id: 'segment', label: 'Segment', kind: 'tag' },
    ],
    rowClick: 'drawer',
    bulkActions: ['tag', 'export', 'archive'],
    supportsImport: true, supportsExport: true,
    apiPath: '/api/parties',
  },

  // ── CRM: Leads ──────────────────────────────────────────────
  leads: {
    id: 'leads', entity: 'lead', title: 'Leads',
    columns: [
      { id: 'contactName', label: 'Contact', kind: 'text', sortable: true, defaultVisible: true },
      { id: 'email', label: 'Email', kind: 'text', defaultVisible: true },
      { id: 'phone', label: 'Phone', kind: 'text', defaultVisible: true },
      { id: 'source', label: 'Source', kind: 'text', sortable: true, defaultVisible: true },
      { id: 'status', label: 'Status', kind: 'status', sortable: true, defaultVisible: true },
      { id: 'score', label: 'Score', kind: 'number', sortable: true, defaultVisible: true, align: 'right' },
      { id: 'priority', label: 'Priority', kind: 'pill', defaultVisible: true },
      { id: 'nextFollowUp', label: 'Next follow-up', kind: 'date', sortable: true, defaultVisible: true },
    ],
    defaultSort: 'nextFollowUp',
    statusTabs: [
      { id: 'all', label: 'All', filter: {} },
      { id: 'new', label: 'New', filter: { status: 'new' } },
      { id: 'contacted', label: 'Contacted', filter: { status: 'contacted' } },
      { id: 'qualified', label: 'Qualified', filter: { status: 'qualified' } },
      { id: 'converted', label: 'Converted', filter: { status: 'converted' } },
      { id: 'lost', label: 'Lost', filter: { status: 'lost' } },
    ],
    filters: [
      { id: 'source', label: 'Source', kind: 'text' },
      { id: 'priority', label: 'Priority', kind: 'select', options: [
        { value: 'high', label: 'High' },
        { value: 'medium', label: 'Medium' },
        { value: 'low', label: 'Low' },
      ]},
    ],
    rowClick: 'drawer',
    bulkActions: ['assign', 'tag', 'export'],
    supportsImport: true, supportsExport: true,
    apiPath: '/api/crm/leads',
  },

  // ── CRM: Tasks ──────────────────────────────────────────────
  tasks: {
    id: 'tasks', entity: 'task', title: 'Tasks',
    columns: [
      { id: 'title', label: 'Task', kind: 'text', sortable: true, defaultVisible: true },
      { id: 'priority', label: 'Priority', kind: 'pill', sortable: true, defaultVisible: true },
      { id: 'status', label: 'Status', kind: 'status', sortable: true, defaultVisible: true },
      { id: 'assignee', label: 'Assignee', kind: 'party', defaultVisible: true },
      { id: 'dueDate', label: 'Due date', kind: 'date', sortable: true, defaultVisible: true },
      { id: 'related', label: 'Related', kind: 'pill', defaultVisible: true },
    ],
    defaultSort: 'dueDate',
    statusTabs: [
      { id: 'all', label: 'All', filter: {} },
      { id: 'open', label: 'Open', filter: { status: 'open' } },
      { id: 'overdue', label: 'Overdue', filter: { status: 'overdue' } },
      { id: 'done', label: 'Done', filter: { status: 'done' } },
    ],
    filters: [
      { id: 'assignee', label: 'Assignee', kind: 'party' },
      { id: 'priority', label: 'Priority', kind: 'select', options: [
        { value: 'high', label: 'High' },
        { value: 'medium', label: 'Medium' },
        { value: 'low', label: 'Low' },
      ]},
    ],
    rowClick: 'drawer',
    bulkActions: ['complete', 'assign', 'tag'],
    apiPath: '/api/crm/tasks',
  },

  // ── CRM: Appointments ───────────────────────────────────────
  appointments: {
    id: 'appointments', entity: 'appointment', title: 'Appointments',
    columns: [
      { id: 'number', label: 'Appt #', kind: 'text', sortable: true, defaultVisible: true },
      { id: 'customer', label: 'Customer', kind: 'party', defaultVisible: true },
      { id: 'service', label: 'Service', kind: 'text', defaultVisible: true },
      { id: 'staff', label: 'Staff', kind: 'party', defaultVisible: true },
      { id: 'startsAt', label: 'Starts', kind: 'date', sortable: true, defaultVisible: true },
      { id: 'endsAt', label: 'Ends', kind: 'date', defaultVisible: true },
      { id: 'status', label: 'Status', kind: 'status', sortable: true, defaultVisible: true },
    ],
    defaultSort: 'startsAt',
    statusTabs: [
      { id: 'all', label: 'All', filter: {} },
      { id: 'scheduled', label: 'Scheduled', filter: { status: 'scheduled' } },
      { id: 'confirmed', label: 'Confirmed', filter: { status: 'confirmed' } },
      { id: 'completed', label: 'Completed', filter: { status: 'completed' } },
      { id: 'cancelled', label: 'Cancelled', filter: { status: 'cancelled' } },
      { id: 'no_show', label: 'No show', filter: { status: 'no_show' } },
    ],
    filters: [
      { id: 'staff', label: 'Staff', kind: 'party' },
      { id: 'dates', label: 'Date', kind: 'date_range' },
    ],
    rowClick: 'drawer',
    bulkActions: ['confirm', 'cancel', 'export'],
    apiPath: '/api/crm/appointments',
  },

  // ── CRM: Deals ──────────────────────────────────────────────
  deals: {
    id: 'deals', entity: 'deal', title: 'Deals',
    columns: [
      { id: 'name', label: 'Deal', kind: 'text', sortable: true, defaultVisible: true },
      { id: 'customer', label: 'Customer', kind: 'party', defaultVisible: true },
      { id: 'amount', label: 'Amount', kind: 'money', sortable: true, defaultVisible: true, align: 'right' },
      { id: 'stage', label: 'Stage', kind: 'status', sortable: true, defaultVisible: true },
      { id: 'probability', label: 'Probability', kind: 'number', defaultVisible: true, align: 'right' },
      { id: 'expectedClose', label: 'Expected close', kind: 'date', sortable: true, defaultVisible: true },
      { id: 'owner', label: 'Owner', kind: 'party', defaultVisible: true },
    ],
    defaultSort: 'expectedClose',
    statusTabs: [
      { id: 'open', label: 'Open', filter: { status: 'open' } },
      { id: 'won', label: 'Won', filter: { status: 'won' } },
      { id: 'lost', label: 'Lost', filter: { status: 'lost' } },
    ],
    filters: [
      { id: 'owner', label: 'Owner', kind: 'party' },
      { id: 'stage', label: 'Stage', kind: 'select' },
    ],
    rowClick: 'drawer',
    bulkActions: ['assign', 'tag', 'export'],
    apiPath: '/api/crm/deals',
  },

  // ── Catalog: Products ────────────────────────────────────────
  products: {
    id: 'products', entity: 'item', title: 'Products & Variants',
    columns: [
      { id: 'image', label: '', kind: 'image', defaultVisible: true },
      { id: 'name', label: 'Name', kind: 'text', sortable: true, defaultVisible: true },
      { id: 'sku', label: 'SKU', kind: 'text', sortable: true, defaultVisible: true },
      { id: 'type', label: 'Type', kind: 'pill', defaultVisible: true },
      { id: 'category', label: 'Category', kind: 'text', sortable: true, defaultVisible: true },
      { id: 'status', label: 'Status', kind: 'status', sortable: true, defaultVisible: true },
      { id: 'price', label: 'Price', kind: 'money', sortable: true, defaultVisible: true, align: 'right' },
      { id: 'cost', label: 'Cost', kind: 'money', sortable: true, defaultVisible: false, align: 'right' },
      { id: 'margin', label: 'Margin %', kind: 'number', sortable: true, defaultVisible: false, align: 'right' },
      { id: 'stock', label: 'Stock', kind: 'pill', defaultVisible: true },
      { id: 'supplier', label: 'Supplier', kind: 'party', defaultVisible: false },
      { id: 'updated', label: 'Updated', kind: 'date', sortable: true, defaultVisible: true },
    ],
    defaultSort: 'name',
    statusTabs: [
      { id: 'all', label: 'Products', filter: {} },
      { id: 'listings', label: 'Listings', filter: { type: 'Listing' } },
      { id: 'blanks', label: 'Blanks', filter: { type: 'Blank' } },
      { id: 'bundles', label: 'Bundles', filter: { type: 'Bundle' } },
      { id: 'published', label: 'Published', filter: { status: 'Published' } },
      { id: 'review', label: 'Review', filter: { status: 'Draft' } },
    ],
    filters: [
      { id: 'category', label: 'Category', kind: 'text' },
      { id: 'channel', label: 'Channel', kind: 'select' },
      { id: 'supplier', label: 'Supplier', kind: 'party' },
      { id: 'status', label: 'Status', kind: 'select', options: [
        { value: 'Draft', label: 'Draft' },
        { value: 'Published', label: 'Published' },
        { value: 'Archived', label: 'Archived' },
      ]},
    ],
    rowClick: 'drawer',
    bulkActions: ['publish', 'reprice', 'add_to_collection', 'assign_category', 'push_to_channels', 'archive'],
    supportsImport: true, supportsExport: true,
    apiPath: '/api/products',
  },

  // ── Orders ──────────────────────────────────────────────────
  orders: {
    id: 'orders', entity: 'order', title: 'Orders',
    columns: [
      { id: 'number', label: 'Order #', kind: 'text', sortable: true, defaultVisible: true },
      { id: 'channel', label: 'Channel', kind: 'pill', defaultVisible: true },
      { id: 'customer', label: 'Customer', kind: 'party', defaultVisible: true },
      { id: 'date', label: 'Date', kind: 'date', sortable: true, defaultVisible: true },
      { id: 'items', label: 'Items', kind: 'count', defaultVisible: true },
      { id: 'total', label: 'Total', kind: 'money', sortable: true, defaultVisible: true, align: 'right' },
      { id: 'payment', label: 'Payment', kind: 'pill', defaultVisible: true },
      { id: 'fulfillment', label: 'Fulfillment', kind: 'pill', defaultVisible: true },
      { id: 'invoice', label: 'Invoice', kind: 'pill', defaultVisible: false },
      { id: 'issue', label: 'Issue', kind: 'pill', defaultVisible: true },
    ],
    defaultSort: 'date',
    statusTabs: [
      { id: 'all', label: 'All', filter: {} },
      { id: 'new', label: 'New', filter: { status: 'new' } },
      { id: 'attention', label: 'Needs attention', filter: { status: 'attention' } },
      { id: 'production', label: 'In production', filter: { status: 'production' } },
      { id: 'ready', label: 'Ready to ship', filter: { status: 'ready' } },
      { id: 'shipped', label: 'Shipped', filter: { status: 'shipped' } },
      { id: 'delivered', label: 'Delivered', filter: { status: 'delivered' } },
      { id: 'returned', label: 'Returned', filter: { status: 'returned' } },
      { id: 'canceled', label: 'Canceled', filter: { status: 'canceled' } },
    ],
    filters: [
      { id: 'channel', label: 'Channel', kind: 'select' },
      { id: 'dates', label: 'Date', kind: 'date_range' },
    ],
    rowClick: 'page',
    bulkActions: ['batch_slips', 'mark_shipped', 'push_to_supplier', 'tag', 'export'],
    supportsImport: false, supportsExport: true,
    apiPath: '/api/orders',
  },

  // ── Support: Tickets ────────────────────────────────────────
  tickets: {
    id: 'tickets', entity: 'ticket', title: 'Tickets',
    columns: [
      { id: 'number', label: 'Ticket #', kind: 'text', sortable: true, defaultVisible: true },
      { id: 'subject', label: 'Subject', kind: 'text', defaultVisible: true },
      { id: 'requester', label: 'Requester', kind: 'party', defaultVisible: true },
      { id: 'channel', label: 'Channel', kind: 'pill', defaultVisible: true },
      { id: 'priority', label: 'Priority', kind: 'pill', sortable: true, defaultVisible: true },
      { id: 'status', label: 'Status', kind: 'status', sortable: true, defaultVisible: true },
      { id: 'assignee', label: 'Assignee', kind: 'party', defaultVisible: true },
      { id: 'sla', label: 'SLA', kind: 'pill', defaultVisible: true },
      { id: 'related', label: 'Related', kind: 'pill', defaultVisible: true },
      { id: 'updated', label: 'Updated', kind: 'date', sortable: true, defaultVisible: true },
    ],
    defaultSort: 'updated',
    statusTabs: [
      { id: 'all', label: 'All', filter: {} },
      { id: 'new', label: 'New', filter: { status: 'new' } },
      { id: 'open', label: 'Open', filter: { status: 'open' } },
      { id: 'pending', label: 'Pending', filter: { status: 'pending' } },
      { id: 'solved', label: 'Solved', filter: { status: 'solved' } },
      { id: 'attention', label: 'Attention', filter: { status: 'attention' } },
    ],
    filters: [
      { id: 'channel', label: 'Channel', kind: 'select' },
      { id: 'priority', label: 'Priority', kind: 'select', options: [
        { value: 'urgent', label: 'Urgent' },
        { value: 'high', label: 'High' },
        { value: 'normal', label: 'Normal' },
        { value: 'low', label: 'Low' },
      ]},
      { id: 'assignee', label: 'Assignee', kind: 'party' },
    ],
    rowClick: 'page',
    bulkActions: ['assign', 'merge', 'tag', 'apply_macro', 'close'],
    apiPath: '/api/crm/conversations',
  },

  // ── Marketing: Discount codes ───────────────────────────────
  discounts: {
    id: 'discounts', entity: 'discount', title: 'Discount Codes',
    columns: [
      { id: 'code', label: 'Code', kind: 'text', sortable: true, defaultVisible: true },
      { id: 'type', label: 'Type', kind: 'pill', defaultVisible: true },
      { id: 'value', label: 'Value', kind: 'money', defaultVisible: true, align: 'right' },
      { id: 'window', label: 'Window', kind: 'date', defaultVisible: true },
      { id: 'usage', label: 'Usage / limit', kind: 'count', defaultVisible: true },
      { id: 'status', label: 'Status', kind: 'status', sortable: true, defaultVisible: true },
      { id: 'revenue', label: 'Revenue', kind: 'money', defaultVisible: true, align: 'right' },
    ],
    defaultSort: 'code',
    statusTabs: [
      { id: 'active', label: 'Active', filter: { status: 'active' } },
      { id: 'scheduled', label: 'Scheduled', filter: { status: 'scheduled' } },
      { id: 'expired', label: 'Expired', filter: { status: 'expired' } },
      { id: 'paused', label: 'Paused', filter: { status: 'paused' } },
    ],
    filters: [
      { id: 'type', label: 'Type', kind: 'select', options: [
        { value: 'percent', label: 'Percent' },
        { value: 'fixed', label: 'Fixed' },
        { value: 'bogo', label: 'BOGO' },
        { value: 'shipping', label: 'Free shipping' },
      ]},
    ],
    rowClick: 'drawer',
    bulkActions: ['pause', 'duplicate', 'export'],
    apiPath: '/api/marketing/discounts',
  },
};
