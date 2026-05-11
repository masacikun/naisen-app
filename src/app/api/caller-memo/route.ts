import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET() {
  const { data, error } = await db().from('caller_memo').select('*').order('updated_at', { ascending: false })
  if (error) return NextResponse.json([], { status: 200 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const { caller, name, note } = await req.json()
  if (!caller || !name?.trim()) {
    return NextResponse.json({ error: 'caller and name required' }, { status: 400 })
  }
  const { data, error } = await db()
    .from('caller_memo')
    .upsert({ caller, name: name.trim(), note: note?.trim() || null, updated_at: new Date().toISOString() }, { onConflict: 'caller' })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const { caller } = await req.json()
  if (!caller) return NextResponse.json({ error: 'caller required' }, { status: 400 })
  const { error } = await db().from('caller_memo').delete().eq('caller', caller)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
