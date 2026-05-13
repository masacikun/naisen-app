export const metadata = { title: '不在着信 | 電話履歴管理' }
import { supabaseServer } from '@/lib/supabaseServer'
import MissedClient from './MissedClient'

export const dynamic = 'force-dynamic'

export default async function MissedPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string; line?: string }>
}) {
  const sp   = await searchParams
  const days = Math.min(parseInt(sp.days || '7'), 90)

  const since = new Date()
  since.setDate(since.getDate() - days)
  const sinceStr = since.toISOString()

  // 不在着信を取得
  const { data: missedData } = await supabaseServer
    .from('naisen_calls')
    .select('id,started_at,caller,caller_name,line_name,duration_sec')
    .eq('status', 'NO ANSWER')
    .gte('started_at', sinceStr)
    .not('caller', 'is', null)
    .order('started_at', { ascending: false })
    .limit(1000)

  const missed = missedData ?? []

  // 同じ発信元の応答済み通話を取得（コールバック検出用）
  const callers = Array.from(new Set(missed.map(m => m.caller).filter(Boolean))) as string[]
  let callbackSet = new Set<string>() // "callerId|missedTime" のセット
  if (callers.length > 0) {
    const { data: cbData } = await supabaseServer
      .from('naisen_calls')
      .select('caller,started_at')
      .eq('status', 'ANSWERED')
      .gte('started_at', sinceStr)
      .in('caller', callers.slice(0, 200))

    for (const missed_row of missed) {
      const missedTime = new Date(missed_row.started_at).getTime()
      const found = (cbData ?? []).some(cb => {
        if (cb.caller !== missed_row.caller) return false
        const cbTime = new Date(cb.started_at).getTime()
        return cbTime > missedTime && cbTime - missedTime <= 24 * 60 * 60 * 1000
      })
      if (found) callbackSet.add(String(missed_row.id))
    }
  }

  // 回線一覧
  const lines = Array.from(new Set(missed.map(m => m.line_name).filter(Boolean))).sort() as string[]

  const rows = missed.map(m => ({
    id:           m.id,
    started_at:   m.started_at,
    caller:       m.caller ?? '',
    caller_name:  m.caller_name ?? '',
    line_name:    m.line_name ?? '',
    has_callback: callbackSet.has(String(m.id)),
  }))

  return <MissedClient rows={rows} lines={lines} days={days} lineFilter={sp.line ?? ''} />
}
