import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50

// 電話帳エントリの着信履歴オンデマンド取得（閲覧は全認証ユーザー・read-only）。
// caller とエントリの正規化番号の完全一致 = 着信のみ（発信は対象外・Slice 3 既決）
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await ctx.params
  const id = parseInt(idStr, 10)
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  }
  const page = Math.max(1, parseInt(req.nextUrl.searchParams.get('page') ?? '1', 10) || 1)

  const { data: numbers, error: numErr } = await supabaseAdmin
    .from('phonebook_numbers')
    .select('phone_normalized')
    .eq('entry_id', id)
    .not('phone_normalized', 'is', null)
  if (numErr) return NextResponse.json({ error: numErr.message }, { status: 500 })

  const norms = [...new Set((numbers ?? []).map(n => n.phone_normalized as string))]
  if (norms.length === 0) {
    return NextResponse.json({ total: 0, page, pageSize: PAGE_SIZE, rows: [] })
  }

  const from = (page - 1) * PAGE_SIZE
  const { data, count, error } = await supabaseAdmin
    .from('naisen_calls')
    .select('started_at,caller,line_name,status,duration_sec,recording_file', { count: 'exact' })
    .in('caller', norms)
    .order('started_at', { ascending: false })
    .range(from, from + PAGE_SIZE - 1)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ total: count ?? 0, page, pageSize: PAGE_SIZE, rows: data ?? [] })
}
