import { supabaseServer } from '@/lib/supabaseServer'
import StatsClient from './StatsClient'

export const dynamic = 'force-dynamic'

type DailyRow = { call_date: string; call_count: number; answered: number; no_answer: number }

async function getData() {
  const now = new Date()
  const oneYearAgo = new Date(now); oneYearAgo.setFullYear(now.getFullYear() - 1)

  const [
    { data: hourly },
    { data: monthly },
    { data: dailyRows },
  ] = await Promise.all([
    supabaseServer.from('v_naisen_hourly').select('*').order('hour'),
    supabaseServer.from('v_naisen_monthly').select('*').order('month', { ascending: false }).limit(200),
    supabaseServer.from('v_naisen_daily').select('call_date,call_count,answered,no_answer')
      .gte('call_date', oneYearAgo.toISOString().slice(0, 10)).order('call_date'),
  ])

  // 曜日別集計（v_naisen_daily から JS で計算）
  const DOW_LABELS = ['日', '月', '火', '水', '木', '金', '土']
  const dowMap = Array.from({ length: 7 }, (_, i) => ({ dow: i, label: DOW_LABELS[i], total: 0, answered: 0, no_answer: 0 }))
  for (const row of (dailyRows ?? []) as DailyRow[]) {
    const dow = new Date(String(row.call_date).slice(0, 10) + 'T12:00:00Z').getDay()
    dowMap[dow].total     += row.call_count ?? 0
    dowMap[dow].answered  += row.answered   ?? 0
    dowMap[dow].no_answer += row.no_answer  ?? 0
  }
  // 月→日 の順に並べ替え
  const dowData = [1, 2, 3, 4, 5, 6, 0].map(i => dowMap[i])

  // オプション: v_top_callers / v_avg_duration（テーブル未作成なら空）
  const { data: topCallersData, error: tcErr } = await supabaseServer.from('v_top_callers').select('*').limit(10)
  const { data: avgDurationData, error: adErr } = await supabaseServer.from('v_avg_duration').select('*')

  return {
    hourly:      (hourly      ?? []) as { hour: number; line_name: string; call_count: number; answered: number }[],
    monthly:     (monthly     ?? []) as { month: string; line_name: string; call_count: number; total_sec: number; status: string }[],
    dowData,
    topCallers:  tcErr ? [] : (topCallersData ?? []) as { caller: string; call_count: number; answered: number; no_answer: number; last_called_at: string }[],
    avgDuration: adErr ? [] : (avgDurationData ?? []) as { line_name: string; answered_count: number; avg_sec: number; max_sec: number }[],
  }
}

export default async function StatsPage() {
  const data = await getData()
  return <StatsClient {...data} />
}
