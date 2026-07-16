import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { isAdminHeaders } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// DELETE: 電話帳の削除（admin のみ）。掲載(entry_books)・割り当て(identity_books)は
// FK on delete cascade で自動除去（＝掲載から自動で外れる）。
// 'all' は購読0件時のフォールバック先のため削除不可。
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  if (!isAdminHeaders(req.headers)) {
    return NextResponse.json({ error: 'admin required' }, { status: 403 })
  }
  const { key } = await ctx.params
  if (key === 'all') {
    return NextResponse.json({ error: '「共通(all)」は配信のフォールバック先のため削除できません' }, { status: 400 })
  }

  const { data: book } = await supabaseAdmin
    .from('phonebook_books')
    .select('key')
    .eq('key', key)
    .maybeSingle()
  if (!book) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const { error } = await supabaseAdmin.from('phonebook_books').delete().eq('key', key)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
