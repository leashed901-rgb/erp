/**
 * Category alias bridge — the names the UI sends vs the categories tree.
 *
 * The tree in the DB is the authority and is never renamed. But the UI
 * speaks two older vocabularies: the storefront departments (Men, Women,
 * Children, Home goods, …) and the legacy Printify catalog names the
 * sidebar screens were built on (Apparel, Headwear, Drinkware,
 * Cards & stationery, …). Those names resolve to NOTHING in the tree, so
 * every department screen and the Design Studio flyout honestly returned
 * zero products — not because the products aren't there, but because the
 * name didn't match.
 *
 * This map is the one bridge: a UI name resolves to the tree node(s) it
 * means. Resolution always tries the direct name/slug match FIRST and
 * only falls back to an alias — so a real node named 'Leggings' still
 * wins over the 'Leggings → All bottoms' alias when the request is for
 * the root itself. A value may list several nodes (Apparel = the three
 * clothing roots). Names with no honest target (Business & commercial,
 * Keepsakes, Wellness, Collections) are deliberately absent — they stay
 * unmatched instead of being silently substituted.
 *
 * Pure module — no imports, safe for the server route and the client.
 */

export const normCategoryName = (s: string): string =>
  s.trim().toLowerCase().replace(/[^a-z0-9]/g, '');

export const CATEGORY_ALIASES: Record<string, string | string[]> = {
  // Storefront departments → tree roots.
  men: "Men's clothing",
  women: "Women's clothing",
  children: "Kids' & youth clothing",
  homeliving: 'Home & living',
  homegoods: 'Home & living',
  headwear: 'Hats',
  drinkware: 'Drinkware & coasters',
  technology: 'Tech accessories',
  gamespuzzles: 'Toys & games',
  cardsstationery: 'Stationery',
  // Legacy Printify catalog departments → tree nodes.
  apparel: ["Men's clothing", "Women's clothing", "Kids' & youth clothing"],
  // Storefront subcategories → the tree's "All …" rollups.
  bottoms: 'All bottoms',
  shirts: 'All shirts',
  tshirts: 'All shirts',
  hoodies: 'All hoodies & sweatshirts',
  sweatshirts: 'All hoodies & sweatshirts',
  sweatshirt: 'All hoodies & sweatshirts',
  skirtsdresses: 'Dresses',
  pants: 'All bottoms',
  shorts: 'All bottoms',
  sweatpants: 'All bottoms',
  sweatpantsjoggers: 'All bottoms',
  leggings: 'All bottoms',
};

/** The tree node name(s) a UI name means, or null when it means none. */
export function aliasFor(name: string): string[] | null {
  const hit = CATEGORY_ALIASES[normCategoryName(name)];
  if (!hit) return null;
  return Array.isArray(hit) ? hit : [hit];
}
