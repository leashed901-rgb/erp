/**
 * Canonical Form 1120 / 4562 tax-line labels offered by the mapping UI.
 * acct_tax_lines is the reference table; rows are created on first use
 * (find-or-create in /api/tax/account-mapping) so the shipped reference
 * set and the DB stay in step.
 */
export const TAX_LINE_MAP: Record<string, { form: string; line: string }> = {
  'Gross receipts': { form: '1120', line: '1a' },
  'Returns and allowances': { form: '1120', line: '1b' },
  'Other income': { form: '1120', line: '6' },
  'Cost of goods sold': { form: '1120', line: '2' },
  'Compensation of officers': { form: '1120', line: '12' },
  'Contract labor': { form: '1120', line: '26' },
  Advertising: { form: '1120', line: '18' },
  'Office expense': { form: '1120', line: '18' },
  Utilities: { form: '1120', line: '26' },
  'Rent or lease': { form: '1120', line: '16' },
  'Shipping & delivery': { form: '1120', line: '26' },
  Software: { form: '1120', line: '26' },
  'Other deductions': { form: '1120', line: '26' },
  '§179 asset': { form: '4562', line: '§179' },
  'MACRS 5yr': { form: '4562', line: 'MACRS 5yr' },
  'MACRS 7yr': { form: '4562', line: 'MACRS 7yr' },
  'Bonus depreciation': { form: '4562', line: 'Bonus' },
};

export const TAX_LINE_LABELS = Object.keys(TAX_LINE_MAP);
