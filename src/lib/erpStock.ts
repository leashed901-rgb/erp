import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/**
 * erpStock.ts — shared helpers for the inventory / returns wiring (docs 16/17).
 *
 * The ERP stock ledger keys everything off `erp_product_skus`, but nothing in
 * the app ever provisions those rows: the table is empty for this tenant and
 * no route or sync writes it. `erp_adjust_stock`, `erp_transfer_stock`,
 * `erp_open_return` and `erp_stock_history` all take an ERP SKU id, so the
 * wiring resolves a catalog variant to its ERP SKU and provisions the row
 * from the real variant (product, variant, catalog SKU, price) when it does
 * not exist yet — via the `erp_products` master row and the
 * `erp_product_variants` row, which are the FK targets of
 * `erp_product_skus.product_id` and `erp_product_skus.variant_id`
 * (see resolveOrCreateSku). Provisioning is real master data, not mock
 * data — the row is the variant's warehouse identity from then on.
 */

export interface ErpSku {
  id: string;
  sku: string;
  product_id: string;
  variant_id: string | null;
  catalog_variant_id: string | null;
  unit_price: number;
  standard_cost: number;
}

/** Find the ERP SKU for a catalog variant, or null when none exists yet. */
export async function findSkuForVariant(variantId: string): Promise<ErpSku | null> {
  const { data } = await supabaseAdmin()
    .from('erp_product_skus')
    .select('id, sku, product_id, variant_id, catalog_variant_id, unit_price, standard_cost')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .or(`catalog_variant_id.eq.${variantId},variant_id.eq.${variantId},id.eq.${variantId}`)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as ErpSku | null) ?? null;
}

/** Batch version of findSkuForVariant — one query per 100 variant ids. */
export async function findSkusForVariants(variantIds: string[]): Promise<Map<string, ErpSku>> {
  const out = new Map<string, ErpSku>();
  for (let i = 0; i < variantIds.length; i += 100) {
    const chunk = variantIds.slice(i, i + 100);
    // ONE .or() call: chaining .or() twice makes PostgREST AND the two
    // groups, which matches nothing (a row's catalog_variant_id and
    // variant_id are different ids). All conditions in a single group.
    const orFilter = chunk
      .flatMap((id) => [`catalog_variant_id.eq.${id}`, `variant_id.eq.${id}`])
      .join(',');
    const { data } = await supabaseAdmin()
      .from('erp_product_skus')
      .select('id, sku, product_id, variant_id, catalog_variant_id, unit_price, standard_cost')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .or(orFilter);
    for (const row of (data ?? []) as ErpSku[]) {
      if (row.catalog_variant_id) out.set(row.catalog_variant_id, row);
      if (row.variant_id) out.set(row.variant_id, row);
      out.set(row.id, row);
    }
  }
  return out;
}

/**
 * Resolve a catalog variant to its ERP SKU, provisioning the row from the
 * real variant when missing. Throws when the variant does not exist.
 *
 * Two-step provision — the FK chain matters here:
 * `erp_product_skus.product_id` references `erp_products(id)` (the ERP
 * product master), NOT the storefront `products` table. `erp_products`
 * links back to the storefront via `catalog_product_id`. So a variant's
 * ERP identity is: storefront product -> erp_products row (created from
 * the real product when missing) -> erp_product_skus row.
 */
export async function resolveOrCreateErpProduct(productId: string): Promise<{ id: string }> {
  const { data: existing } = await supabaseAdmin()
    .from('erp_products')
    .select('id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('catalog_product_id', productId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existing) return existing as { id: string };
  const { data: product, error: pErr } = await supabaseAdmin()
    .from('products')
    .select('id, name, description, brand')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', productId)
    .single();
  if (pErr || !product) throw new Error(`No catalog product ${productId}.`);
  const { data, error } = await supabaseAdmin()
    .from('erp_products')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      catalog_product_id: product.id,
      source_product_id: String(product.id),
      name: (product.name as string) || 'Unnamed product',
      description: (product.description as string | null) || null,
      brand: (product.brand as string | null) || null,
      is_inventory_item: true,
      is_sellable: true,
      is_purchasable: true,
      is_active: true,
    })
    .select('id')
    .single();
  if (error) throw new Error(`Could not provision ERP product for ${(product.name as string) || productId}: ${error.message}`);
  return data as { id: string };
}

