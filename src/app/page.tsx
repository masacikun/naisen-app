import { supabaseServer } from '@/lib/supabaseServer'
import DashboardClient from './DashboardClient'

export const dynamic = 'force-dynamic'

type DailyRow = { call_date: string; call_count: number; answered: number; no_answer: number }

function getMondayOf(d: Date): Date {
  const r = new Date(d)
  const dow = r.getDay()
  r.setDate(r.getDate() - (dow === 0 ? 6 : dow - 1))
  r.setHours(0, 0, 0, 0)
  return r
}

async function getData() {
  const now = new Date()
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()
  const lastMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString()
  const thisMonday     = getMondayOf(now)
  const lastMonday     = new Date(thisMonday); lastMonday.setDate(thisMonday.getDate() - 7)
  const oneYearAgo     = new Date(now); oneYearAgo.setFullYear(now.getFullYear() - 1)
  const oneYearAgoStr  = oneYearAgo.toISOString().slice(0, 10)

  const [
    { data: thisMonth },
    { data: lastMonth },
    { data: monthly },
    { data: byLine },
    { count: totalCount },
    { data: thisWeek },
    { data: lastWeek },
    { data: dailyRows },
  ] = await Promise.all([
    supabaseServer.from('naisen_calls').select('status,duration_sec,line_name').gte('started_at', thisMonthStart),
    supabaseServer.from('naisen_calls').select('status,duration_sec').gte('started_at', lastMonthStart).lte('started_at', lastMonthEnd),
    supabaseServer.from('v_naisen_monthly').select('*').gte('month', new Date(now.getFullYear(), now.getMonth() - 11, 1).toISOString()).eq('status', 'ANSWERED').order('month', { ascending: true }),
    supabaseServer.from('naisen_calls').select('line_name,status').gte('started_at', thisMonthStart).not('line_name', 'is', null),
    supabaseServer.from('naisen_calls').select('*', { count: 'exact', head: true }),
    supabaseServer.from('naisen_calls').select('status').gte('started_at', thisMonday.toISOString()),
    supabaseServer.from('naisen_calls').select('status').gte('started_at', lastMonday.toISOString()).lt('started_at', thisMonday.toISOString()),
    supabaseServer.from('v_naisen_daily').select('call_date,call_count,answered,no_answer').gte('call_date', oneYearAgoStr).order('call_date'),
  ])

  // 日付ごとに集計（v_naisen_daily は回線×日付の行）
  const heatmapMap = new Map<string, { call_count: number; answered: number; no_answer: number }>()
  for (const row of (dailyRows ?? []) as DailyRow[]) {
    const key = String(row.call_date).slice(0, 10)
    const ex  = heatmapMap.get(key) ?? { call_count: 0, answered: 0, no_answer: 0 }
    heatmapMap.set(key, {
      call_count: ex.call_count + (row.call_count ?? 0),
      answered:   ex.answered   + (row.answered   ?? 0),
      no_answer:  ex.no_answer  + (row.no_answer  ?? 0),
    })
  }
  const heatmap = Array.from(heatmapMap, ([call_date, v]) => ({ call_date, ...v }))
    .sort((a, b) => a.call_date.localeCompare(b.call_date))

  // 週次サマリー（直近8週）
  const weekMap = new Map<string, { total: number; answered: number; no_answer: number }>()
  for (const [dateStr, v] of heatmapMap) {
    const mon = getMondayOf(new Date(dateStr + 'T12:00:00Z'))
    const key = mon.toISOString().slice(0, 10)
    const ex  = weekMap.get(key) ?? { total: 0, answered: 0, no_answer: 0 }
    weekMap.set(key, { total: ex.total + v.call_count, answered: ex.answered + v.answered, no_answer: ex.no_answer + v.no_answer })
  }
  const weeklySummary = Array.from(weekMap, ([week, v]) => ({
    week, ...v, rate: v.total ? Math.round(v.answered / v.total * 100) : 0,
  })).sort((a, b) => b.week.localeCompare(a.week)).slice(0, 8).reverse()

  return {
    thisMonth:     (thisMonth  ?? []) as { status: string; duration_sec?: number; line_name?: string }[],
    lastMonth:     (lastMonth  ?? []) as { status: string; duration_sec?: number }[],
    monthly:       (monthly    ?? []) as { month: string; line_name: string; call_count: number }[],
    byLine:        (byLine     ?? []) as { line_name?: string; status: string }[],
    totalCount:    totalCount ?? 0,
    thisWeek:      (thisWeek   ?? []) as { status: string }[],
    lastWeek:      (lastWeek   ?? []) as { status: string }[],
    heatmap,
    weeklySummary,
  }
}

export default async function DashboardPage() {
  const data = await getData()
  return <DashboardClient {...data} />
}
