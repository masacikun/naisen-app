import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { isAdminHeaders } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// 電話帳マスタ（＝配信の束・可変）。閲覧は全認証ユーザー・変更は admin のみ。
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('phonebook_books')
    .select('key,name,sort')
    .order('sort')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST: 電話帳の追加（admin のみ）
export async function POST(req: NextRequest) {
  if (!isAdminHeaders(req.headers)) {
    return NextResponse.json({ error: 'admin required' }, { status: 403 })
  }
  const body = await req.json().catch(() => null)
  const name = body?.name?.trim()
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const key = `book_${Date.now().toString(36)}`
  const { data: maxRow } = await supabaseAdmin
    .from('phonebook_books')
    .select('sort')
    .order('sort', { ascending: false })
    .limit(1)
    .maybeSingle()
  const { data, error } = await supabaseAdmin
    .from('phonebook_books')
    .insert({ key, name, sort: (maxRow?.sort ?? 0) + 10 })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
