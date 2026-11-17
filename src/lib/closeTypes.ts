/**
 * Month-end close DTOs — Batch G (doc 28). Canonical acct_* close
 * tables: acct_periods, acct_fiscal_years, acct_closes,
 * acct_close_templates, acct_close_template_tasks, acct_close_tasks,
 * acct_close_checklists, acct_close_task_comments, acct_flux_explanations,
 * acct_auto_reversals, acct_journal_batches, acct_review_runs,
 * acct_review_findings, acct_review_comments, acct_review_ignore_rules.
 *
 * The engine owns the workflow: acct_generate_close instantiates tasks
 * from the default "Month-end close" template; acct_close_status runs
 * the per-task checks live; acct_complete_close_task refuses a failing
 * check unless an override note is given (and sends signoff tasks to
 * ready_for_review); acct_finalize_close refuses open tasks / open
 * error findings unless a force note is given.
 */

export type PeriodStatus = 'future' | 'open' | 'soft_closed' | 'closed' | 'locked';
export type CloseStatus = 'open' | 'in_review' | 'soft_closed' | 'closed';
export type CloseTaskStatus =
  | 'todo' | 'in_progress' | 'blocked' | 'ready_for_review' | 'done' | 'skipped';

export interface FiscalYear {
  id: string;
  fiscalYear: number;
  startDate: string;
  endDate: string;
}

export interface Period {
  id: string;
  fiscalYearId: string;
  periodNo: number;
  name: string;
  startDate: string;
  endDate: string;
  status: PeriodStatus;
  closedAt: string | null;
  closeId: string | null;
  closeStatus: CloseStatus | null;
}

export interface CloseTask {
  id: string;
  section: string;
  title: string;
  status: CloseTaskStatus;
  due: string | null;
  overdue: boolean;
  priority: number;
  assignee: string | null;
  reviewer: string | null;
  check: { passed?: boolean; detail?: string } | null;
  parent: string | null;
  tags: string[];
  description?: string | null;
  requiresSignoff?: boolean;
}

export interface CloseSummary {
  id: string;
  periodId: string;
  periodName: string | null;
  periodStart: string;
  periodEnd: string;
  status: CloseStatus;
  tasksTotal: number;
  tasksDone: number;
  tasksOverdue: number;
  openErrorFindings: number;
  periodStatus: PeriodStatus | null;
  startedAt: string | null;
  finalizedAt: string | null;
}

export interface CloseDetail extends CloseSummary {
  tasks: CloseTask[];
  notes: string | null;
}

export interface CloseTemplate {
  id: string;
  name: string;
  frequency: string;
  isDefault: boolean;
  isActive: boolean;
  taskCount: number;
}

export interface CloseTemplateTask {
  id: string;
  section: string;
  title: string;
  description: string | null;
  sortOrder: number;
  dueOffsetDays: number;
  appliesTo: string;
  checkCode: string | null;
  requiresSignoff: boolean;
  priority: number;
}

export interface CloseChecklistItem {
  id: string;
  periodId: string;
  taskCode: string;
  taskName: string;
  sequenceNo: number;
  required: boolean;
  status: string;
  assignedTo: string | null;
  completedAt: string | null;
  notes: string | null;
}

export interface FluxRow {
  accountId: string;
  code: string;
  name: string;
  accountType: string;
  basis: string;
  currentAmount: number;
  priorAmount: number;
  change: number;
  changePct: number | null;
  flagged: boolean;
  explanation: string | null;
  topDrivers: { counterparty: string | null; amount: number; lines: number }[];
}

export interface ReviewRun {
  id: string;
  periodFrom: string;
  periodTo: string;
  findingCount: number;
  newCount: number;
  runAt: string;
  summary: Record<string, unknown> | null;
}

export interface ReviewFinding {
  id: string;
  checkCode: string;
  severity: 'error' | 'warning' | 'info';
  title: string;
  detail: string | null;
  sourceType: string | null;
  sourceId: string | null;
  journalEntryId: string | null;
  accountId: string | null;
  amount: number | null;
  txnDate: string | null;
  status: 'open' | 'in_progress' | 'resolved' | 'ignored';
  assigneeId: string | null;
  resolutionNote: string | null;
  firstRunId: string;
  lastRunId: string;
}

export interface AutoReversal {
  id: string;
  journalEntryId: string;
  entryNo: string | null;
  reverseOn: string;
  reversalJournalId: string | null;
  status: string;
  error: string | null;
}

export interface JournalBatch {
  id: string;
  batchNo: string;
  source: string;
  status: string;
  description: string | null;
  entryCount: number;
  createdAt: string;
  postedAt: string | null;
}
