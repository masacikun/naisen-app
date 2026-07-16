import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { isAdminHeaders } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// DELETE: 区分の削除（admin のみ）。所属連絡先は FK on delete set default で「未分類」へ。
// is_system=true（未分類）は削除不可。
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  if (!isAdminHeaders(req.headers)) {
    return NextResponse.json({ error: 'admin required' }, { status: 403 })
  }
  const { key } = await ctx.params

  const { data: cat } = await supabaseAdmin
    .from('phonebook_categories')
    .select('key,is_system')
    .eq('key', key)
    .maybeSingle()
  if (!cat) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (cat.is_system) {
    return NextResponse.json({ error: 'システム区分（未分類）は削除できません' }, { status: 400 })
  }

  const { error } = await supabaseAdmin.from('phonebook_categories').delete().eq('key', key)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
