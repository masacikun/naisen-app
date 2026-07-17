import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { canEditFax, isFaxCategory, isFaxStatus } from '@/lib/fax'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// 仕分け（category 更新・2026-07-18）。編集は admin / shain のみ
// パターンB: 区分のみで受ける（請求書/支払明細の既存実体が無いため linked_* は未使用）
// status 未指定で現状 untriaged の場合は open（未対応）へ進める
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!canEditFax(req.headers.get('x-auth-role'))) {
    return NextResponse.json({ error: 'edit role required' }, { status: 403 })
  }
  const { id } = await ctx.params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'bad id' }, { status: 400 })
  const body = await req.json().catch(() => null)
  if (!body || (body.category !== null && !isFaxCategory(body.category))) {
    return NextResponse.json({ error: 'invalid category' }, { status: 400 })
  }
  if (body.status !== undefined && !isFaxStatus(body.status)) {
    return NextResponse.json({ error: 'invalid status' }, { status: 400 })
  }

  const { data: current } = await supabaseAdmin
    .from('naisen_fax_messages')
    .select('id, status')
    .eq('id', id)
    .maybeSingle()
  if (!current) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const patch: Record<string, unknown> = {
    category: body.category,
    updated_at: new Date().toISOString(),
  }
  if (body.status !== undefined) patch.status = body.status
  else if (current.status === 'untriaged' && body.category !== null) patch.status = 'open'

  const { data, error } = await supabaseAdmin
    .from('naisen_fax_messages')
    .update(patch)
    .eq('id', id)
    .select('id, category, status, updated_at')
    .single()
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'update failed' }, { status: 500 })
  }
  return NextResponse.json(data)
}
