/**
 * documentDefs.ts — DocumentDef configs for every document type.
 * The Document Engine renders any document from these configs.
 * (spec §1.1: "Build once" — Invoice, Bill, PO, etc. differ only by config)
 */
import type { DocumentDef, DocumentType } from './contracts';

export const DOCUMENT_DEFS: Record<DocumentType, DocumentDef> = {
  Invoice: {
    type: 'Invoice', label: 'Invoice', numberPrefix: 'INV-', partyLabel: 'Customer', partyRole: 'Customer',
    dateLabel: 'Invoice date', dueLabel: 'Due date',
    lineColumns: [
      { key: 'description', label: 'Product/service' },
      { key: 'qty', label: 'Qty', width: '80px', align: 'right' },
      { key: 'rate', label: 'Rate', width: '100px', align: 'right' },
      { key: 'amount', label: 'Amount', width: '120px', align: 'right' },
    ],
    statuses: ['Draft', 'Sent', 'Unpaid', 'Overdue', 'Paid', 'Deposited', 'Void'],
    canRecordPayment: true, canSend: true, canPrint: true, showShipTo: false, showPaymentOptions: true,
    primaryAction: 'Review and send', apiPath: '/api/invoices', views: ['edit', 'email', 'payor', 'pdf'],
  },
  Estimate: {
    type: 'Estimate', label: 'Estimate', numberPrefix: 'EST-', partyLabel: 'Customer', partyRole: 'Customer',
    dateLabel: 'Estimate date', dueLabel: 'Expiration date',
    lineColumns: [
      { key: 'description', label: 'Product/service' },
      { key: 'qty', label: 'Qty', width: '80px', align: 'right' },
      { key: 'rate', label: 'Rate', width: '100px', align: 'right' },
      { key: 'amount', label: 'Amount', width: '120px', align: 'right' },
    ],
    statuses: ['Draft', 'Sent', 'Converted', 'Declined', 'Closed'],
    canRecordPayment: false, canSend: true, canPrint: true, showShipTo: false, showPaymentOptions: false,
    primaryAction: 'Review and send', apiPath: '/api/estimates', views: ['edit', 'email', 'pdf'],
  },
  SalesReceipt: {
    type: 'SalesReceipt', label: 'Sales Receipt', numberPrefix: 'SR-', partyLabel: 'Customer', partyRole: 'Customer',
    dateLabel: 'Sale date', dueLabel: '',
    lineColumns: [
      { key: 'description', label: 'Product/service' },
      { key: 'qty', label: 'Qty', width: '80px', align: 'right' },
      { key: 'rate', label: 'Rate', width: '100px', align: 'right' },
      { key: 'amount', label: 'Amount', width: '120px', align: 'right' },
    ],
    statuses: ['Draft', 'Paid', 'Deposited'],
    canRecordPayment: false, canSend: true, canPrint: true, showShipTo: false, showPaymentOptions: true,
    primaryAction: 'Save and print', apiPath: '/api/receipts', views: ['edit', 'pdf'],
  },
  CreditMemo: {
    type: 'CreditMemo', label: 'Credit Memo', numberPrefix: 'CM-', partyLabel: 'Customer', partyRole: 'Customer',
    dateLabel: 'Date', dueLabel: '',
    lineColumns: [
      { key: 'description', label: 'Product/service' },
      { key: 'qty', label: 'Qty', width: '80px', align: 'right' },
      { key: 'rate', label: 'Rate', width: '100px', align: 'right' },
      { key: 'amount', label: 'Amount', width: '120px', align: 'right' },
    ],
    statuses: ['Draft', 'Applied', 'Refunded', 'Void'],
    canRecordPayment: true, canSend: true, canPrint: true, showShipTo: false, showPaymentOptions: false,
    primaryAction: 'Save', apiPath: '/api/crm/documents', views: ['edit', 'email', 'pdf'],
  },
  SalesOrder: {
    type: 'SalesOrder', label: 'Sales Order', numberPrefix: 'SO-', partyLabel: 'Customer', partyRole: 'Customer',
    dateLabel: 'Order date', dueLabel: 'Expected ship',
    lineColumns: [
      { key: 'description', label: 'Product/service' },
      { key: 'qty', label: 'Qty', width: '80px', align: 'right' },
      { key: 'rate', label: 'Rate', width: '100px', align: 'right' },
      { key: 'amount', label: 'Amount', width: '120px', align: 'right' },
    ],
    statuses: ['Draft', 'Open', 'Fulfilled', 'Closed'],
    canRecordPayment: true, canSend: true, canPrint: true, showShipTo: true, showPaymentOptions: false,
    primaryAction: 'Save order', apiPath: '/api/crm/sales_orders', views: ['edit', 'pdf'],
  },
  Bill: {
    type: 'Bill', label: 'Bill', numberPrefix: 'BILL-', partyLabel: 'Vendor', partyRole: 'Vendor',
    dateLabel: 'Bill date', dueLabel: 'Due date',
    lineColumns: [
      { key: 'description', label: 'Category / Item' },
      { key: 'qty', label: 'Qty', width: '80px', align: 'right' },
      { key: 'rate', label: 'Rate', width: '100px', align: 'right' },
      { key: 'amount', label: 'Amount', width: '120px', align: 'right' },
    ],
    statuses: ['ForReview', 'Approved', 'Unpaid', 'Overdue', 'Paid', 'Void'],
    canRecordPayment: true, canSend: false, canPrint: true, showShipTo: false, showPaymentOptions: false,
    primaryAction: 'Save bill', apiPath: '/api/crm/bills', views: ['edit', 'pdf'],
  },
  Expense: {
    type: 'Expense', label: 'Expense', numberPrefix: 'EXP-', partyLabel: 'Payee', partyRole: 'Vendor',
    dateLabel: 'Date', dueLabel: '',
    lineColumns: [
      { key: 'description', label: 'Category' },
      { key: 'amount', label: 'Amount', width: '120px', align: 'right' },
    ],
    statuses: ['Draft', 'Posted'],
    canRecordPayment: false, canSend: false, canPrint: true, showShipTo: false, showPaymentOptions: false,
    primaryAction: 'Save', apiPath: '/api/crm/documents', views: ['edit'],
  },
  Check: {
    type: 'Check', label: 'Check', numberPrefix: 'CHK-', partyLabel: 'Payee', partyRole: 'Vendor',
    dateLabel: 'Date', dueLabel: '',
    lineColumns: [
      { key: 'description', label: 'Category' },
      { key: 'amount', label: 'Amount', width: '120px', align: 'right' },
    ],
    statuses: ['Draft', 'Printed', 'Cleared', 'Void'],
    canRecordPayment: false, canSend: false, canPrint: true, showShipTo: false, showPaymentOptions: false,
    primaryAction: 'Save', apiPath: '/api/crm/documents', views: ['edit', 'pdf'],
  },
  PurchaseOrder: {
    type: 'PurchaseOrder', label: 'Purchase Order', numberPrefix: 'PO-', partyLabel: 'Supplier', partyRole: 'Supplier',
    dateLabel: 'Order date', dueLabel: 'Expected delivery',
    lineColumns: [
      { key: 'description', label: 'Item' },
      { key: 'qty', label: 'Qty', width: '80px', align: 'right' },
      { key: 'rate', label: 'Unit cost', width: '100px', align: 'right' },
      { key: 'amount', label: 'Amount', width: '120px', align: 'right' },
    ],
    statuses: ['Draft', 'Open', 'Sent', 'PartiallyReceived', 'Received', 'Closed'],
    canRecordPayment: false, canSend: true, canPrint: true, showShipTo: true, showPaymentOptions: false,
    primaryAction: 'Send to supplier', apiPath: '/api/crm/documents', views: ['edit', 'email', 'pdf'],
  },
  VendorCredit: {
    type: 'VendorCredit', label: 'Vendor Credit', numberPrefix: 'VC-', partyLabel: 'Vendor', partyRole: 'Vendor',
    dateLabel: 'Date', dueLabel: '',
    lineColumns: [
      { key: 'description', label: 'Category / Item' },
      { key: 'qty', label: 'Qty', width: '80px', align: 'right' },
      { key: 'rate', label: 'Rate', width: '100px', align: 'right' },
      { key: 'amount', label: 'Amount', width: '120px', align: 'right' },
    ],
    statuses: ['Draft', 'Applied', 'Refunded', 'Void'],
    canRecordPayment: true, canSend: true, canPrint: true, showShipTo: false, showPaymentOptions: false,
    primaryAction: 'Save', apiPath: '/api/crm/documents', views: ['edit', 'pdf'],
  },
  JournalEntry: {
    type: 'JournalEntry', label: 'Journal Entry', numberPrefix: 'JE-', partyLabel: '', partyRole: 'Customer',
    dateLabel: 'Date', dueLabel: '',
    lineColumns: [
      { key: 'account', label: 'Account' },
      { key: 'description', label: 'Description' },
      { key: 'debit', label: 'Debit', width: '100px', align: 'right' },
      { key: 'credit', label: 'Credit', width: '100px', align: 'right' },
    ],
    statuses: ['Draft', 'Posted'],
    canRecordPayment: false, canSend: false, canPrint: true, showShipTo: false, showPaymentOptions: false,
    primaryAction: 'Post', apiPath: '/api/crm/documents', views: ['edit'],
  },
  RMA: {
    type: 'RMA', label: 'Return / RMA', numberPrefix: 'RMA-', partyLabel: 'Customer', partyRole: 'Customer',
    dateLabel: 'Date', dueLabel: '',
    lineColumns: [
      { key: 'description', label: 'Item' },
      { key: 'qty', label: 'Qty', width: '80px', align: 'right' },
      { key: 'amount', label: 'Amount', width: '120px', align: 'right' },
    ],
    statuses: ['Requested', 'Approved', 'Received', 'Refunded', 'Declined'],
    canRecordPayment: false, canSend: true, canPrint: true, showShipTo: true, showPaymentOptions: false,
    primaryAction: 'Save', apiPath: '/api/crm/documents', views: ['edit', 'pdf'],
  },
};
