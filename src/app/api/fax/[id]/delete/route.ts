import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { canEditFax } from '@/lib/fax'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// 削除＝ゴミ箱へ（2026-07-18）。削除日から30日後に scripts/purge-fax.mjs が完全削除。
// 編集は admin / shain のみ。既に削除済みの場合は削除日を上書きせずそのまま返す（冪等・30日時計を守る）
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!canEditFax(req.headers.get('x-auth-role'))) {
    return NextResponse.json({ error: 'edit role required' }, { status: 403 })
  }
  const { id } = await ctx.params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'bad id' }, { status: 400 })

  const now = new Date().toISOString()
  const { data, error } = await supabaseAdmin
    .from('naisen_fax_messages')
    .update({ deleted_at: now, updated_at: now })
    .eq('id', id)
    .is('deleted_at', null)
    .select('id, deleted_at')
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (data) return NextResponse.json(data)

  const { data: cur } = await supabaseAdmin
    .from('naisen_fax_messages')
    .select('id, deleted_at')
    .eq('id', id)
    .maybeSingle()
  if (!cur) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(cur)
}
