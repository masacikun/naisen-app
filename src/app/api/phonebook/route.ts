import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { isAdminHeaders } from '@/lib/auth'
import { buildNumberRows } from '@/lib/phonebook-match'

export const dynamic = 'force-dynamic'

const ENTRY_SELECT =
  'id,name,name_kana,group_name,memo,partner_id,blocked,updated_at,phonebook_numbers(id,phone_raw,phone_normalized,label)'

// GET: 一覧・検索（閲覧は全認証ユーザー）。?q= で名前/ヨミ/グループ/番号を絞り込み
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  const { data, error } = await supabaseAdmin
    .from('phonebook_entries')
    .select(ENTRY_SELECT)
    .order('updated_at', { ascending: false })
    .limit(2000)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let entries = data ?? []
  if (q) {
    const qNorm = q.replace(/[^0-9]/g, '')
    entries = entries.filter((e: { name: string | null; name_kana: string | null; group_name: string | null; phonebook_numbers: { phone_normalized: string | null; phone_raw: string }[] }) =>
      [e.name, e.name_kana, e.group_name].some(v => v?.includes(q)) ||
      (qNorm.length > 0 && e.phonebook_numbers.some(n => n.phone_normalized?.includes(qNorm))))
  }
  return NextResponse.json(entries)
}

// POST: 連絡先の新規作成（admin のみ・fail-closed）
export async function POST(req: NextRequest) {
  if (!isAdminHeaders(req.headers)) {
    return NextResponse.json({ error: 'admin required' }, { status: 403 })
  }
  const body = await req.json().catch(() => null)
  if (!body || !body.name?.trim()) {
    return NextResponse.json({ error: 'name required' }, { status: 400 })
  }

  const { data: entry, error } = await supabaseAdmin
    .from('phonebook_entries')
    .insert({
      name: String(body.name).trim(),
      name_kana: body.name_kana?.trim() || null,
      group_name: body.group_name?.trim() || null,
      memo: body.memo?.trim() || null,
      partner_id: body.partner_id ?? null,
      blocked: body.blocked === true,
    })
    .select()
    .single()
  if (error || !entry) {
    return NextResponse.json({ error: error?.message ?? 'insert failed' }, { status: 500 })
  }

  const numberRows = buildNumberRows(body.numbers, entry.id)
  if (numberRows.length > 0) {
    const { error: numErr } = await supabaseAdmin.from('phonebook_numbers').insert(numberRows)
    if (numErr) return NextResponse.json({ error: numErr.message }, { status: 500 })
  }

  const { data: full } = await supabaseAdmin
    .from('phonebook_entries')
    .select(ENTRY_SELECT)
    .eq('id', entry.id)
    .single()
  return NextResponse.json(full ?? entry)
}
