'use client';
/* InvoicesScreen — Sales → Invoices.
   REAL data from /api/invoices (Supabase invoices table).
   Built on the config-driven TableShell + ViewDef pattern (spec §B.5).
   DocumentEngine handles create/edit (spec §4.4).
   All row actions use the 8-section grammar (spec §1.7). */

import { useState, useEffect } from 'react';
import type { Invoice } from '@/lib/accountingTypes';
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
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    fetch('/api/invoices')
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        setInvoices(json.data || []);
        setLoaded(true);
      })
      .catch(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, []);

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
