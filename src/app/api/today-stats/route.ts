import { supabaseServer } from '@/lib/supabaseServer'
import { NextResponse } from 'next/server'

export async function GET() {
  // JST 今日の範囲
  const now = new Date()
  const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  const todayJST = jstNow.toISOString().slice(0, 10)
  const todayStart = new Date(todayJST + 'T00:00:00+09:00').toISOString()
  const todayEnd   = new Date(todayJST + 'T23:59:59+09:00').toISOString()

  const { data, error } = await supabaseServer
    .from('naisen_calls')
    .select('status')
    .gte('started_at', todayStart)
    .lte('started_at', todayEnd)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = data ?? []
  const total    = rows.length
  const answered = rows.filter(r => r.status === 'ANSWERED').length
  const rate     = total ? Math.round(answered / total * 100) : 0

  const jstTime = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(now)

  return NextResponse.json({ total, answered, missed: total - answered, rate, updatedAt: jstTime })
}
