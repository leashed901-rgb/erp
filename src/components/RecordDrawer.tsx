'use client';
/* RecordDrawer.tsx — §2.5 of platform-component-behavior.md:
   "Record drawers (all DrawerDef configs on one RecordDrawer):
   PartyDrawer, ItemDrawer, AccountDrawer, CategoryDrawer, TaskDrawer, TicketDrawer,
   DiscountDrawer, BannerDrawer, PopupDrawer, CollectionDrawer, RecurringDrawer, ExpenseDrawer.
   One component renders sections/fields from config; custom sections plug in by slot."

   §2.4 Drawer: width 480|720, dirty, title → onClose, onMakeFullPage.
   Non-modal over the list; sticky footer; stack depth max 2. */

import { useState, useEffect } from 'react';
import type { PartyRole } from '@/lib/platformStore';
import { fetchJson } from '@/hooks/useCrmApi';
import { useChartOfAccounts, useBankAccounts } from '@/hooks/useAccountingApi';

/* Picker data shapes (real APIs, loaded once per drawer mount) */
interface PartyOption { id: string; name: string; roles: string[] }
interface AccountOption { id: string; name: string; code: string; type: string; detail: string }
interface ItemOption { id: string; name: string }

/* ─── Field types (§2.1: MoneyField, DateField, SelectField, TagInput) ─── */

export type FieldType = 'text' | 'email' | 'phone' | 'number' | 'money' | 'date' | 'select' | 'textarea' | 'checkbox' | 'party' | 'item' | 'account' | 'tags';

export interface FieldDef {
  id: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  options?: string[]; // for select
  partyRole?: PartyRole; // for party picker
  accountType?: string; // for account picker
  helpText?: string;
  /** masked per §1.8 unless role permits */
  masked?: boolean;
}

export interface SectionDef {
  id: string;
  title: string;
  /** Role-specific sections show only when the party has this role */
  showForRole?: PartyRole;
  fields: FieldDef[];
}

export interface DrawerDef {
  id: string;
  entity: 'party' | 'item' | 'account' | 'task' | 'ticket' | 'category' | 'expense';
  title: string;
  subtitle?: string;
  width: 480 | 720;
  sections: SectionDef[];
}

/* ─── Drawer configs (§2.5) ─── */

