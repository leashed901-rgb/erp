import { supabaseAdmin } from '../src/lib/supabaseAdmin';
async function main() {
  const sb = supabaseAdmin();
  // One printful product with a few variants
  const { data: prod } = await sb
    .from('supplier_catalog_products')
    .select('id,name,external_id,image_url,supplier_id')
    .eq('external_id_type', 'printful_catalog_product')
    .limit(1)
    .single();
  console.log('product:', prod?.name, prod?.external_id);
  const { data: variants } = await sb
    .from('supplier_catalog_variants')
    .select('color,print_specs')
    .eq('supplier_catalog_product_id', prod!.id)
    .limit(2);
  for (const v of variants ?? []) {
    const specs = v.print_specs as Record<string, unknown>;
    console.log('color:', v.color, '| print_specs keys:', Object.keys(specs ?? {}));
    console.log(JSON.stringify(specs, null, 1).slice(0, 800));
  }
}
void main();
