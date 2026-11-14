'use client';
/**
 * LeadScoringScreen — the rule builder + score-band config.
 *
 * Backed by:
 *   GET/POST  /api/crm/lead-scoring-rules
 *   PATCH/DEL /api/crm/lead-scoring-rules/[id]
 *   GET/POST  /api/crm/lead-score-bands
 *
 * Two panels: rules (field/operator/value/points) + bands (hot/warm/cold).
 * Each rule has an inline toggle for active, an edit, and a delete.
 */
import { useState } from 'react';
import {
  useScoringRules,
  useScoreBands,
  useCrmMutations,
  type ScoringRule,
  type ScoreBand,
} from '@/hooks/useCrmApi';

interface Props {
  onToast: (m: string) => void;
}

const FIELDS = [
  { id: 'has_email', label: 'Has email' },
  { id: 'has_phone', label: 'Has phone' },
  { id: 'inbound', label: 'Inbound lead' },
  { id: 'engaged_7d', label: 'Engaged in 7 days' },
  { id: 'stale', label: 'Stale (no activity 30d)' },
  { id: 'source_equals', label: 'Source equals' },
  { id: 'lead_type', label: 'Lead type equals' },
];
const OPERATORS = [
  { id: 'is_set', label: 'is set' },
  { id: 'is_not_set', label: 'is not set' },
  { id: 'eq', label: '=' },
  { id: 'ne', label: '≠' },
  { id: 'gt', label: '>' },
  { id: 'lt', label: '<' },
  { id: 'gte', label: '≥' },
  { id: 'lte', label: '≤' },
  { id: 'contains', label: 'contains' },
];

const BAND_COLORS: Record<string, string> = {
  hot: 'bg-error/15 text-error',
  warm: 'bg-qb-maroon/15 text-qb-maroon',
  cold: 'bg-surface-container-high text-on-surface-variant',
};