export async function resolveOrCreateSku(variantId: string): Promise<ErpSku> {
  const existing = await findSkuForVariant(variantId);
  if (existing) return existing;
  const { data: variant, error: vErr } = await supabaseAdmin()
    .from('product_variants')
    .select('id, product_id, sku, price, size, color')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', variantId)
    .single();
  if (vErr || !variant) throw new Error(`No catalog variant ${variantId}.`);
  const erpProduct = await resolveOrCreateErpProduct(variant.product_id as string);
  // Middle step — erp_product_skus.variant_id references erp_product_variants,
  // which links back to the catalog variant via catalog_variant_id.
  const { data: erpVariant, error: evErr } = await supabaseAdmin()
    .from('erp_product_variants')
    .select('id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('catalog_variant_id', variant.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  let erpVariantId: string;
  if (erpVariant) {
    erpVariantId = (erpVariant as { id: string }).id;
  } else {
    const { data: created, error: cErr } = await supabaseAdmin()
      .from('erp_product_variants')
      .insert({
        tenant_id: DEFAULT_TENANT_ID,
        product_id: erpProduct.id,
        catalog_variant_id: variant.id,
        name: [variant.size, variant.color].filter(Boolean).join(' / ') || (variant.sku as string) || 'Default',
        attributes: { size: variant.size ?? null, color: variant.color ?? null },
        is_active: true,
      })
      .select('id')
      .single();
    if (cErr || !created) throw new Error(`Could not provision ERP variant for ${(variant.sku as string) || variantId}: ${cErr?.message ?? 'unknown error'}`);
    erpVariantId = (created as { id: string }).id;
  }
  const skuText = (variant.sku as string | null) || `SKU-${String(variant.id).slice(0, 8)}`;
  // A SKU row with this sku text may already exist, orphaned when its
  // variant was deleted (unique on tenant+sku). Reuse it: re-link it to
  // this variant instead of crashing on the unique constraint. Only an
  // orphan (no catalog variant linked) is reused — a sku that belongs to
  // another live variant still fails loudly on insert below.
  const { data: orphan } = await supabaseAdmin()
    .from('erp_product_skus')
    .select('id, sku, product_id, variant_id, catalog_variant_id, unit_price, standard_cost')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('sku', skuText)
    .is('catalog_variant_id', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (orphan) {
    const { data: relinked, error: rlErr } = await supabaseAdmin()
      .from('erp_product_skus')
      .update({ catalog_variant_id: variant.id, variant_id: erpVariantId })
      .eq('id', (orphan as { id: string }).id)
      .select('id, sku, product_id, variant_id, catalog_variant_id, unit_price, standard_cost')
      .single();
    if (rlErr || !relinked) throw new Error(`Could not re-link orphaned ERP SKU ${skuText}: ${rlErr?.message ?? 'unknown error'}`);
    return relinked as ErpSku;
  }
  const { data, error } = await supabaseAdmin()
    .from('erp_product_skus')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      product_id: erpProduct.id,
      variant_id: erpVariantId,
      catalog_variant_id: variant.id,
      sku: skuText,
      unit_price: Number(variant.price ?? 0),
      standard_cost: 0,
      is_active: true,
    })
    .select('id, sku, product_id, variant_id, catalog_variant_id, unit_price, standard_cost')
    .single();
  if (error) throw new Error(`Could not provision ERP SKU for ${skuText}: ${error.message}`);
  return data as ErpSku;
}

/** The tenant's first active warehouse (the ERP default), or null. */
export async function defaultWarehouse(): Promise<{ id: string; name: string } | null> {
  const { data } = await supabaseAdmin()
    .from('erp_warehouses')
    .select('id, name')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as { id: string; name: string } | null) ?? null;
}
