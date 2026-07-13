import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { isAdminHeaders } from '@/lib/auth'
import { buildNumberRows } from '@/lib/phonebook-match'

export const dynamic = 'force-dynamic'

const ENTRY_SELECT =
  'id,name,name_kana,group_name,memo,partner_id,updated_at,phonebook_numbers(id,phone_raw,phone_normalized,label)'

async function parseId(ctx: { params: Promise<{ id: string }> }): Promise<number | null> {
  const { id } = await ctx.params
  const n = parseInt(id, 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

// PUT: 連絡先の更新（admin のみ）。body.numbers を渡した場合のみ番号を全置換
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isAdminHeaders(req.headers)) {
    return NextResponse.json({ error: 'admin required' }, { status: 403 })
  }
  const id = await parseId(ctx)
  if (!id) return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  if (body.name !== undefined && !String(body.name).trim()) {
    return NextResponse.json({ error: 'name required' }, { status: 400 })
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.name !== undefined) patch.name = String(body.name).trim()
  if (body.name_kana !== undefined) patch.name_kana = body.name_kana?.trim() || null
  if (body.group_name !== undefined) patch.group_name = body.group_name?.trim() || null
  if (body.memo !== undefined) patch.memo = body.memo?.trim() || null
  if (body.partner_id !== undefined) patch.partner_id = body.partner_id ?? null

  const { data: entry, error } = await supabaseAdmin
    .from('phonebook_entries')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error || !entry) {
    return NextResponse.json({ error: error?.message ?? 'not found' }, { status: error ? 500 : 404 })
  }

  if (body.numbers !== undefined) {
    const { error: delErr } = await supabaseAdmin.from('phonebook_numbers').delete().eq('entry_id', id)
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })
    const numberRows = buildNumberRows(body.numbers, id)
    if (numberRows.length > 0) {
      const { error: numErr } = await supabaseAdmin.from('phonebook_numbers').insert(numberRows)
      if (numErr) return NextResponse.json({ error: numErr.message }, { status: 500 })
    }
  }

  const { data: full } = await supabaseAdmin
    .from('phonebook_entries')
    .select(ENTRY_SELECT)
    .eq('id', id)
    .single()
  return NextResponse.json(full ?? entry)
}

// DELETE: 連絡先の削除（admin のみ・番号は ON DELETE CASCADE）
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isAdminHeaders(req.headers)) {
    return NextResponse.json({ error: 'admin required' }, { status: 403 })
  }
  const id = await parseId(ctx)
  if (!id) return NextResponse.json({ error: 'invalid id' }, { status: 400 })

  const { error } = await supabaseAdmin.from('phonebook_entries').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