export default function LeadScoringScreen({ onToast }: Props) {
  const { data: rules, loaded: rulesLoaded, refresh: refetchRules } = useScoringRules();
  const { data: bands, loaded: bandsLoaded, refresh: refetchBands } = useScoreBands();
  const { createScoringRule, updateScoringRule, deleteScoringRule, createScoreBand } = useCrmMutations(onToast);

  // New-rule form state
  const [field, setField] = useState('has_email');
  const [operator, setOperator] = useState('is_set');
  const [value, setValue] = useState('');
  const [points, setPoints] = useState('10');
  const [saving, setSaving] = useState(false);

  // New-band form state
  const [bandLabel, setBandLabel] = useState('hot');
  const [bandMin, setBandMin] = useState('70');
  const [bandMax, setBandMax] = useState('100');
  const [savingBand, setSavingBand] = useState(false);

  async function addRule() {
    setSaving(true);
    const res = await createScoringRule({
      field,
      operator,
      value: value || null,
      points: Number(points) || 0,
      is_active: true,
    });
    setSaving(false);
    if (res.ok) {
      setValue('');
      setPoints('10');
      refetchRules();
    }
  }

  async function toggleActive(rule: ScoringRule) {
    const res = await updateScoringRule(rule.id, { is_active: !rule.is_active });
    if (res.ok) refetchRules();
  }

  async function removeRule(id: string) {
    const res = await deleteScoringRule(id);
    if (res.ok) refetchRules();
  }

  async function addBand() {
    setSavingBand(true);
    const res = await createScoreBand({
      label: bandLabel,
      min_score: Number(bandMin) || 0,
      max_score: Number(bandMax) || 100,
    });
    setSavingBand(false);
    if (res.ok) refetchBands();
  }

  const schemaPending = (rulesLoaded && (rules as unknown as { schema_pending?: boolean }).schema_pending) ||
                        (bandsLoaded && (bands as unknown as { schema_pending?: boolean }).schema_pending);

  return (
    <main className="px-6 pb-12 flex flex-col h-full">
      <div className="flex items-start justify-between gap-4 py-4">
        <div>
          <h1 className="text-headline-lg">Lead Scoring</h1>
          <p className="text-body-sm text-on-surface-variant mt-0.5">
            {rulesLoaded ? `${rules.length} rules · ${bandsLoaded ? bands.length : 0} bands` : 'Loading…'}
          </p>
        </div>
      </div>

      {schemaPending && (
        <div className="mb-4 p-3 rounded-lg bg-error/10 border border-error text-body-sm text-error">
          The <code>crm_lead_scoring_rules</code> / <code>crm_lead_score_bands</code> tables are not applied to the live database yet. Creating rules will fail until the migration runs.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4 flex-1 min-h-0">
        {/* RULES PANEL */}
        <div className="bg-white rounded-xl border border-surface-dim overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-surface-dim">
            <h2 className="text-headline-sm">Scoring rules</h2>
            <p className="text-[11px] text-on-surface-variant">Each rule adds or subtracts points from a lead&apos;s score.</p>
          </div>

          {/* Add-rule form */}
          <div className="px-4 py-3 border-b border-surface-dim bg-surface-container-lowest">
            <div className="flex items-end gap-2 flex-wrap">
              <div className="flex-1 min-w-[140px]">
                <label className="field-label">Field</label>
                <select className="field-input" value={field} onChange={(e) => setField(e.target.value)}>
                  {FIELDS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                </select>
              </div>
              <div className="w-28">
                <label className="field-label">Operator</label>
                <select className="field-input" value={operator} onChange={(e) => setOperator(e.target.value)}>
                  {OPERATORS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </div>
              <div className="flex-1 min-w-[120px]">
                <label className="field-label">Value</label>
                <input className="field-input" value={value} onChange={(e) => setValue(e.target.value)} placeholder="(blank for is_set)" disabled={operator === 'is_set' || operator === 'is_not_set'} />
              </div>
              <div className="w-20">
                <label className="field-label">Points</label>
                <input className="field-input" type="number" value={points} onChange={(e) => setPoints(e.target.value)} />
              </div>
              <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container disabled:opacity-40 flex items-center gap-1" onClick={addRule} disabled={saving}>
                <span className="material-symbols-outlined text-[16px]">add</span>{saving ? '…' : 'Add rule'}
              </button>
            </div>
          </div>

          {/* Rules list */}
          <div className="flex-1 overflow-y-auto">
            {rulesLoaded && rules.length === 0 && (
              <div className="px-4 py-8 text-center text-on-surface-variant text-body-sm">
                No scoring rules yet. Add the first rule above. The core pack ships: has_email +10, has_phone +10, inbound +20, engaged_7d +25, stale −20.
              </div>
            )}
            <table className="w-full text-left text-body-sm">
              <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider sticky top-0">
                <tr>
                  <th className="px-3 py-2">Active</th>
                  <th className="px-3 py-2">Field</th>
                  <th className="px-3 py-2">Op</th>
                  <th className="px-3 py-2">Value</th>
                  <th className="px-3 py-2 text-right">Points</th>
                  <th className="w-8 px-2 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-dim">
                {rules.map((r) => (
                  <tr key={r.id} className="hover:bg-surface-container-low">
                    <td className="px-3 py-2">
                      <button
                        className={`w-9 h-5 rounded-full relative transition-colors ${r.is_active ? 'bg-primary' : 'bg-surface-dim'}`}
                        onClick={() => toggleActive(r)}
                        title={r.is_active ? 'Active — click to disable' : 'Disabled — click to activate'}
                      >
                        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${r.is_active ? 'left-[18px]' : 'left-0.5'}`} />
                      </button>
                    </td>
                    <td className="px-3 py-2 font-medium">{FIELDS.find((f) => f.id === r.field)?.label || r.field}</td>
                    <td className="px-3 py-2 text-on-surface-variant">{OPERATORS.find((o) => o.id === r.operator)?.label || r.operator}</td>
                    <td className="px-3 py-2 text-on-surface-variant">{r.value || '—'}</td>
                    <td className={`px-3 py-2 text-right tabular-nums font-semibold ${r.points >= 0 ? 'text-secondary' : 'text-error'}`}>
                      {r.points >= 0 ? '+' : ''}{r.points}
                    </td>
                    <td className="px-2 py-2">
                      <button className="text-on-surface-variant hover:text-error" onClick={() => removeRule(r.id)} title="Delete rule">
                        <span className="material-symbols-outlined text-[16px]">delete</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* BANDS PANEL */}
        <div className="bg-white rounded-xl border border-surface-dim overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-surface-dim">
            <h2 className="text-headline-sm">Score bands</h2>
            <p className="text-[11px] text-on-surface-variant">Thresholds that label a lead hot / warm / cold.</p>
          </div>

          {/* Add-band form */}
          <div className="px-4 py-3 border-b border-surface-dim bg-surface-container-lowest">
            <div className="flex items-end gap-2 flex-wrap">
              <div className="flex-1 min-w-[80px]">
                <label className="field-label">Label</label>
                <select className="field-input" value={bandLabel} onChange={(e) => setBandLabel(e.target.value)}>
                  <option value="hot">hot</option>
                  <option value="warm">warm</option>
                  <option value="cold">cold</option>
                </select>
              </div>
              <div className="w-20">
                <label className="field-label">Min</label>
                <input className="field-input" type="number" min={0} max={100} value={bandMin} onChange={(e) => setBandMin(e.target.value)} />
              </div>
              <div className="w-20">
                <label className="field-label">Max</label>
                <input className="field-input" type="number" min={0} max={100} value={bandMax} onChange={(e) => setBandMax(e.target.value)} />
              </div>
              <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container disabled:opacity-40 flex items-center gap-1" onClick={addBand} disabled={savingBand}>
                <span className="material-symbols-outlined text-[16px]">add</span>{savingBand ? '…' : 'Add'}
              </button>
            </div>
          </div>

          {/* Bands list */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {bandsLoaded && bands.length === 0 && (
              <div className="text-center text-on-surface-variant text-body-sm py-4">No bands yet. Defaults: hot ≥ 70, warm 40–69, cold &lt; 40.</div>
            )}
            {bands.map((b) => (
              <div key={b.id} className="flex items-center gap-3 p-3 bg-surface-container-low rounded-lg">
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${BAND_COLORS[b.label] || BAND_COLORS.cold}`}>{b.label}</span>
                <span className="text-body-sm tabular-nums">{b.min_score}–{b.max_score}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