export const PARTY_DRAWER: DrawerDef = {
  id: 'party.drawer',
  entity: 'party',
  title: 'Party',
  width: 480,
  sections: [
    {
      id: 'identity', title: 'Identity',
      fields: [
        { id: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Acme Corp' },
        { id: 'displayName', label: 'Display name', type: 'text', placeholder: 'e.g. Acme' },
        { id: 'email', label: 'Email', type: 'email', placeholder: 'name@company.com' },
        { id: 'phone', label: 'Phone', type: 'phone', placeholder: '+1 (555) 000-0000' },
      ],
    },
    {
      id: 'address', title: 'Address',
      fields: [
        { id: 'address', label: 'Street', type: 'text' },
        { id: 'city', label: 'City', type: 'text' },
        { id: 'state', label: 'State', type: 'text' },
        { id: 'zip', label: 'ZIP', type: 'text' },
        { id: 'country', label: 'Country', type: 'select', options: ['United States', 'Canada', 'United Kingdom', 'Australia'] },
      ],
    },
    {
      id: 'finance', title: 'Finance',
      fields: [
        { id: 'terms', label: 'Terms', type: 'select', options: ['Net 30', 'Net 15', 'Due on receipt'] },
        { id: 'creditLimit', label: 'Credit limit', type: 'money' },
        { id: 'taxId', label: 'Tax ID', type: 'text', masked: true },
        { id: 'track1099', label: 'Track for 1099', type: 'checkbox' },
      ],
    },
    {
      id: 'notes', title: 'Notes & attachments',
      fields: [
        { id: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Add any notes…' },
      ],
    },
    // Role-specific sections (§2.5: custom sections plug in by slot)
    {
      id: 'lead', title: 'Lead details', showForRole: 'Lead',
      fields: [
        { id: 'leadSource', label: 'Lead source', type: 'select', options: ['Website', 'Referral', 'Cold outreach', 'Event', 'Social media'] },
        { id: 'leadStatus', label: 'Status', type: 'select', options: ['New', 'Contacted', 'Qualified', 'Proposal sent', 'Won', 'Lost'] },
        { id: 'leadValue', label: 'Estimated value', type: 'money' },
      ],
    },
    {
      id: 'supplier', title: 'Supplier details', showForRole: 'Supplier',
      fields: [
        { id: 'supplierLeadTime', label: 'Lead time (days)', type: 'number' },
        { id: 'supplierAccountNo', label: 'Account no.', type: 'text' },
        { id: 'supplierUrl', label: 'Catalog / API URL', type: 'text' },
      ],
    },
    {
      id: 'vendor', title: 'Vendor details', showForRole: 'Vendor',
      fields: [
        { id: 'vendorDefaultAccount', label: 'Default expense account', type: 'account', accountType: 'Expense' },
      ],
    },
  ],
};

export const ITEM_DRAWER: DrawerDef = {
  id: 'item.drawer',
  entity: 'item',
  title: 'Product / Service',
  width: 720,
  sections: [
    {
      id: 'basic', title: 'Basic info',
      fields: [
        { id: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Classic Tee — White' },
        { id: 'sku', label: 'SKU', type: 'text', required: true, placeholder: 'TEE-001-WHT' },
        { id: 'type', label: 'Item type', type: 'select', options: ['Product', 'Service', 'Blank', 'Bundle', 'Design-linked'] },
        { id: 'category', label: 'Category', type: 'text', placeholder: 'Apparel > T-Shirts' },
        { id: 'fulfillmentType', label: 'Fulfillment type', type: 'select', options: ['Stock', 'POD', 'Supplier-fulfilled', 'Digital'] },
      ],
    },
    {
      id: 'sales', title: 'Sales',
      fields: [
        { id: 'price', label: 'Price', type: 'money', required: true },
        { id: 'description', label: 'Description', type: 'textarea' },
        { id: 'incomeAccount', label: 'Income account', type: 'account', accountType: 'Income' },
        { id: 'taxable', label: 'Taxable', type: 'checkbox' },
      ],
    },
    {
      id: 'purchasing', title: 'Purchasing',
      fields: [
        { id: 'supplierId', label: 'Supplier', type: 'party', partyRole: 'Supplier' },
        { id: 'cost', label: 'Cost', type: 'money', masked: true },
        { id: 'expenseAccount', label: 'Expense/COGS account', type: 'account', accountType: 'COGS' },
        { id: 'trackInventory', label: 'Track inventory', type: 'checkbox' },
        { id: 'reorderPoint', label: 'Reorder point', type: 'number' },
      ],
    },
  ],
};

/* ─── Account drawer (CoA: "New account: Type, Detail type, Name, Number, Parent, Opening balance") ─── */

export const ACCOUNT_DRAWER: DrawerDef = {
  id: 'account.drawer',
  entity: 'account',
  title: 'Account',
  width: 480,
  sections: [
    {
      id: 'main', title: 'Account details',
      fields: [
        { id: 'name', label: 'Account name', type: 'text', required: true, placeholder: 'e.g. Shipping Supplies' },
        { id: 'number', label: 'Account number', type: 'text', placeholder: 'e.g. 6300' },
        { id: 'type', label: 'Type', type: 'select', options: ['Asset', 'Liability', 'Equity', 'Income', 'COGS', 'Expense', 'Bank', 'CreditCard'] },
        { id: 'detailType', label: 'Detail type', type: 'text', placeholder: 'e.g. Other operating expenses' },
        { id: 'openingBalance', label: 'Opening balance', type: 'money' },
        { id: 'description', label: 'Description', type: 'textarea' },
      ],
    },
  ],
};

/* ─── Expense drawer (doc: "Expense | Drawer (fast): Payee, Date, Paid-from account, Category, Amount, Receipt, Tag") ─── */

export const EXPENSE_DRAWER: DrawerDef = {
  id: 'expense.drawer',
  entity: 'expense',
  title: 'Expense',
  width: 480,
  sections: [
    {
      id: 'main', title: 'Expense details',
      fields: [
        { id: 'payeeId', label: 'Payee', type: 'party', partyRole: 'Vendor' },
        { id: 'date', label: 'Date', type: 'date' },
        { id: 'paidFrom', label: 'Paid from', type: 'account', accountType: 'Bank' },
        { id: 'category', label: 'Category', type: 'account', accountType: 'Expense' },
        { id: 'amount', label: 'Amount', type: 'money', required: true },
        { id: 'memo', label: 'Memo', type: 'textarea' },
      ],
    },
  ],
};

/* ─── Ticket drawer (doc: "Requester picker, Subject, Channel, Priority, Related record, Assignee, First message") ─── */

export const TICKET_DRAWER: DrawerDef = {
  id: 'ticket.drawer',
  entity: 'ticket',
  title: 'Ticket',
  width: 480,
  sections: [
    {
      id: 'main', title: 'Ticket details',
      fields: [
        { id: 'requesterId', label: 'Requester', type: 'party', required: true },
        { id: 'subject', label: 'Subject', type: 'text', required: true },
        { id: 'channel', label: 'Channel', type: 'select', options: ['Email', 'Chat', 'Social DM', 'Marketplace message', 'Web form'] },
        { id: 'priority', label: 'Priority', type: 'select', options: ['Low', 'Normal', 'High', 'Urgent'] },
        { id: 'assignee', label: 'Assignee', type: 'text', placeholder: 'Unassigned' },
        { id: 'firstMessage', label: 'First message', type: 'textarea' },
      ],
    },
  ],
};

/* ─── Category drawer (doc: "Categories: list + drawer (name, parent, slug)") ─── */

export const CATEGORY_DRAWER: DrawerDef = {
  id: 'category.drawer',
  entity: 'category',
  title: 'Category',
  width: 480,
  sections: [
    {
      id: 'main', title: 'Category details',
      fields: [
        { id: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. T-Shirts' },
        { id: 'parent', label: 'Parent category', type: 'text', placeholder: 'e.g. Apparel' },
        { id: 'slug', label: 'Slug', type: 'text', placeholder: 't-shirts' },
      ],
    },
  ],
};

/* ─── The RecordDrawer component ─── */

interface RecordDrawerProps {
  def?: DrawerDef;
  /** Existing record to edit, null for create */
  record?: Record<string, unknown> | null;
  /** Pre-selected roles (for party drawer: which role pills are on) */
  initialRoles?: PartyRole[];
  onToast: (msg: string) => void;
  onClose: () => void;
  onSave: (values: Record<string, unknown>) => Promise<boolean> | boolean;
  onMakeFullPage?: () => void;
}

export default function RecordDrawer(props: RecordDrawerProps & { open?: boolean; kind?: string; sessionKey?: string | number }) {
  // Legacy controlled mode (GlobalShell): open=false → render nothing.
  if (props.open === false) return null;
  // Legacy API (GlobalShell): kind prop maps to a DrawerDef so the old
  // call sites keep working while screens migrate to the def-based API.
  const legacyKindMap: Record<string, DrawerDef> = {
    'Invoice': PARTY_DRAWER, 'Bill': EXPENSE_DRAWER, 'Party': PARTY_DRAWER,
    'Customer': PARTY_DRAWER, 'Vendor': PARTY_DRAWER, 'Supplier': PARTY_DRAWER,
    'Product': ITEM_DRAWER, 'Item': ITEM_DRAWER,
    'Account': ACCOUNT_DRAWER, 'Expense': EXPENSE_DRAWER,
    'Ticket': TICKET_DRAWER, 'Category': CATEGORY_DRAWER,
  };
  const resolvedDef = props.def || legacyKindMap[props.kind || ''] || PARTY_DRAWER;
  return <RecordDrawerInner key={props.sessionKey} {...props} def={resolvedDef} />;
}

function PartySelect({ value, onChange, role }: { value: string | null; onChange: (id: string | null) => void; role?: PartyRole }) {
  const [options, setOptions] = useState<PartyOption[]>([]);
  useEffect(() => {
    fetchJson<{ data: { id: string; displayName?: string; name?: string; roles?: string[] }[] }>('/api/parties')
      .then(res => {
        if (!res.ok) return;
        const all = (res.data.data || []).map(p => ({ id: p.id, name: p.displayName || p.name || 'Party', roles: (p.roles || []).map(r => r.toLowerCase()) }));
        setOptions(role ? all.filter(p => p.roles.includes(role.toLowerCase())) : all);
      })
      .catch(() => {});
  }, [role]);
  return (
    <select className="field-input" value={value || ''} onChange={e => onChange(e.target.value || null)}>
      <option value="">Select…</option>
      {options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
    </select>
  );
}

function AccountSelect({ value, onChange, accountType }: { value: string | null; onChange: (id: string | null) => void; accountType?: string }) {
  const { accounts } = useChartOfAccounts();
  const { bankAccounts } = useBankAccounts();
  if (accountType === 'Bank') {
    return (
      <select className="field-input" value={value || ''} onChange={e => onChange(e.target.value || null)}>
        <option value="">Select…</option>
        {bankAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
    );
  }
  const opts = (accounts as unknown as AccountOption[]).filter(a =>
    !accountType || a.type === accountType || (accountType === 'COGS' && /cost of goods/i.test(a.detail || '')) || (accountType === 'Income' && a.type === 'Income'));
  return (
    <select className="field-input" value={value || ''} onChange={e => onChange(e.target.value || null)}>
      <option value="">Select…</option>
      {opts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
    </select>
  );
}

function ItemSelect({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  const [options, setOptions] = useState<ItemOption[]>([]);
  useEffect(() => {
    fetchJson<{ items: { id: string; name: string }[] }>('/api/v1/items')
      .then(res => { if (res.ok) setOptions((res.data.items || []).slice(0, 500).map(i => ({ id: i.id, name: i.name }))); })
      .catch(() => {});
  }, []);
  return (
    <select className="field-input" value={value || ''} onChange={e => onChange(e.target.value || null)}>
      <option value="">Select…</option>
      {options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
    </select>
  );
}

function RecordDrawerInner({ def, record, initialRoles, onToast, onClose, onSave, onMakeFullPage }: RecordDrawerProps) {
  const drawerDef = def!;
  const [values, setValues] = useState<Record<string, unknown>>(record || {});
  const [roles, setRoles] = useState<Set<PartyRole>>(new Set(initialRoles || ((record?.roles as PartyRole[]) || [])));
  const [dirty, setDirty] = useState(false);

  function setValue(id: string, value: unknown) {
    setValues(prev => ({ ...prev, [id]: value }));
    setDirty(true);
  }

  function toggleRole(role: PartyRole) {
    setRoles(prev => { const n = new Set(prev); if (n.has(role)) n.delete(role); else n.add(role); return n; });
    setDirty(true);
  }

  async function save(): Promise<boolean> {
    // Validate required fields
    for (const section of drawerDef.sections) {
      if (section.showForRole && !roles.has(section.showForRole)) continue;
      for (const field of section.fields) {
        if (field.required && !String(values[field.id] || '').trim()) {
          onToast(`${field.label} is required`);
          return false;
        }
      }
    }
    if (drawerDef.entity === 'party' && roles.size === 0) {
      onToast('Select at least one role');
      return false;
    }
    const ok = await onSave({ ...values, ...(drawerDef.entity === 'party' ? { roles: [...roles] } : {}) });
    if (ok) setDirty(false);
    return ok;
  }

  const allRoles: PartyRole[] = ['Customer', 'Vendor', 'Supplier', 'Contractor', 'Seller', 'Lead'];

  return (
    <>
      <div className="drawer-scrim open" onClick={() => { if (!dirty) onClose(); }} />
      <div className="drawer open" style={{ width: drawerDef.width, maxWidth: '96vw' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 h-14 border-b border-surface-dim shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="min-w-0">
              <div className="text-headline-sm truncate">{record ? `Edit ${drawerDef.title.toLowerCase()}` : `New ${drawerDef.title.toLowerCase()}`}</div>
              <div className="text-[11px] text-on-surface-variant">{record ? (record.id as string) : 'Not yet saved'}</div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {onMakeFullPage && (
              <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1" onClick={onMakeFullPage}>
                <span className="material-symbols-outlined text-[14px]">open_in_full</span>Make full page
              </button>
            )}
            <button className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" onClick={() => { if (!dirty) onClose(); else onToast('Unsaved changes — save or discard first'); }}><span className="material-symbols-outlined text-[18px]">close</span></button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Role chips (party entity only) */}
          {drawerDef.entity === 'party' && (
            <section>
              <div className="section-h">Roles</div>
              <div className="flex flex-wrap gap-2">
                {allRoles.map(r => (
                  <button key={r} type="button" className={`role-chip-btn ${roles.has(r) ? 'selected' : ''}`} onClick={() => toggleRole(r)}>
                    <span className="material-symbols-outlined text-[16px]">{r === 'Customer' ? 'person' : r === 'Vendor' ? 'storefront' : r === 'Supplier' ? 'factory' : r === 'Contractor' ? 'engineering' : r === 'Seller' ? 'store' : 'flag'}</span>
                    {r}
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Sections */}
          {drawerDef.sections.map(section => {
            // §2.5: role-specific sections show only when the role is active
            if (section.showForRole && !roles.has(section.showForRole)) return null;
            return (
              <section key={section.id}>
                <div className="section-h">{section.title}</div>
                <div className="space-y-3">
                  {section.fields.map(field => {
                    const val = values[field.id];
                    return (
                      <div key={field.id}>
                        {field.type === 'checkbox' ? (
                          <label className="flex items-center gap-2 text-body-sm">
                            <input type="checkbox" className="row-check" checked={Boolean(val)} onChange={e => setValue(field.id, e.target.checked)} />
                            {field.label}
                          </label>
                        ) : (
                          <>
                            <label className="field-label">{field.label}{field.required && ' *'}</label>
                            {field.type === 'textarea' ? (
                              <textarea className="field-textarea" placeholder={field.placeholder} value={String(val || '')} onChange={e => setValue(field.id, e.target.value)} />
                            ) : field.type === 'select' ? (
                              <select className="field-input" value={String(val || '')} onChange={e => setValue(field.id, e.target.value)}>
                                <option value="">Select…</option>
                                {field.options?.map(o => <option key={o} value={o}>{o}</option>)}
                              </select>
                            ) : field.type === 'party' ? (
                              <PartySelect value={(val as string) || null} onChange={id => setValue(field.id, id)} role={field.partyRole} />
                            ) : field.type === 'account' ? (
                              <AccountSelect value={(val as string) || null} onChange={id => setValue(field.id, id)} accountType={field.accountType} />
                            ) : field.type === 'item' ? (
                              <ItemSelect value={(val as string) || null} onChange={id => setValue(field.id, id)} />
                            ) : (
                              <input
                                className="field-input"
                                type={field.type === 'number' || field.type === 'money' ? 'number' : field.type === 'date' ? 'date' : field.type === 'email' ? 'email' : 'text'}
                                step={field.type === 'money' ? '0.01' : undefined}
                                placeholder={field.placeholder}
                                value={String(val ?? '')}
                                onChange={e => setValue(field.id, field.type === 'number' || field.type === 'money' ? parseFloat(e.target.value) || 0 : e.target.value)}
                              />
                            )}
                            {field.helpText && <div className="text-[11px] text-on-surface-variant mt-1">{field.helpText}</div>}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>

        {/* Sticky footer (§2.4) */}
        <div className="h-14 border-t border-surface-dim px-4 flex items-center justify-between shrink-0 bg-white">
          <button type="button" className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={() => { if (!dirty) onClose(); else onToast('Unsaved changes'); }}>Cancel</button>
          <div className="flex items-center gap-2">
            <button type="button" className="h-8 px-3 border border-surface-dim rounded text-body-md font-semibold hover:bg-surface-container-low" onClick={async () => { if (await save()) { setValues({}); setRoles(new Set()); onToast('Saved — form ready for next'); } }}>Save and new</button>
            <button type="button" className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container" onClick={async () => { if (await save()) onClose(); }}>Save and close</button>
          </div>
        </div>
      </div>
    </>
  );
}
