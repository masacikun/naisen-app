import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { isValidSyncToken } from '@/lib/sync-auth'
import { buildBlacklistItems, type FeedEntry } from '@/lib/sync-feed'

export const dynamic = 'force-dynamic'

// FreePBX 同期フィード: 着信拒否（blocked=true・番号単位に展開）。契約は docs/freepbx-sync.md v1。
export async function GET(req: NextRequest) {
  if (!isValidSyncToken(req.headers.get('authorization'))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const { data, error } = await supabaseAdmin
    .from('phonebook_entries')
    .select('id,name,name_kana,group_name,memo,blocked,phonebook_numbers(phone_raw,phone_normalized,label)')
    .eq('blocked', true)
    .order('id')
    .limit(5000)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const items = buildBlacklistItems((data ?? []) as FeedEntry[])
  return NextResponse.json(
    { version: 1, generated_at: new Date().toISOString(), count: items.length, items },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
