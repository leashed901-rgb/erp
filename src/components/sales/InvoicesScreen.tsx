'use client';
/* InvoicesScreen — Sales → Invoices.
   REAL data from /api/v1/documents?type=Invoice (Document Engine API).
   This reads from acct_ar_invoices — the real accounting table.
   Built on the config-driven TableShell + ViewDef pattern (spec §B.5). */

import { useState, useEffect } from 'react';
import { exportToCsv } from '@/lib/csvExport';
import { VIEW_DEFS } from '@/lib/viewDefs';
import TableShell from '../primitives/TableShell';
import DocumentEngine from '../DocumentEngine';

interface InvoicesScreenProps {
  onToast: (m: string) => void;
  onNavigate?: (d: string, s: string) => void;
  onCreate?: (label: string) => void;
}

export default function InvoicesScreen({ onToast }: InvoicesScreenProps) {
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  if (creating) {
    return <DocumentEngine type="Invoice" onToast={onToast} onClose={() => setCreating(false)} />;
  }
  if (editingId) {
    return <DocumentEngine type="Invoice" documentId={editingId} onToast={onToast} onClose={() => setEditingId(null)} />;
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 mb-3">
        <h1 className="text-[20px] font-semibold">Invoices</h1>
        <button
          className="h-8 px-4 bg-primary text-white rounded text-[13px] font-semibold hover:bg-primary-container"
          onClick={() => setCreating(true)}
        >
          + Create invoice
        </button>
      </div>
      <TableShell
        view={VIEW_DEFS.invoices}
        onRowOpen={(id) => setEditingId(id)}
        onToast={onToast}
      />
    </div>
  );
}
