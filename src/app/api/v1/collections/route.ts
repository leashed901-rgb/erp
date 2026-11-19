import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { apiError } from '@/lib/podServer';

/**
 * GET /api/v1/collections — the collections a design can be saved to.
 * Reads the live `collections` table (name + slug); active collections
 * first. Used by the Studio drawer's "Save to Collection" create action.
 */
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin()
      .from('collections')
      .select('id,name,slug,is_active')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .order('is_active', { ascending: false })
      .order('name', { ascending: true });
    if (error) throw new Error(`collections: ${error.message}`);
    return NextResponse.json({
      items: (data ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        active: c.is_active,
      })),
    });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to list collections.');
  }
}

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || `collection-${Date.now()}`;
}

/**
 * POST /api/v1/collections — create a collection a design can be saved to.
 * Body: { name, type? ('evergreen' default), slug? }.
 * The Studio drawer only listed collections before this — a tenant with
 * none could never create one, so its select could only ever say
 * "No collections".
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      name?: unknown;
      type?: unknown;
      slug?: unknown;
    };
    const name = String(body.name ?? '').trim();
    if (!name) return apiError('Collection name is required.', 400);
    const type = String(body.type ?? 'evergreen');
    if (!['holiday', 'relationship', 'theme', 'evergreen'].includes(type)) {
      return apiError(`Unknown collection type ${type}.`, 422);
    }
    const slug = typeof body.slug === 'string' && body.slug.trim()
      ? slugify(body.slug)
      : slugify(name);
    const { data, error } = await supabaseAdmin()
      .from('collections')
      .insert({
        tenant_id: DEFAULT_TENANT_ID,
        type,
        name,
        slug,
        is_active: true,
      })
      .select('id,name,slug,is_active')
      .single();
    if (error) throw new Error(`collections insert: ${error.message}`);
    return NextResponse.json(
      {
        id: data.id,
        name: data.name,
        slug: data.slug,
        active: data.is_active,
      },
      { status: 201 },
    );
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to create collection.');
  }
}
