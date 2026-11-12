'use client';

import { useState, useEffect } from 'react';
import type { MenuAction } from '@/lib/contracts';

/**
 * ContextMenu — the 8-section right-click grammar (spec §1.7).
 * Fetches actions from /api/v1/{type}/{id}/actions.
 * Sections: Open, Create, Communicate, Money, Print, Organize, Danger.
 */
export function ContextMenu({ x, y, entity, rowId, onClose, onToast }: {
  x: number;
  y: number;
  entity: string;
  rowId: string;
  onClose: () => void;
  onToast?: (msg: string) => void;
}) {
  const [actions, setActions] = useState<MenuAction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/v1/${entity}/${rowId}/actions`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        setActions(json.actions || []);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        // Fallback: a standard set of actions per the grammar
        setActions(buildDefaultActions(entity));
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [entity, rowId]);

  const sections: { id: string; label: string; items: MenuAction[] }[] = [
    { id: 'open', label: 'Open', items: actions.filter((a) => a.section === 'open') },
    { id: 'create', label: 'Create from this', items: actions.filter((a) => a.section === 'create') },
    { id: 'communicate', label: 'Communicate', items: actions.filter((a) => a.section === 'communicate') },
    { id: 'money', label: 'Money', items: actions.filter((a) => a.section === 'money') },
    { id: 'print', label: 'Print / Export', items: actions.filter((a) => a.section === 'print') },
    { id: 'organize', label: 'Organize', items: actions.filter((a) => a.section === 'organize') },
    { id: 'danger', label: '', items: actions.filter((a) => a.section === 'danger') },
  ];

  const handleAction = (action: MenuAction) => {
    if (action.confirm) {
      if (!confirm(action.confirm.message)) return;
    }
    if (action.action) {
      onToast?.(`${action.label}…`);
    } else {
      onToast?.(`${action.label}`);
    }
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 z-[9998]" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div
        className="fixed z-[9999] bg-white rounded-lg shadow-2xl border border-surface-dim py-1 min-w-[200px] max-h-[80vh] overflow-y-auto"
        style={{ left: Math.min(x, window.innerWidth - 220), top: Math.min(y, window.innerHeight - 400) }}
      >
        {loading && <div className="px-3 py-2 text-[12px] text-on-surface-variant">Loading…</div>}
        {!loading && sections.map((section) => section.items.length > 0 && (
          <div key={section.id}>
            {section.label && <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-on-surface-variant">{section.label}</div>}
            {section.items.map((action) => (
              <button
                key={action.id}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] hover:bg-surface-container-low text-left"
                onClick={() => handleAction(action)}
                disabled={action.disabled}
              >
                {action.icon && <span className="material-symbols-outlined text-[16px] text-on-surface-variant">{action.icon}</span>}
                <span className={action.section === 'danger' ? 'text-error' : 'text-on-surface'}>{action.label}</span>
              </button>
            ))}
            <div className="border-t border-surface-dim my-1 last:border-0" />
          </div>
        ))}
      </div>
    </>
  );
}

function buildDefaultActions(entity: string): MenuAction[] {
  const isDocument = ['invoice', 'bill', 'estimate', 'purchase_order', 'sales_receipt', 'credit_memo', 'vendor_credit', 'rma', 'order'].includes(entity);
  const isParty = entity === 'party';
  const common: MenuAction[] = [
    { id: 'open', label: 'Open', icon: 'open_in_new', section: 'open' },
    { id: 'edit', label: 'Edit', icon: 'edit', section: 'open' },
    { id: 'duplicate', label: 'Duplicate', icon: 'content_copy', section: 'open' },
  ];
  if (isDocument) {
    common.push(
      { id: 'credit_memo', label: 'Credit memo', icon: 'credit_card', section: 'create' },
      { id: 'rma', label: 'Return / RMA', icon: 'assignment_return', section: 'create' },
      { id: 'ticket', label: 'Ticket', icon: 'support_agent', section: 'create' },
      { id: 'task', label: 'Task (follow up)', icon: 'task_alt', section: 'create' },
      { id: 'payment_link', label: 'Payment link', icon: 'link', section: 'create' },
      { id: 'send', label: 'Send', icon: 'send', section: 'communicate' },
      { id: 'remind', label: 'Remind', icon: 'notifications', section: 'communicate' },
      { id: 'email', label: 'Email customer', icon: 'mail', section: 'communicate' },
      { id: 'note', label: 'Add note', icon: 'edit_note', section: 'communicate' },
      { id: 'record_payment', label: 'Record payment', icon: 'payments', section: 'money' },
      { id: 'refund', label: 'Refund', icon: 'currency_exchange', section: 'money' },
      { id: 'mark_paid', label: 'Mark paid', icon: 'check_circle', section: 'money' },
      { id: 'print', label: 'Print', icon: 'print', section: 'print' },
      { id: 'pdf', label: 'PDF', icon: 'picture_as_pdf', section: 'print' },
      { id: 'download', label: 'Download attachment', icon: 'download', section: 'print' },
      { id: 'tag', label: 'Tag', icon: 'label', section: 'organize' },
      { id: 'favorite', label: 'Favorite', icon: 'star', section: 'organize' },
      { id: 'void', label: 'Void', icon: 'block', section: 'danger', confirm: { title: 'Void', message: 'Void this document? It will be kept for audit but cannot be edited.', requireReason: true } },
      { id: 'delete', label: 'Delete', icon: 'delete', section: 'danger', confirm: { title: 'Delete', message: 'Are you sure? This cannot be undone.' } },
    );
  }
  if (isParty) {
    common.push(
      { id: 'invoice', label: 'Invoice', icon: 'receipt_long', section: 'create' },
      { id: 'estimate', label: 'Estimate', icon: 'request_quote', section: 'create' },
      { id: 'sales_order', label: 'Sales order', icon: 'shopping_bag', section: 'create' },
      { id: 'bill', label: 'Bill', icon: 'description', section: 'create' },
      { id: 'po', label: 'Purchase order', icon: 'shopping_bag', section: 'create' },
      { id: 'expense', label: 'Expense', icon: 'credit_card', section: 'create' },
      { id: 'ticket', label: 'Ticket', icon: 'support_agent', section: 'create' },
      { id: 'task', label: 'Task', icon: 'task_alt', section: 'create' },
      { id: 'note', label: 'Note', icon: 'edit_note', section: 'create' },
      { id: 'email', label: 'Email', icon: 'mail', section: 'communicate' },
      { id: 'add_role', label: 'Add role…', icon: 'person_add', section: 'organize' },
      { id: 'archive', label: 'Archive', icon: 'archive', section: 'danger', confirm: { title: 'Archive', message: 'Archive this party? They will be hidden from active lists.' } },
    );
  }
  return common;
}

export default ContextMenu;
