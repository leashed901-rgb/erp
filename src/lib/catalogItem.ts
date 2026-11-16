import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/**
 * catalogItem.ts — the storefront product <-> commerce catalog item bridge
 * (doc 18, channel listings).
 *
 * `commerce_channel_products.catalog_item_id` references
 * `commerce_catalog_items(id)` — the canonical catalog item — NOT the
 * storefront `products` table. Nothing in the app ever creates catalog
 * items, so a product has no listing identity until one is provisioned.
 * The link is deterministic: the item's `metadata.slug` is the product's
 * slug (there is a lookup index on exactly that expression), and `sku` is
 * the product's first active variant SKU (or the slug when there is none).
 * Provisioning is real master data, not mock data.
 */

export interface CatalogItem {
  id: string;
  sku: string;
  name: string;
}

/** Find the catalog item for a storefront product, or null (no creation). */
export async function findCatalogItemForProduct(productId: string): Promise<CatalogItem | null> {
  const { data: product } = await supabaseAdmin()
    .from('products')
    .select('id, slug')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', productId)
    .maybeSingle();
  if (!product) return null;
  const { data } = await supabaseAdmin()
    .from('commerce_catalog_items')
    .select('id, sku, name')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('metadata->>slug', (product.slug as string) || '')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as CatalogItem | null) ?? null;
}

/** Resolve a product to its catalog item, provisioning the row when missing. */
export async function resolveOrCreateCatalogItem(productId: string): Promise<CatalogItem> {
  const existing = await findCatalogItemForProduct(productId);
  if (existing) return existing;
  const { data: product, error: pErr } = await supabaseAdmin()
    .from('products')
    .select('id, slug, name, description, brand')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', productId)
    .single();
  if (pErr || !product) throw new Error(`No catalog product ${productId}.`);
  const { data: variant } = await supabaseAdmin()
    .from('product_variants')
    .select('sku')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('product_id', productId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  const sku = (variant?.sku as string | null) || (product.slug as string) || `PROD-${String(product.id).slice(0, 8)}`;
  const { data, error } = await supabaseAdmin()
    .from('commerce_catalog_items')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      sku,
      name: (product.name as string) || 'Unnamed product',
      description: (product.description as string | null) || null,
      brand: (product.brand as string | null) || null,
      item_type: 'product',
      active: true,
      metadata: { slug: product.slug, product_id: product.id },
    })
    .select('id, sku, name')
    .single();
  if (error) throw new Error(`Could not provision catalog item for ${(product.name as string) || productId}: ${error.message}`);
  return data as CatalogItem;
}
