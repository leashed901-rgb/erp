/**
 * Cap Table & Valuation — live state types.
 *
 * These types describe what GET /api/equity/state returns from the live
 * cap_* / val_* tables (via the cap_table RPC and direct selects). They
 * replace the static CAP constant that used to drive every cap screen.
 * Numbers are raw (shares, dollars); views format them.
 */

export interface CapCompanyState {
  profileId: string | null;
  entityId: string | null;
  name: string | null;
  entityType: string | null;
  stateOfIncorporation: string | null;
  incorporatedOn: string | null;
  fiscalYearEnd: string | null;
  authorized: number;
  issued: number;
  fullyDiluted: number;
  parValue: number | null;
}

export interface CapHolderRow {
  stakeholderId: string | null;
  name: string;
  role: string;
  kind: string;
  shareClass: string;
  shares: number;
  options: number;
  optionsVested: number;
  fullyDiluted: number;
  pctOutstanding: number;
  pctFullyDiluted: number;
  invested: number;
}

export interface CapClassRow {
  id: string;
  name: string;
  classType: string;
  authorized: number;
  issued: number;
  available: number;
  parValue: number;
  liquidationMultiple: number;
  participating: boolean;
  seniority: number;
  conversionRatio: number;
  votesPerShare: number;
}

export interface CapStakeholderRow {
  id: string;
  name: string;
  email: string | null;
  type: string;
  kind: string;
  isBoard: boolean;
  isInsider: boolean;
  partyId: string | null;
}

export interface CapRoundRow {
  id: string;
  name: string;
  type: string;
  status: string;
  closedOn: string | null;
  preMoney: number | null;
  targetAmount: number | null;
  pricePerShare: number | null;
  sharesIssued: number;
  lead: string | null;
  shareClassId: string | null;
}

export interface CapPoolRow {
  id: string;
  name: string;
  shareClassId: string;
  className: string;
  authorized: number;
  granted: number;
  exercised: number;
  available: number;
  adoptedOn: string | null;
}

export interface CapGrantRow {
  id: string;
  holder: string;
  stakeholderId: string;
  poolId: string;
  poolName: string;
  grantDate: string;
  shares: number;
  exercised: number;
  cancelled: number;
  vested: number;
  unvested: number;
  strike: number;
  vestingMonths: number;
  cliffMonths: number;
  type: string;
  status: string;
  expiresOn: string | null;
}

export interface CapSafeRow {
  id: string;
  holder: string;
  stakeholderId: string;
  instrument: string;
  issuedOn: string;
  principal: number;
  valuationCap: number | null;
  discountRate: number | null;
  interestRate: number | null;
  mfn: boolean;
  proRata: boolean;
  status: string;
}

export interface CapValuationRow {
  id: string;
  effectiveDate: string;
  expiresOn: string;
  type: string;
  fmvPerShare: number;
  preferredPrice: number | null;
  provider: string | null;
  status: string;
  method: string | null;
}

export interface CapDocRow {
  id: string;
  title: string;
  type: string;
  status: string;
  signedOn: string | null;
  createdAt: string;
  fileUrl: string | null;
}

export interface CapEventRow {
  id: string;
  seq: number | null;
  date: string;
  eventType: string;
  holder: string | null;
  shareClass: string | null;
  shares: number | null;
  amount: number | null;
  details: Record<string, unknown>;
}

export interface CapApprovalRow {
  id: string;
  type: string;
  method: string;
  adoptedOn: string;
  signerIds: string[];
  documentId: string | null;
}

export interface CapSnapshotRow {
  id: string;
  asOf: string;
  reason: string;
  totalOutstanding: number;
  totalFullyDiluted: number;
  lastEventSeq: number | null;
}

export interface CapValRequestRow {
  id: string;
  valuationDate: string;
  purpose: string;
  method: string;
  providerName: string | null;
  status: string;
  snapshotId: string | null;
}

export interface CapControlRow {
  severity: string;
  checkCode: string;
  message: string;
  relatedType: string | null;
  relatedId: string | null;
}

export interface CapIssuanceRow {
  id: string;
  stakeholderId: string;
  holderName: string;
  shareClassId: string;
  className: string;
  shares: number;
  pricePerShare: number;
  amount: number;
  issueDate: string;
  status: string;
  certificateNo: string | null;
  roundId: string | null;
}

export interface CapQualifiedIndividualRow {
  id: string;
  fullName: string;
  firm: string | null;
  isIndependent: boolean;
  yearsExperience: number;
}

export interface CapState {
  asOf: string;
  company: CapCompanyState;
  holders: CapHolderRow[];
  classes: CapClassRow[];
  stakeholders: CapStakeholderRow[];
  qualifiedIndividuals: CapQualifiedIndividualRow[];
  rounds: CapRoundRow[];
  pools: CapPoolRow[];
  grants: CapGrantRow[];
  safes: CapSafeRow[];
  issuances: CapIssuanceRow[];
  valuations: CapValuationRow[];
  documents: CapDocRow[];
  events: CapEventRow[];
  approvals: CapApprovalRow[];
  snapshots: CapSnapshotRow[];
  valRequests: CapValRequestRow[];
  optionPool: {
    total: number;
    granted: number;
    exercised: number;
    available: number;
    unvested: number;
  };
  activeFmv: {
    fmvPerShare: number;
    effectiveDate: string;
    expiresOn: string;
    provider: string | null;
  } | null;
  ledger: {
    valid: boolean;
    eventsChecked: number;
    headHash: string | null;
    firstBrokenSeq: number | null;
  };
  controls: CapControlRow[];
  compliance: CapControlRow[];
}
