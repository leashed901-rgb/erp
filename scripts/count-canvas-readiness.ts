/**
 * One-shot census: what does the design canvas have to stand on?
 * Counts keeper blanks, variant rows with print_specs, blank image
 * availability (per supplier), and product_canvas_templates coverage.
 * Run: bun scripts/count-canvas-readiness.ts
 */
import { supabaseAdmin, DEFAULT_TENANT_ID } from '../src/lib/supabaseAdmin';

async function count(table: string, select: string, filters: Record<string, string> = {}) {
  let q = supabaseAdmin().from(table).select(select, { count: 'exact', head: true });
  for (const [col, val] of Object.entries(filters)) q = q.eq(col, val);
  const { count, error } = await q;
  if (error) throw new Error(`${table}: ${error.message}`);
  return count ?? 0;
}

async function main() {
  const sb = supabaseAdmin();

  // Keeper supplier ids
  const { data: suppliers } = await sb
    .from('suppliers')
    .select('id,name,slug')
    .in('slug', ['printful', 'printify', 'cloudprinter']);
  const slugById = new Map((suppliers ?? []).map((s) => [s.id as string, s.slug as string]));

  // Products per keeper supplier
  for (const s of suppliers ?? []) {
    const products = await count('supplier_catalog_products', 'id', { supplier_id: s.id as string });
    console.log(`products  ${s.slug}: ${products}`);
  }

  // Variants with print_specs (placeholder data → print inches + view images)
  for (const s of suppliers ?? []) {
    const { data: prods } = await sb
      .from('supplier_catalog_products')
      .select('id')
      .eq('supplier_id', s.id as string)
      .limit(10000);
    const ids = (prods ?? []).map((p) => p.id as string);
    let withSpecs = 0;
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const { count } = await sb
        .from('supplier_catalog_variants')
        .select('id', { count: 'exact', head: true })
        .in('supplier_catalog_product_id', chunk)
        .not('print_specs', 'is', null);
      withSpecs += count ?? 0;
    }
    console.log(`variants with print_specs  ${s.slug}: ${withSpecs}`);
  }

  // Canvas templates: total + with stored base
  const totalT = await count('product_canvas_templates', 'id');
  const withBase = await sb
    .from('product_canvas_templates')
    .select('id', { count: 'exact', head: true })
    .not('stored_base_path', 'is', null);
  console.log(`product_canvas_templates total: ${totalT}, with stored base: ${withBase.count ?? 0}`);

  // Distinct colors across keeper variants (→ images per color × view)
  const { data: colorRows } = await sb
    .from('supplier_catalog_variants')
    .select('color')
    .limit(50000);
  const colorSet = new Set((colorRows ?? []).map((r) => String(r.color ?? '').trim()).filter(Boolean));
  console.log(`distinct variant colors (all suppliers, sampled): ${colorSet.size}`);
}

void main();
