import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { canEditFax } from '@/lib/fax'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ゴミ箱から復元（2026-07-18）。編集は admin / shain のみ。未削除への実行も成功として返す（冪等）
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!canEditFax(req.headers.get('x-auth-role'))) {
    return NextResponse.json({ error: 'edit role required' }, { status: 403 })
  }
  const { id } = await ctx.params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'bad id' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('naisen_fax_messages')
    .update({ deleted_at: null, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, deleted_at')
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(data)
}
