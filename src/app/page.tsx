import { supabaseServer } from '@/lib/supabaseServer'
import DashboardClient from './DashboardClient'

export const dynamic = 'force-dynamic'

async function getData() {
  // Vercel runs UTC; compute all boundaries in JST (UTC+9)
  const JST = 9 * 60 * 60 * 1000
  const jstNow = new Date(Date.now() + JST)
  const y  = jstNow.getUTCFullYear()
  const mo = jstNow.getUTCMonth()
  const d  = jstNow.getUTCDate()

  // jstDay(y, m, d) → UTC ISO that equals JST midnight of that date
  const jstDay = (year: number, month: number, day: number, h = 0, mi = 0, s = 0) =>
    new Date(Date.UTC(year, month, day, h, mi, s) - JST).toISOString()

  const thisMonthStart = jstDay(y, mo, 1)
  const lastMonthStart = jstDay(y, mo - 1, 1)
  const lastMonthEnd   = jstDay(y, mo, 0, 23, 59, 59)   // last day of prev month JST 23:59:59
  const lyMonthStart   = jstDay(y - 1, mo, 1)
  const lyMonthEnd     = jstDay(y - 1, mo + 1, 0, 23, 59, 59)

  // This week's Monday in JST
  const dow = jstNow.getUTCDay()
  const thisMondayJST = new Date(Date.UTC(y, mo, d - (dow === 0 ? 6 : dow - 1)) - JST)
  const lastMondayJST = new Date(thisMondayJST.getTime() - 7 * 24 * 3600 * 1000)
  const thisMonday    = thisMondayJST.toISOString()
  const lastMonday    = lastMondayJST.toISOString()

  const oneYearAgoStr = jstDay(y - 1, mo, d).slice(0, 10)
  const sameDayLMStart = jstDay(y, mo - 1, d)
  const sameDayLMEnd   = jstDay(y, mo - 1, d, 23, 59, 59)

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
    { data: lyMonth },
  ] = await Promise.all([
    supabaseServer.from('naisen_calls').select('status,duration_sec,line_name,caller').gte('started_at', thisMonthStart).limit(20000),
    supabaseServer.from('naisen_calls').select('status,line_name,caller').gte('started_at', lastMonthStart).lte('started_at', lastMonthEnd).limit(20000),
    supabaseServer.from('v_naisen_monthly').select('*').gte('month', jstDay(y, mo - 11, 1)).eq('status', 'ANSWERED').order('month', { ascending: true }),
    // byLine: limit 大きめ（PostgRESTデフォルト1000だと全回線が取得できない）
    supabaseServer.from('naisen_calls').select('line_name,status,caller').gte('started_at', thisMonthStart).not('line_name', 'is', null).limit(20000),
    supabaseServer.from('naisen_calls').select('*', { count: 'exact', head: true }),
    supabaseServer.from('naisen_calls').select('status,line_name,caller').gte('started_at', thisMonday).limit(5000),
    supabaseServer.from('naisen_calls').select('status,line_name,caller').gte('started_at', lastMonday).lt('started_at', thisMonday).limit(5000),
    supabaseServer.from('v_naisen_daily').select('call_date,line_name,call_count,answered,no_answer').gte('call_date', oneYearAgoStr).order('call_date').limit(6000),
    supabaseServer.from('naisen_calls').select('status,line_name,caller').gte('started_at', sameDayLMStart).lte('started_at', sameDayLMEnd).limit(5000),
    // 前年同月
    supabaseServer.from('naisen_calls').select('status,line_name,caller').gte('started_at', lyMonthStart).lte('started_at', lyMonthEnd).limit(20000),
  ])

  return {
    thisMonth:  (thisMonth  ?? []) as { status: string; duration_sec?: number; line_name?: string; caller?: string }[],
    lastMonth:  (lastMonth  ?? []) as { status: string; line_name?: string; caller?: string }[],
    monthly:    (monthly    ?? []) as { month: string; line_name: string; call_count: number }[],
    byLine:     (byLine     ?? []) as { line_name?: string; status: string; caller?: string }[],
    totalCount: totalCount ?? 0,
    thisWeek:   (thisWeek   ?? []) as { status: string; line_name?: string; caller?: string }[],
    lastWeek:   (lastWeek   ?? []) as { status: string; line_name?: string; caller?: string }[],
    dailyRows:  (dailyRows  ?? []) as { call_date: string; line_name: string; call_count: number; answered: number; no_answer: number }[],
    sameDayLM:  (sameDayLM  ?? []) as { status: string; line_name?: string; caller?: string }[],
    lyMonth:    (lyMonth    ?? []) as { status: string; line_name?: string; caller?: string }[],
  }
}

export default async function DashboardPage() {
  const data = await getData()
  return <DashboardClient {...data} />
}
