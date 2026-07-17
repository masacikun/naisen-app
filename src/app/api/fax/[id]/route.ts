import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { canEditFax } from '@/lib/fax'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// FAX の軽微更新（memo 等・2026-07-18）。編集は admin / shain のみ（多重防御で再チェック）
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!canEditFax(req.headers.get('x-auth-role'))) {
    return NextResponse.json({ error: 'edit role required' }, { status: 403 })
  }
  const { id } = await ctx.params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'bad id' }, { status: 400 })
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'invalid body' }, { status: 400 })

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.memo !== undefined) patch.memo = String(body.memo).trim() || null
  if (Object.keys(patch).length === 1) {
    return NextResponse.json({ error: 'no updatable fields' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('naisen_fax_messages')
    .update(patch)
    .eq('id', id)
    .select('id, memo, updated_at')
    .single()
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'not found' }, { status: error ? 500 : 404 })
  }
  return NextResponse.json(data)
}
