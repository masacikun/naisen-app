import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { isAdminHeaders } from '@/lib/auth'
import { parseBookKeys } from '@/lib/phonebook-match'

export const dynamic = 'force-dynamic'

// 内線（SIPユーザー名）→購読電話帳。閲覧は全認証ユーザー・変更は admin のみ。
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('phonebook_identity_books')
    .select('identity,book_key')
    .order('identity')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// PUT: { identity, book_keys } で当該内線の購読を全置換（admin のみ）。
// 空にはできない（最後の1件削除は既定 all へ戻す＝配信フォールバックと一致させる）。
export async function PUT(req: NextRequest) {
  if (!isAdminHeaders(req.headers)) {
    return NextResponse.json({ error: 'admin required' }, { status: 403 })
  }
  const body = await req.json().catch(() => null)
  const identity = body?.identity?.trim()
  if (!identity || !/^[0-9A-Za-z_-]{1,32}$/.test(identity)) {
    return NextResponse.json({ error: 'identity（内線番号）が不正です' }, { status: 400 })
  }
  const bookKeys = parseBookKeys(body?.book_keys) ?? []
  const keys = bookKeys.length > 0 ? bookKeys : ['all'] // 必ず1つ（既定 all）

  const { error: delErr } = await supabaseAdmin
    .from('phonebook_identity_books')
    .delete()
    .eq('identity', identity)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  const { error: insErr } = await supabaseAdmin
    .from('phonebook_identity_books')
    .insert(keys.map(k => ({ identity, book_key: k })))
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
  return NextResponse.json({ identity, book_keys: keys })
}

// DELETE: ?identity= の行を全削除（＝購読未設定へ戻す。配信は all フォールバック）
export async function DELETE(req: NextRequest) {
  if (!isAdminHeaders(req.headers)) {
    return NextResponse.json({ error: 'admin required' }, { status: 403 })
  }
  const identity = req.nextUrl.searchParams.get('identity')?.trim()
  if (!identity) return NextResponse.json({ error: 'identity required' }, { status: 400 })
  const { error } = await supabaseAdmin
    .from('phonebook_identity_books')
    .delete()
    .eq('identity', identity)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
