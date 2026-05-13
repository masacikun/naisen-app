export const metadata = { title: '分析 | 電話履歴管理' }
import { supabaseServer } from '@/lib/supabaseServer'
import StatsClient from './StatsClient'

export const dynamic = 'force-dynamic'

type RawCall = {
  started_at:  string
  status:      string
  line_name:   string | null
  caller:      string | null
  duration_sec: number | null
  ivr_route:   string | null
}

// ─── 期間計算（JST基準） ─────────────────────────────────────────
function getPeriodRange(period: string, from?: string, to?: string) {
  // Vercel は UTC なので JST = UTC+9 で今日を求める
  const nowMs  = Date.now()
  const jstNow = new Date(nowMs + 9 * 60 * 60 * 1000)
  const y = jstNow.getUTCFullYear(), m = jstNow.getUTCMonth()

  const jstDate = (d: Date) => {
    const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000)
    return jst.toISOString().slice(0, 10)
  }

  switch (period) {
    case 'this_month': return { sinceDate: `${y}-${String(m + 1).padStart(2, '0')}-01`, untilDate: null }
    case 'last_month': return {
      sinceDate: jstDate(new Date(Date.UTC(y, m - 1, 1) - 9 * 3600000)),
      untilDate: jstDate(new Date(Date.UTC(y, m, 0, 14, 59, 59))),   // last day of prev month in JST
    }
    case '3m':  return { sinceDate: `${y}-${String(m - 1 < 0 ? m + 11 : m - 1).padStart(2,'0')}-01`, untilDate: null }
    case '6m':  return { sinceDate: jstDate(new Date(Date.UTC(y, m - 5, 1) - 9 * 3600000)), untilDate: null }
    case 'all': return { sinceDate: null, untilDate: null }
    case 'custom': return { sinceDate: from ?? null, untilDate: to ?? null }
    default:    return { sinceDate: jstDate(new Date(Date.UTC(y - 1, m, 1) - 9 * 3600000)), untilDate: null }
  }
}

