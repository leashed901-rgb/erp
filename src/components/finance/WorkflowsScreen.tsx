'use client';
import { useState, useEffect, useCallback } from 'react';
import type { Workflow, WorkflowInstance, WorkflowAction } from '@/lib/batchITypes';
import { fmtDate, cap } from '@/lib/batchITypes';

/**
 * Workflows screen (doc 28 Batch I) — approval workflows and their
 * instances. A workflow is a rule set for an entity type (invoice,
 * bill, journal): above a threshold amount, the rules decide who
 * approves. No engine auto-starts instances today — the screen
 * records them and the action trail by hand.
 */

interface Props {
  onToast: (msg: string) => void;
}

export default function WorkflowsScreen({ onToast }: Props) {
  type Tab = 'workflows' | 'instances';
  const [tab, setTab] = useState<Tab>('workflows');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workflows, setWorkflows] = useState<Workflow[] | null>(null);
  const [instances, setInstances] = useState<WorkflowInstance[] | null>(null);
  const [selected, setSelected] = useState<Workflow | null>(null);
  const [detail, setDetail] = useState<WorkflowInstance[] | null>(null);
  const [selectedInstance, setSelectedInstance] = useState<WorkflowInstance | null>(null);
  const [instanceDetail, setInstanceDetail] = useState<WorkflowAction[] | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showInstance, setShowInstance] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadTab = useCallback(async (t: Tab, force = false) => {
    setError(null);
    setLoading(true);
    try {
      if (t === 'workflows' && (force || !workflows)) {
        const j = await fetch('/api/workflows').then((r) => r.json()).catch(() => null);
        if (j?.error) throw new Error(j.error.message || 'Workflows load failed');
        setWorkflows((j?.data || []) as Workflow[]);
      } else if (t === 'instances' && (force || !instances)) {
        const j = await fetch('/api/workflow-instances').then((r) => r.json()).catch(() => null);
        if (j?.error) throw new Error(j.error.message || 'Instances load failed');
        setInstances((j?.data || []) as WorkflowInstance[]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [workflows, instances]);

  useEffect(() => { loadTab('workflows'); }, [loadTab]);

  const openWorkflow = async (w: Workflow) => {
    setSelected(w);
    const j = await fetch(`/api/workflows/${w.id}`).then((r) => r.json()).catch(() => null);
    setDetail(((j?.data?.instances || []) as WorkflowInstance[]));
  };

  const openInstance = async (i: WorkflowInstance) => {
    setSelectedInstance(i);
    const j = await fetch(`/api/workflow-instances/${i.id}`).then((r) => r.json()).catch(() => null);
    setInstanceDetail(((j?.data?.actions || []) as WorkflowAction[]));
  };

  const post = async (url: string, body: Record<string, unknown>, method = 'POST') => {
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j?.error) throw new Error(j?.error?.message || `Request failed (${r.status})`);
    return j;
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Workflows</h1>
        <div className="flex gap-2">
          {tab === 'workflows' && <button className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white" onClick={() => { setShowCreate(true); setFormError(null); }}>New workflow</button>}
          {tab === 'instances' && <button className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white" onClick={() => { setShowInstance(true); setFormError(null); }}>Start instance</button>}
        </div>
      </div>

      <div className="mt-4 flex gap-2 border-b pb-2">
        {([['workflows', 'Workflows'], ['instances', 'Instances']] as [Tab, string][]).map(([k, label]) => (
          <button key={k} className={tab === k ? 'rounded bg-gray-900 px-3 py-1 text-sm text-white' : 'rounded px-3 py-1 text-sm text-gray-600 hover:bg-gray-100'} onClick={() => { setTab(k); loadTab(k); }}>{label}</button>
        ))}
      </div>

      {error && <div className="mt-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {loading && <div className="mt-4 text-sm text-gray-500">Loading…</div>}

      {!loading && tab === 'workflows' && (
        <div className="mt-4 overflow-x-auto">
          {(workflows?.length ?? 0) === 0 ? (
            <p className="text-sm text-gray-500">No workflows yet. A workflow is an approval rule set for an entity type — above a threshold amount, the rules decide who approves.</p>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-gray-500"><th className="py-2 pr-3">Name</th><th className="py-2 pr-3">Entity type</th><th className="py-2 text-right">Threshold</th><th className="py-2 pr-3">Active</th><th className="py-2 text-right">Instances</th></tr></thead>
              <tbody>
                {workflows!.map((w) => (
                  <tr key={w.id} className="cursor-pointer border-t hover:bg-gray-50" onClick={() => openWorkflow(w)}>
                    <td className="py-2 pr-3">{w.name}</td>
                    <td className="py-2 pr-3">{w.entityType}</td>
                    <td className="py-2 text-right">{w.thresholdAmount == null ? '—' : `$${w.thresholdAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</td>
                    <td className="py-2 pr-3">{w.isActive ? 'Yes' : 'No'}</td>
                    <td className="py-2 text-right">{w.instanceCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {!loading && tab === 'instances' && (
        <div className="mt-4 overflow-x-auto">
          {(instances?.length ?? 0) === 0 ? (
            <p className="text-sm text-gray-500">No approval instances yet. The engine does not auto-start these — start one for a document that needs approval.</p>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-gray-500"><th className="py-2 pr-3">Workflow</th><th className="py-2 pr-3">Entity type</th><th className="py-2 pr-3">Entity</th><th className="py-2 pr-3">Status</th><th className="py-2 pr-3">Step</th><th className="py-2 pr-3">Started</th></tr></thead>
              <tbody>
                {instances!.map((i) => (
                  <tr key={i.id} className="cursor-pointer border-t hover:bg-gray-50" onClick={() => openInstance(i)}>
                    <td className="py-2 pr-3">{i.workflow}</td>
                    <td className="py-2 pr-3">{i.entityType}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{i.entityId.slice(0, 8)}…</td>
                    <td className="py-2 pr-3">{cap(i.status)}</td>
                    <td className="py-2 pr-3">{i.currentStep}</td>
                    <td className="py-2 pr-3">{fmtDate(i.startedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {showCreate && (
        <WorkflowCreateForm
          error={formError}
          busy={busy}
          onCancel={() => setShowCreate(false)}
          onSubmit={async (body) => {
            setBusy(true); setFormError(null);
            try {
              await post('/api/workflows', body);
              setShowCreate(false);
              onToast('Workflow created');
              await loadTab('workflows', true);
            } catch (e) { setFormError(e instanceof Error ? e.message : String(e)); }
            finally { setBusy(false); }
          }}
        />
      )}

      {showInstance && (
        <InstanceCreateForm
          workflows={workflows ?? []}
          error={formError}
          busy={busy}
          onCancel={() => setShowInstance(false)}
          onSubmit={async (body) => {
            setBusy(true); setFormError(null);
            try {
              await post('/api/workflow-instances', body);
              setShowInstance(false);
              onToast('Approval instance started');
              await loadTab('instances', true);
            } catch (e) { setFormError(e instanceof Error ? e.message : String(e)); }
            finally { setBusy(false); }
          }}
        />
      )}

      {selected && (
        <WorkflowDrawer
          workflow={selected}
          instances={detail}
          onClose={() => { setSelected(null); setDetail(null); }}
          onToast={onToast}
          onReload={async () => { await loadTab('workflows', true); if (selected) openWorkflow(selected); }}
        />
      )}

      {selectedInstance && (
        <InstanceDrawer
          instance={selectedInstance}
          actions={instanceDetail}
          onClose={() => { setSelectedInstance(null); setInstanceDetail(null); }}
          onToast={onToast}
          onReload={async () => { await loadTab('instances', true); if (selectedInstance) openInstance(selectedInstance); }}
        />
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="text-gray-600">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

const inputCls = 'w-full rounded border px-2 py-1.5 text-sm';

function WorkflowCreateForm({ error, busy, onCancel, onSubmit }: {
  error: string | null; busy: boolean;
  onCancel: () => void; onSubmit: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [entityType, setEntityType] = useState('');
  const [thresholdAmount, setThresholdAmount] = useState('');
  const [rulesText, setRulesText] = useState('{}');
  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-md overflow-y-auto bg-white p-6 shadow-xl">
      <h2 className="text-lg font-semibold">New workflow</h2>
      {error && <div className="mt-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <div className="mt-4 space-y-3">
        <Field label="Name"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bills over $1,000" /></Field>
        <Field label="Entity type"><input className={inputCls} value={entityType} onChange={(e) => setEntityType(e.target.value)} placeholder="e.g. bill, invoice, journal" /></Field>
        <Field label="Threshold amount"><input className={inputCls} type="number" step="0.01" min="0" value={thresholdAmount} onChange={(e) => setThresholdAmount(e.target.value)} /></Field>
        <Field label="Rules (JSON)"><textarea className={inputCls} rows={4} value={rulesText} onChange={(e) => setRulesText(e.target.value)} /></Field>
      </div>
      <div className="mt-5 flex gap-2">
        <button className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50" disabled={busy || !name || !entityType} onClick={() => {
          let rules: Record<string, unknown> = {};
          try { rules = JSON.parse(rulesText || '{}') as Record<string, unknown>; } catch { rules = {}; }
          onSubmit({ name, entityType, thresholdAmount: thresholdAmount ? Number(thresholdAmount) : null, rules });
        }}>Create workflow</button>
        <button className="rounded px-3 py-1.5 text-sm text-gray-600" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function InstanceCreateForm({ workflows, error, busy, onCancel, onSubmit }: {
  workflows: Workflow[]; error: string | null; busy: boolean;
  onCancel: () => void; onSubmit: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [workflowId, setWorkflowId] = useState('');
  const [entityType, setEntityType] = useState('');
  const [entityId, setEntityId] = useState('');
  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-md overflow-y-auto bg-white p-6 shadow-xl">
      <h2 className="text-lg font-semibold">Start approval instance</h2>
      {error && <div className="mt-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <div className="mt-4 space-y-3">
        <Field label="Workflow"><select className={inputCls} value={workflowId} onChange={(e) => { setWorkflowId(e.target.value); const w = workflows.find((x) => x.id === e.target.value); if (w) setEntityType(w.entityType); }}><option value="">—</option>{workflows.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Field>
        <Field label="Entity type"><input className={inputCls} value={entityType} onChange={(e) => setEntityType(e.target.value)} /></Field>
        <Field label="Entity id"><input className={inputCls} value={entityId} onChange={(e) => setEntityId(e.target.value)} placeholder="The bill / invoice / journal id" /></Field>
      </div>
      <div className="mt-5 flex gap-2">
        <button className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50" disabled={busy || !workflowId || !entityType || !entityId} onClick={() => onSubmit({ workflowId, entityType, entityId })}>Start instance</button>
        <button className="rounded px-3 py-1.5 text-sm text-gray-600" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function WorkflowDrawer({ workflow, instances, onClose, onToast, onReload }: {
  workflow: Workflow;
  instances: WorkflowInstance[] | null;
  onClose: () => void; onToast: (msg: string) => void; onReload: () => Promise<void>;
}) {
  const [isActive, setIsActive] = useState(workflow.isActive);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const post = async (url: string, body: Record<string, unknown>, method = 'POST') => {
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j?.error) throw new Error(j?.error?.message || `Request failed (${r.status})`);
    return j;
  };
  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-lg overflow-y-auto bg-white p-6 shadow-xl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{workflow.name}</h2>
        <button className="text-sm text-gray-500" onClick={onClose}>Close</button>
      </div>
      <p className="mt-1 text-sm text-gray-600">{workflow.entityType} · threshold {workflow.thresholdAmount == null ? '—' : `$${workflow.thresholdAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</p>
      {err && <div className="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
      <div className="mt-4">
        <h3 className="font-medium">Rules</h3>
        <pre className="mt-1 overflow-x-auto rounded bg-gray-50 p-2 text-xs">{JSON.stringify(workflow.rules ?? {}, null, 2)}</pre>
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-2">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Active</label>
        <button className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-50" disabled={busy || isActive === workflow.isActive} onClick={async () => {
          setBusy(true); setErr(null);
          try {
            await post(`/api/workflows/${workflow.id}`, { isActive }, 'PATCH');
            onToast('Workflow updated');
            await onReload();
          } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
          finally { setBusy(false); }
        }}>Save</button>
        <button className="rounded px-3 py-1.5 text-sm text-red-600 disabled:opacity-50" disabled={busy} onClick={async () => {
          setBusy(true); setErr(null);
          try {
            const r = await fetch(`/api/workflows/${workflow.id}`, { method: 'DELETE' });
            const j = await r.json().catch(() => ({}));
            if (!r.ok || j?.error) throw new Error(j?.error?.message || 'Delete failed');
            onToast('Workflow deleted');
            onClose();
            await onReload();
          } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
          finally { setBusy(false); }
        }}>Delete workflow</button>
      </div>
      <h3 className="mt-6 font-medium">Instances</h3>
      {(instances?.length ?? 0) === 0 ? (
        <p className="mt-1 text-sm text-gray-500">No instances yet.</p>
      ) : (
        <table className="mt-2 w-full text-sm">
          <thead><tr className="text-left text-gray-500"><th className="py-1 pr-3">Entity</th><th className="py-1 pr-3">Status</th><th className="py-1 pr-3">Step</th><th className="py-1 pr-3">Started</th></tr></thead>
          <tbody>
            {instances!.map((i) => (
              <tr key={i.id} className="border-t"><td className="py-1 pr-3 font-mono text-xs">{i.entityId.slice(0, 8)}…</td><td className="py-1 pr-3">{cap(i.status)}</td><td className="py-1 pr-3">{i.currentStep}</td><td className="py-1 pr-3">{fmtDate(i.startedAt)}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function InstanceDrawer({ instance, actions, onClose, onToast, onReload }: {
  instance: WorkflowInstance;
  actions: WorkflowAction[] | null;
  onClose: () => void; onToast: (msg: string) => void; onReload: () => Promise<void>;
}) {
  const [approverId, setApproverId] = useState('');
  const [comments, setComments] = useState('');
  const [users, setUsers] = useState<{ id: string; email: string; name: string }[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isPending = instance.status === 'pending';
  const act = async (action: 'approve' | 'reject') => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/workflow-instances/${instance.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, approverId: approverId || null, comments: comments || null }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.error) throw new Error(j?.error?.message || `Request failed (${r.status})`);
      onToast(action === 'approve' ? 'Approved — advanced to the next step' : 'Rejected');
      await onReload();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-lg overflow-y-auto bg-white p-6 shadow-xl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Approval — {instance.workflow}</h2>
        <button className="text-sm text-gray-500" onClick={onClose}>Close</button>
      </div>
      <p className="mt-1 text-sm text-gray-600">{instance.entityType} {instance.entityId.slice(0, 8)}… · {cap(instance.status)} · step {instance.currentStep} · started {fmtDate(instance.startedAt)}{instance.completedAt ? ` · completed ${fmtDate(instance.completedAt)}` : ''}</p>
      {err && <div className="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
      <h3 className="mt-5 font-medium">Action trail</h3>
      {(actions?.length ?? 0) === 0 ? (
        <p className="mt-1 text-sm text-gray-500">No actions yet.</p>
      ) : (
        <table className="mt-2 w-full text-sm">
          <thead><tr className="text-left text-gray-500"><th className="py-1 pr-3">Step</th><th className="py-1 pr-3">Approver</th><th className="py-1 pr-3">Action</th><th className="py-1 pr-3">Comments</th><th className="py-1 pr-3">When</th></tr></thead>
          <tbody>
            {actions!.map((a) => (
              <tr key={a.id} className="border-t"><td className="py-1 pr-3">{a.stepNo}</td><td className="py-1 pr-3">{a.approver}</td><td className="py-1 pr-3">{cap(a.action)}</td><td className="py-1 pr-3">{a.comments ?? '—'}</td><td className="py-1 pr-3">{fmtDate(a.actedAt)}</td></tr>
            ))}
          </tbody>
        </table>
      )}
      {isPending && (
        <div className="mt-5 rounded border p-3">
          <h3 className="font-medium">Record an action</h3>
          <div className="mt-3 space-y-3">
            <Field label="Approver (workspace user)"><select className={inputCls} value={approverId} onChange={(e) => setApproverId(e.target.value)} onFocus={async () => { if (!users) { const j = await fetch('/api/users').then((r) => r.json()).catch(() => null); setUsers((j?.data || []) as { id: string; email: string; name: string }[]); } }}><option value="">—</option>{(users ?? []).map((u) => <option key={u.id} value={u.id}>{u.name}{u.email && u.name !== u.email ? ` (${u.email})` : ''}</option>)}</select></Field>
            <Field label="Comments"><input className={inputCls} value={comments} onChange={(e) => setComments(e.target.value)} /></Field>
            <div className="flex gap-2">
              <button className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50" disabled={busy} onClick={() => act('approve')}>Approve</button>
              <button className="rounded bg-red-600 px-3 py-1.5 text-sm text-white disabled:opacity-50" disabled={busy} onClick={() => act('reject')}>Reject</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
