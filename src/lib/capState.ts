import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import type {
  CapApprovalRow,
  CapClassRow,
  CapControlRow,
  CapDocRow,
  CapEventRow,
  CapGrantRow,
  CapHolderRow,
  CapIssuanceRow,
  CapPoolRow,
  CapQualifiedIndividualRow,
  CapRoundRow,
  CapSafeRow,
  CapSnapshotRow,
  CapStakeholderRow,
  CapState,
  CapValRequestRow,
  CapValuationRow,
} from '@/lib/capTypes';

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** PostgREST RPCs that return a scalar come back as the value itself. */
function scalar<T>(data: unknown): T | null {
  if (Array.isArray(data)) return (data[0] as T) ?? null;
  return (data as T) ?? null;
}

export async function loadCapState(asOf?: string): Promise<CapState> {
  const sb = supabaseAdmin();
  const asOfDate = asOf || new Date().toISOString().slice(0, 10);
  const tenant = DEFAULT_TENANT_ID;

  const { data: entityId, error: entityErr } = await sb.rpc('acct_default_entity', {
    p_tenant_id: tenant,
  });
  if (entityErr) throw new Error(`acct_default_entity: ${entityErr.message}`);
  const entityIdStr = String(entityId);

  const [
    entityRes,
    profileRes,
    tableRes,
    classesRes,
    stakeholdersRes,
    roundsRes,
    poolsRes,
    grantsRes,
    convertiblesRes,
    valuationsRes,
    eventsRes,
    documentsRes,
    approvalsRes,
    snapshotsRes,
    valRequestsRes,
    ledgerRes,
    controlsRes,
    complianceRes,
    issuancesRes,
    qualifiedRes,
  ] = await Promise.all([
    sb.from('acct_entities').select('legal_name,display_name,entity_type').eq('id', entityIdStr).maybeSingle(),
    sb.from('cap_issuer_profiles').select('*').eq('tenant_id', tenant).maybeSingle(),
    sb.rpc('cap_table', { p_tenant_id: tenant, p_as_of: asOfDate }),
    sb.from('cap_share_classes').select('*').eq('tenant_id', tenant).order('seniority', { ascending: true }),
    sb.from('cap_stakeholders').select('*').eq('tenant_id', tenant).order('name'),
    sb.from('cap_funding_rounds').select('*').eq('tenant_id', tenant).order('created_at', { ascending: false }),
    sb.from('cap_option_pools').select('*').eq('tenant_id', tenant).order('created_at'),
    sb.from('cap_option_grants').select('*').eq('tenant_id', tenant).order('granted_on', { ascending: false }),
    sb.from('cap_convertibles').select('*').eq('tenant_id', tenant).order('issued_on', { ascending: false }),
    sb.from('cap_valuations').select('*').eq('tenant_id', tenant).order('effective_date', { ascending: false }),
    sb.from('cap_equity_events').select('*').eq('tenant_id', tenant).order('seq', { ascending: false }).limit(50),
    sb.from('cap_documents').select('*').eq('tenant_id', tenant).order('created_at', { ascending: false }),
    sb.from('cap_board_approvals').select('*').eq('tenant_id', tenant).order('adopted_on', { ascending: false }),
    sb.from('cap_table_snapshots').select('*').eq('tenant_id', tenant).order('as_of_date', { ascending: false }).limit(5),
    sb.from('val_requests').select('*').eq('tenant_id', tenant).order('created_at', { ascending: false }),
    sb.rpc('cap_verify_event_chain', { p_tenant_id: tenant }),
    sb.rpc('cap_controls_check', { p_tenant_id: tenant, p_as_of: asOfDate }),
    sb.rpc('cap_compliance_check', { p_tenant_id: tenant, p_as_of: asOfDate }),
    sb.from('cap_issuances').select('id,stakeholder_id,share_class_id,round_id,shares,amount,price_per_share,issue_date,status,certificate_no').eq('tenant_id', tenant).eq('status', 'active'),
    sb.from('cap_qualified_individuals').select('*').eq('tenant_id', tenant).order('full_name'),
  ]);

  for (const [name, res] of [
    ['acct_entities', entityRes],
    ['cap_issuer_profiles', profileRes],
    ['cap_table', tableRes],
    ['cap_share_classes', classesRes],
    ['cap_stakeholders', stakeholdersRes],
    ['cap_funding_rounds', roundsRes],
    ['cap_option_pools', poolsRes],
    ['cap_option_grants', grantsRes],
    ['cap_convertibles', convertiblesRes],
    ['cap_valuations', valuationsRes],
    ['cap_equity_events', eventsRes],
    ['cap_documents', documentsRes],
    ['cap_board_approvals', approvalsRes],
    ['cap_table_snapshots', snapshotsRes],
    ['val_requests', valRequestsRes],
    ['cap_verify_event_chain', ledgerRes],
    ['cap_controls_check', controlsRes],
    ['cap_compliance_check', complianceRes],
    ['cap_issuances', issuancesRes],
    ['cap_qualified_individuals', qualifiedRes],
  ] as const) {
    const err = (res as { error?: { message: string } | null }).error;
    if (err) throw new Error(`${name}: ${err.message}`);
  }

  const entity = entityRes.data as { legal_name?: string; display_name?: string; entity_type?: string } | null;
  const profile = profileRes.data as Record<string, unknown> | null;
  const tableRows = (tableRes.data ?? []) as Record<string, unknown>[];
  const classes = (classesRes.data ?? []) as Record<string, unknown>[];
  const stakeholders = (stakeholdersRes.data ?? []) as Record<string, unknown>[];
  const rounds = (roundsRes.data ?? []) as Record<string, unknown>[];
  const pools = (poolsRes.data ?? []) as Record<string, unknown>[];
  const grants = (grantsRes.data ?? []) as Record<string, unknown>[];
  const convertibles = (convertiblesRes.data ?? []) as Record<string, unknown>[];
  const valuations = (valuationsRes.data ?? []) as Record<string, unknown>[];
  const events = (eventsRes.data ?? []) as Record<string, unknown>[];
  const documents = (documentsRes.data ?? []) as Record<string, unknown>[];
  const approvals = (approvalsRes.data ?? []) as Record<string, unknown>[];
  const snapshots = (snapshotsRes.data ?? []) as Record<string, unknown>[];
  const valRequests = (valRequestsRes.data ?? []) as Record<string, unknown>[];
  const issuances = (issuancesRes.data ?? []) as Record<string, unknown>[];

  const classById = new Map(classes.map((c) => [String(c.id), c]));
  const holderById = new Map(stakeholders.map((s) => [String(s.id), s]));
  const poolById = new Map(pools.map((p) => [String(p.id), p]));

  // Per-class available shares (authorized − issued − pool reserves).
  const availableByClass = new Map<string, number>();
  await Promise.all(
    classes.map(async (c) => {
      const { data, error } = await sb.rpc('cap_available_shares', { p_class_id: String(c.id) });
      if (!error) availableByClass.set(String(c.id), num(scalar<number>(data)));
    }),
  );

  // Per-grant vested shares as of the date (the RPC does the cliff math).
  const vestedByGrant = new Map<string, number>();
  await Promise.all(
    grants.map(async (g) => {
      const { data, error } = await sb.rpc('cap_vested_shares', { p_grant_id: String(g.id), p_as_of: asOfDate });
      if (!error) vestedByGrant.set(String(g.id), num(scalar<number>(data)));
    }),
  );

  const investedByHolder = new Map<string, number>();
  const issuedByClass = new Map<string, number>();
  for (const i of issuances) {
    const sid = String(i.stakeholder_id);
    investedByHolder.set(sid, (investedByHolder.get(sid) ?? 0) + num(i.amount));
    const cid = String(i.share_class_id);
    issuedByClass.set(cid, (issuedByClass.get(cid) ?? 0) + num(i.shares));
  }

  const issuanceRows: CapIssuanceRow[] = issuances.map((i) => ({
    id: String(i.id),
    stakeholderId: String(i.stakeholder_id),
    holderName: String(holderById.get(String(i.stakeholder_id))?.name ?? ''),
    shareClassId: String(i.share_class_id),
    className: String(classById.get(String(i.share_class_id))?.name ?? ''),
    shares: num(i.shares),
    pricePerShare: num(i.price_per_share),
    amount: num(i.amount),
    issueDate: String(i.issue_date),
    status: String(i.status),
    certificateNo: (i.certificate_no as string | null) ?? null,
    roundId: (i.round_id as string | null) ?? null,
  }));

  const holders: CapHolderRow[] = tableRows.map((r) => {
    const sid = r.stakeholder_id ? String(r.stakeholder_id) : null;
    const holder = sid ? holderById.get(sid) : undefined;
    return {
      stakeholderId: sid,
      name: String(r.holder_name ?? ''),
      role: holder ? String(holder.stakeholder_type ?? '') : '',
      kind: String(r.holder_kind ?? ''),
      shareClass: String(r.share_class ?? ''),
      shares: num(r.issued_shares),
      options: num(r.options_outstanding),
      optionsVested: num(r.options_vested),
      fullyDiluted: num(r.fully_diluted),
      pctOutstanding: num(r.pct_outstanding),
      pctFullyDiluted: num(r.pct_fully_diluted),
      invested: sid ? investedByHolder.get(sid) ?? 0 : 0,
    };
  });

  const classRows: CapClassRow[] = classes.map((c) => ({
    id: String(c.id),
    name: String(c.name),
    classType: String(c.class_type),
    authorized: num(c.authorized_shares),
    issued: issuedByClass.get(String(c.id)) ?? 0,
    available: availableByClass.get(String(c.id)) ?? num(c.authorized_shares),
    parValue: num(c.par_value),
    liquidationMultiple: num(c.liquidation_multiple),
    participating: Boolean(c.participating),
    seniority: num(c.seniority),
    conversionRatio: num(c.conversion_ratio),
    votesPerShare: num(c.votes_per_share),
  }));

  const qualifiedRows: CapQualifiedIndividualRow[] = ((qualifiedRes.data ?? []) as Record<string, unknown>[]).map((q) => ({
    id: String(q.id),
    fullName: String(q.full_name),
    firm: (q.firm as string | null) ?? null,
    isIndependent: Boolean(q.is_independent),
    yearsExperience: num(q.years_experience),
  }));

  const stakeholderRows: CapStakeholderRow[] = stakeholders.map((s) => ({
    id: String(s.id),
    name: String(s.name),
    email: (s.email as string | null) ?? null,
    type: String(s.stakeholder_type),
    kind: String((s as Record<string, unknown>).holder_kind ?? 'person'),
    isBoard: Boolean(s.is_board),
    isInsider: Boolean(s.is_insider),
    partyId: (s.party_id as string | null) ?? null,
  }));

  const roundRows: CapRoundRow[] = rounds.map((r) => {
    const roundIss = issuances.filter((i) => String(i.round_id ?? '') === String(r.id));
    const sharesIssued = roundIss.reduce((s, i) => s + num(i.shares), 0);
    let lead: string | null = null;
    let leadAmt = 0;
    for (const i of roundIss) {
      if (num(i.amount) > leadAmt) {
        leadAmt = num(i.amount);
        lead = holderById.get(String(i.stakeholder_id))?.name as string | null;
      }
    }
    return {
      id: String(r.id),
      name: String(r.name),
      type: String(r.round_type),
      status: String(r.status),
      closedOn: (r.closed_on as string | null) ?? null,
      preMoney: r.pre_money_valuation == null ? null : num(r.pre_money_valuation),
      targetAmount: r.target_amount == null ? null : num(r.target_amount),
      pricePerShare: r.price_per_share == null ? null : num(r.price_per_share),
      sharesIssued,
      lead,
      shareClassId: (r.share_class_id as string | null) ?? null,
    };
  });

  const poolRows: CapPoolRow[] = pools.map((p) => {
    const poolGrants = grants.filter((g) => String(g.pool_id) === String(p.id));
    const granted = poolGrants.reduce((s, g) => s + num(g.shares) - num(g.cancelled_shares), 0);
    const exercised = poolGrants.reduce((s, g) => s + num(g.exercised_shares), 0);
    return {
      id: String(p.id),
      name: String(p.name),
      shareClassId: String(p.share_class_id),
      className: String(classById.get(String(p.share_class_id))?.name ?? ''),
      authorized: num(p.authorized_shares),
      granted,
      exercised,
      available: num(p.authorized_shares) - granted,
      adoptedOn: (p.adopted_on as string | null) ?? null,
    };
  });

  const grantRows: CapGrantRow[] = grants.map((g) => {
    const vested = vestedByGrant.get(String(g.id)) ?? 0;
    const shares = num(g.shares);
    const cancelled = num(g.cancelled_shares);
    return {
      id: String(g.id),
      holder: String(holderById.get(String(g.stakeholder_id))?.name ?? ''),
      stakeholderId: String(g.stakeholder_id),
      poolId: String(g.pool_id),
      poolName: String(poolById.get(String(g.pool_id))?.name ?? ''),
      grantDate: String(g.granted_on),
      shares,
      exercised: num(g.exercised_shares),
      cancelled,
      vested,
      unvested: Math.max(0, shares - cancelled - vested),
      strike: num(g.exercise_price),
      vestingMonths: num(g.vesting_months),
      cliffMonths: num(g.cliff_months),
      type: String(g.grant_type),
      status: String(g.status),
      expiresOn: (g.expires_on as string | null) ?? null,
    };
  });

  const safeRows: CapSafeRow[] = convertibles.map((c) => ({
    id: String(c.id),
    holder: String(holderById.get(String(c.stakeholder_id))?.name ?? ''),
    stakeholderId: String(c.stakeholder_id),
    instrument: String(c.instrument),
    issuedOn: String(c.issued_on),
    principal: num(c.principal),
    valuationCap: c.valuation_cap == null ? null : num(c.valuation_cap),
    discountRate: c.discount_rate == null ? null : num(c.discount_rate),
    interestRate: c.interest_rate == null ? null : num(c.interest_rate),
    mfn: Boolean(c.mfn),
    proRata: Boolean(c.pro_rata_rights),
    status: String(c.status),
  }));

  const valuationRows: CapValuationRow[] = valuations.map((v) => ({
    id: String(v.id),
    effectiveDate: String(v.effective_date),
    expiresOn: String(v.expires_on),
    type: String(v.valuation_type),
    fmvPerShare: num(v.fmv_per_common_share),
    preferredPrice: v.preferred_price == null ? null : num(v.preferred_price),
    provider: (v.provider as string | null) ?? null,
    status: String(v.status),
    method: (v.method as string | null) ?? null,
  }));

  const docRows: CapDocRow[] = documents.map((d) => ({
    id: String(d.id),
    title: String(d.title),
    type: String(d.document_type),
    status: String(d.status),
    signedOn: (d.signed_on as string | null) ?? null,
    createdAt: String(d.created_at),
    fileUrl: (d.file_url as string | null) ?? null,
  }));

  const eventRows: CapEventRow[] = events.map((e) => ({
    id: String(e.id),
    seq: e.seq == null ? null : Number(e.seq),
    date: String(e.event_date),
    eventType: String(e.event_type),
    holder: e.stakeholder_id ? String(holderById.get(String(e.stakeholder_id))?.name ?? '') : null,
    shareClass: e.share_class_id ? String(classById.get(String(e.share_class_id))?.name ?? '') : null,
    shares: e.shares == null ? null : num(e.shares),
    amount: e.amount == null ? null : num(e.amount),
    details: (e.details as Record<string, unknown>) ?? {},
  }));

  const approvalRows: CapApprovalRow[] = approvals.map((a) => ({
    id: String(a.id),
    type: String(a.approval_type),
    method: String(a.approval_method),
    adoptedOn: String(a.adopted_on),
    signerIds: (a.signer_stakeholder_ids as string[]) ?? [],
    documentId: (a.document_id as string | null) ?? null,
  }));

  const snapshotRows: CapSnapshotRow[] = snapshots.map((s) => ({
    id: String(s.id),
    asOf: String(s.as_of_date),
    reason: String(s.reason),
    totalOutstanding: num(s.total_outstanding),
    totalFullyDiluted: num(s.total_fully_diluted),
    lastEventSeq: s.last_event_seq == null ? null : Number(s.last_event_seq),
  }));

  const valRequestRows: CapValRequestRow[] = valRequests.map((v) => ({
    id: String(v.id),
    valuationDate: String(v.valuation_date),
    purpose: String(v.purpose),
    method: String(v.method),
    providerName: (v.provider_name as string | null) ?? null,
    status: String(v.status),
    snapshotId: (v.snapshot_id as string | null) ?? null,
  }));

  const ledgerRaw = scalar<Record<string, unknown>>(ledgerRes.data) ?? {};
  const controlsRaw = (controlsRes.data ?? []) as Record<string, unknown>[];
  const complianceRaw = (complianceRes.data ?? []) as Record<string, unknown>[];
  const toControl = (r: Record<string, unknown>): CapControlRow => ({
    severity: String(r.severity ?? ''),
    checkCode: String(r.check_code ?? ''),
    message: String(r.message ?? ''),
    relatedType: (r.related_type as string | null) ?? null,
    relatedId: (r.related_id as string | null) ?? null,
  });

  const totalAuthorized = classRows.reduce((s, c) => s + c.authorized, 0);
  const totalIssued = holders.reduce((s, h) => s + h.shares, 0);
  const totalFd = holders.reduce((s, h) => s + h.fullyDiluted, 0);
  const poolTotal = poolRows.reduce((s, p) => s + p.authorized, 0);
  const poolGranted = poolRows.reduce((s, p) => s + p.granted, 0);
  const poolExercised = poolRows.reduce((s, p) => s + p.exercised, 0);

  const finalVal = valuationRows.find((v) => v.status === 'final') ?? null;

  return {
    asOf: asOfDate,
    company: {
      profileId: profile ? String(profile.id) : null,
      entityId: entityIdStr,
      name: entity?.legal_name ?? entity?.display_name ?? null,
      entityType: entity?.entity_type ?? null,
      stateOfIncorporation: profile ? String(profile.state_of_incorporation ?? '') || null : null,
      incorporatedOn: profile ? String(profile.incorporated_on ?? '') || null : null,
      fiscalYearEnd: profile ? String(profile.fiscal_year_end ?? '12-31') : null,
      authorized: totalAuthorized,
      issued: totalIssued,
      fullyDiluted: totalFd,
      parValue: classRows.length > 0 ? Math.min(...classRows.map((c) => c.parValue)) : null,
    },
    holders,
    classes: classRows,
    stakeholders: stakeholderRows,
    qualifiedIndividuals: qualifiedRows,
    rounds: roundRows,
    pools: poolRows,
    grants: grantRows,
    safes: safeRows,
    issuances: issuanceRows,
    valuations: valuationRows,
    documents: docRows,
    events: eventRows,
    approvals: approvalRows,
    snapshots: snapshotRows,
    valRequests: valRequestRows,
    optionPool: {
      total: poolTotal,
      granted: poolGranted,
      exercised: poolExercised,
      available: poolTotal - poolGranted,
      unvested: grantRows.reduce((s, g) => s + g.unvested, 0),
    },
    activeFmv: finalVal
      ? {
          fmvPerShare: finalVal.fmvPerShare,
          effectiveDate: finalVal.effectiveDate,
          expiresOn: finalVal.expiresOn,
          provider: finalVal.provider,
        }
      : null,
    ledger: {
      valid: Boolean(ledgerRaw.valid),
      eventsChecked: num(ledgerRaw.events_checked),
      headHash: (ledgerRaw.head_hash as string | null) ?? null,
      firstBrokenSeq: ledgerRaw.first_broken_seq == null ? null : Number(ledgerRaw.first_broken_seq),
    },
    controls: controlsRaw.map(toControl),
    compliance: complianceRaw.map(toControl),
  };
}
