import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { isAdminHeaders } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// 区分マスタ（可変・UIのチップで追加削除）。閲覧は全認証ユーザー・変更は admin のみ。
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('phonebook_categories')
    .select('key,name,sort,is_system')
    .order('sort')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST: 区分の追加（admin のみ）。key は name から生成しない＝時刻ベースで一意
export async function POST(req: NextRequest) {
  if (!isAdminHeaders(req.headers)) {
    return NextResponse.json({ error: 'admin required' }, { status: 403 })
  }
  const body = await req.json().catch(() => null)
  const name = body?.name?.trim()
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const key = `cat_${Date.now().toString(36)}`
  const { data: maxRow } = await supabaseAdmin
    .from('phonebook_categories')
    .select('sort')
    .eq('is_system', false)
    .order('sort', { ascending: false })
    .limit(1)
    .maybeSingle()
  const { data, error } = await supabaseAdmin
    .from('phonebook_categories')
    .insert({ key, name, sort: (maxRow?.sort ?? 0) + 10, is_system: false })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
