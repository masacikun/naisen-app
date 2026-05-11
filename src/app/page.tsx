import { supabaseServer } from '@/lib/supabaseServer'
import DashboardClient from './DashboardClient'

export const dynamic = 'force-dynamic'

async function getData() {
  const now = new Date()
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()
  const lastMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString()
  const dow            = now.getDay()
  const thisMonday     = new Date(now); thisMonday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1)); thisMonday.setHours(0,0,0,0)
  const lastMonday     = new Date(thisMonday); lastMonday.setDate(thisMonday.getDate() - 7)
  const oneYearAgo     = new Date(now); oneYearAgo.setFullYear(now.getFullYear() - 1)
  const oneYearAgoStr  = oneYearAgo.toISOString().slice(0, 10)
  const sameDayLMStart = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()).toISOString()
  const sameDayLMEnd   = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate(), 23, 59, 59).toISOString()

  const [
    { data: thisMonth },
    { data: lastMonth },
    { data: monthly },
    { data: byLine },
    { count: totalCount },
    { data: thisWeek },
    { data: lastWeek },
    { data: dailyRows },
    { data: sameDayLM },
  ] = await Promise.all([
    supabaseServer.from('naisen_calls').select('status,duration_sec,line_name').gte('started_at', thisMonthStart),
    supabaseServer.from('naisen_calls').select('status,line_name').gte('started_at', lastMonthStart).lte('started_at', lastMonthEnd),
    supabaseServer.from('v_naisen_monthly').select('*').gte('month', new Date(now.getFullYear(), now.getMonth() - 11, 1).toISOString()).eq('status', 'ANSWERED').order('month', { ascending: true }),
    supabaseServer.from('naisen_calls').select('line_name,status').gte('started_at', thisMonthStart).not('line_name', 'is', null),
    supabaseServer.from('naisen_calls').select('*', { count: 'exact', head: true }),
    supabaseServer.from('naisen_calls').select('status,line_name').gte('started_at', thisMonday.toISOString()),
    supabaseServer.from('naisen_calls').select('status,line_name').gte('started_at', lastMonday.toISOString()).lt('started_at', thisMonday.toISOString()),
    // line_name を含む生の日次データを渡す（クライアントでブランド別フィルタリング）
    supabaseServer.from('v_naisen_daily').select('call_date,line_name,call_count,answered,no_answer').gte('call_date', oneYearAgoStr).order('call_date').limit(6000),
    // 先月同日比較
    supabaseServer.from('naisen_calls').select('status,line_name').gte('started_at', sameDayLMStart).lte('started_at', sameDayLMEnd),
  ])

  return {
    thisMonth:  (thisMonth  ?? []) as { status: string; duration_sec?: number; line_name?: string }[],
    lastMonth:  (lastMonth  ?? []) as { status: string; line_name?: string }[],
    monthly:    (monthly    ?? []) as { month: string; line_name: string; call_count: number }[],
    byLine:     (byLine     ?? []) as { line_name?: string; status: string }[],
    totalCount: totalCount ?? 0,
    thisWeek:   (thisWeek   ?? []) as { status: string; line_name?: string }[],
    lastWeek:   (lastWeek   ?? []) as { status: string; line_name?: string }[],
    dailyRows:  (dailyRows  ?? []) as { call_date: string; line_name: string; call_count: number; answered: number; no_answer: number }[],
    sameDayLM:  (sameDayLM  ?? []) as { status: string; line_name?: string }[],
  }
}

export default async function DashboardPage() {
  const data = await getData()
  return <DashboardClient {...data} />
}