// ─── 全集計（TypeScript側） ──────────────────────────────────────
function aggregateCalls(calls: RawCall[]) {
  const hourlyAgg:  Record<number, Record<string, { call_count: number; answered: number }>> = {}
  const dailyAgg:   Record<string, Record<string, { call_count: number; answered: number; no_answer: number }>> = {}
  const monthlyAgg: Record<string, Record<string, { call_count: number; answered: number; no_answer: number }>> = {}
  const durAgg:     Record<string, { total_sec: number; count: number }> = {}
  const distAgg:    Record<string, { bucket: string; sort_order: number; call_count: number }> = {}
  const ivrAgg:     Record<string, Record<string, { call_count: number; answered: number; no_answer: number }>> = {}
  const callerAgg:  Record<string, { call_count: number; answered: number; no_answer: number; last_called_at: string; line_name: string }> = {}
  const callerCount: Record<string, number> = {}

  for (const c of calls) {
    const jst    = new Date(new Date(c.started_at).getTime() + 9 * 60 * 60 * 1000)
    const hour   = jst.getUTCHours()
    const date   = jst.toISOString().slice(0, 10)
    const month  = jst.toISOString().slice(0, 7)
    const line   = c.line_name ?? ''
    const isAns  = c.status === 'ANSWERED'
    const isNA   = c.status === 'NO ANSWER'

    // hourly
    if (!hourlyAgg[hour]) hourlyAgg[hour] = {}
    if (!hourlyAgg[hour][line]) hourlyAgg[hour][line] = { call_count: 0, answered: 0 }
    hourlyAgg[hour][line].call_count++
    if (isAns) hourlyAgg[hour][line].answered++

    // daily
    if (!dailyAgg[date]) dailyAgg[date] = {}
    if (!dailyAgg[date][line]) dailyAgg[date][line] = { call_count: 0, answered: 0, no_answer: 0 }
    dailyAgg[date][line].call_count++
    if (isAns) dailyAgg[date][line].answered++
    if (isNA)  dailyAgg[date][line].no_answer++

    // monthly
    if (!monthlyAgg[month]) monthlyAgg[month] = {}
    if (!monthlyAgg[month][line]) monthlyAgg[month][line] = { call_count: 0, answered: 0, no_answer: 0 }
    monthlyAgg[month][line].call_count++
    if (isAns) monthlyAgg[month][line].answered++
    if (isNA)  monthlyAgg[month][line].no_answer++

    // avg duration
    if (isAns && c.duration_sec && c.duration_sec > 0) {
      if (!durAgg[line]) durAgg[line] = { total_sec: 0, count: 0 }
      durAgg[line].total_sec += c.duration_sec
      durAgg[line].count++

      // distribution
      const sec = c.duration_sec
      let bucket: string, sort_order: number
      if      (sec <= 30)  { bucket = '〜30秒';    sort_order = 1 }
      else if (sec <= 120) { bucket = '30秒〜2分'; sort_order = 2 }
      else if (sec <= 300) { bucket = '2分〜5分';  sort_order = 3 }
      else                  { bucket = '5分以上';   sort_order = 4 }
      if (!distAgg[bucket]) distAgg[bucket] = { bucket, sort_order, call_count: 0 }
      distAgg[bucket].call_count++
    }

    // IVR
    if (c.ivr_route) {
      if (!ivrAgg[c.ivr_route]) ivrAgg[c.ivr_route] = {}
      if (!ivrAgg[c.ivr_route][line]) ivrAgg[c.ivr_route][line] = { call_count: 0, answered: 0, no_answer: 0 }
      ivrAgg[c.ivr_route][line].call_count++
      if (isAns) ivrAgg[c.ivr_route][line].answered++
      if (isNA)  ivrAgg[c.ivr_route][line].no_answer++
    }

    // callers
    if (c.caller) {
      callerCount[c.caller] = (callerCount[c.caller] ?? 0) + 1
      if (!callerAgg[c.caller]) {
        callerAgg[c.caller] = { call_count: 0, answered: 0, no_answer: 0, last_called_at: c.started_at, line_name: line }
      }
      callerAgg[c.caller].call_count++
      if (isAns) callerAgg[c.caller].answered++
      if (isNA)  callerAgg[c.caller].no_answer++
      if (c.started_at > callerAgg[c.caller].last_called_at) callerAgg[c.caller].last_called_at = c.started_at
    }
  }

  // ── 配列変換 ──
  const hourly = Object.entries(hourlyAgg).flatMap(([h, lm]) =>
    Object.entries(lm).map(([line_name, v]) => ({ hour: parseInt(h), line_name, ...v }))
  )
  const dailyRows = Object.entries(dailyAgg).flatMap(([call_date, lm]) =>
    Object.entries(lm).map(([line_name, v]) => ({ call_date, line_name, ...v }))
  )
  const monthly = Object.entries(monthlyAgg).flatMap(([month, lm]) =>
    Object.entries(lm).map(([line_name, v]) => ({ month, line_name, ...v }))
  )
  const avgDuration = Object.entries(durAgg)
    .map(([line_name, v]) => ({ line_name, answered_count: v.count, avg_sec: Math.round(v.total_sec / v.count) }))
    .filter(r => r.line_name !== '')
    .sort((a, b) => b.avg_sec - a.avg_sec)
  const durationDist = Object.values(distAgg).sort((a, b) => a.sort_order - b.sort_order)
  const ivrRoutes = Object.entries(ivrAgg).flatMap(([ivr_route, lm]) =>
    Object.entries(lm).map(([line_name, v]) => ({
      ivr_route, line_name, ...v,
      answer_rate: v.call_count ? Math.round(v.answered / v.call_count * 100) : 0,
    }))
  ).sort((a, b) => b.call_count - a.call_count)
  const topCallers = Object.entries(callerAgg)
    .map(([caller, v]) => ({ caller, ...v }))
    .sort((a, b) => b.call_count - a.call_count)
    .slice(0, 10)

  // リピーター分析
  let firstCount = 0, firstCalls = 0, repCount = 0, repCalls = 0
  for (const cnt of Object.values(callerCount)) {
    if (cnt === 1) { firstCount++; firstCalls++ }
    else           { repCount++;   repCalls += cnt }
  }
  const repeatAnalysis = [
    { caller_type: '初回',       caller_count: firstCount, call_count: firstCalls },
    { caller_type: 'リピーター', caller_count: repCount,   call_count: repCalls   },
  ]

  return { hourly, dailyRows, monthly, topCallers, avgDuration, durationDist, repeatAnalysis, ivrRoutes }
}

// ─── Page ─────────────────────────────────────────────────────────
export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>
}) {
  const sp     = await searchParams
  const period = sp.period || '1y'
  const { sinceDate, untilDate } = getPeriodRange(period, sp.from, sp.to)

  // JST 日付 → UTC timestamp（Supabase の started_at は UTC 想定）
  const sinceUTC = sinceDate ? new Date(sinceDate + 'T00:00:00+09:00').toISOString() : null
  const untilUTC = untilDate ? new Date(untilDate + 'T23:59:59+09:00').toISOString() : null

  let query = supabaseServer
    .from('naisen_calls')
    .select('started_at,status,line_name,caller,duration_sec,ivr_route')
    .limit(200000)  // 全件取得できるよう余裕を持たせる

  if (sinceUTC) query = query.gte('started_at', sinceUTC)
  if (untilUTC) query = query.lte('started_at', untilUTC)

  const { data } = await query
  const stats = aggregateCalls((data ?? []) as RawCall[])

  return (
    <StatsClient
      period={period}
      periodFrom={sp.from}
      periodTo={sp.to}
      {...stats}
    />
  )
}
