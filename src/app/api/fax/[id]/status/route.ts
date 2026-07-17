import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { canEditFax, isFaxStatus } from '@/lib/fax'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ステータス更新（untriaged / open / done / dm・2026-07-18）。編集は admin / shain のみ
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!canEditFax(req.headers.get('x-auth-role'))) {
    return NextResponse.json({ error: 'edit role required' }, { status: 403 })
  }
  const { id } = await ctx.params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'bad id' }, { status: 400 })
  const body = await req.json().catch(() => null)
  if (!body || !isFaxStatus(body.status)) {
    return NextResponse.json({ error: 'invalid status' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('naisen_fax_messages')
    .update({ status: body.status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, status, updated_at')
    .single()
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'not found' }, { status: error ? 500 : 404 })
  }
  return NextResponse.json(data)
}
