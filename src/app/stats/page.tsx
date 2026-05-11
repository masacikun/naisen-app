import { supabaseServer } from '@/lib/supabaseServer'
import StatsClient from './StatsClient'

export const dynamic = 'force-dynamic'

function getPeriodRange(period: string, from?: string, to?: string) {
  const now = new Date()
  switch (period) {
    case 'this_month': return { since: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10), until: null }
    case 'last_month': return {
      since: new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10),
      until: new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10),
    }
    case '3m': return { since: new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString().slice(0, 10), until: null }
    case '6m': return { since: new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString().slice(0, 10), until: null }
    case 'all': return { since: null, until: null }
    case 'custom': return { since: from ?? null, until: to ?? null }
    default: return { since: new Date(now.getFullYear() - 1, now.getMonth(), 1).toISOString().slice(0, 10), until: null }
  }
}

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>
}) {
  const sp = await searchParams
  const period = sp.period || '1y'
  const { since, until } = getPeriodRange(period, sp.from, sp.to)

  // 日次データ (DOW・期間トレンド用) – period-filtered
  let dailyQ = supabaseServer.from('v_naisen_daily')
    .select('call_date,line_name,call_count,answered,no_answer').order('call_date').limit(10000)
  if (since) dailyQ = dailyQ.gte('call_date', since)
  if (until) dailyQ = dailyQ.lte('call_date', until)

  // 月別 – period-filtered
  let monthlyQ = supabaseServer.from('v_naisen_monthly')
    .select('*').order('month', { ascending: false }).limit(300)
  if (since) monthlyQ = monthlyQ.gte('month', since)
  if (until) monthlyQ = monthlyQ.lte('month', until)

  const [
    { data: hourly },
    { data: dailyRows },
    { data: monthly },
    { data: topCallersData, error: tcErr },
    { data: avgDurationData, error: adErr },
    { data: durationDistData, error: ddErr },
    { data: repeatData, error: rpErr },
    { data: ivrData, error: ivrErr },
  ] = await Promise.all([
    supabaseServer.from('v_naisen_hourly').select('*').order('hour').limit(5000),
    dailyQ,
    monthlyQ,
    supabaseServer.from('v_top_callers').select('*').limit(10),
    supabaseServer.from('v_avg_duration').select('*'),
    supabaseServer.from('v_duration_dist').select('*'),
    supabaseServer.from('v_repeat_analysis').select('*'),
    supabaseServer.from('v_naisen_ivr').select('*').limit(200),
  ])

  return (
    <StatsClient
      period={period}
      periodFrom={sp.from}
      periodTo={sp.to}
      hourly={(hourly ?? []) as { hour: number; line_name: string; call_count: number; answered: number }[]}
      dailyRows={(dailyRows ?? []) as { call_date: string; line_name: string; call_count: number; answered: number; no_answer: number }[]}
      monthly={(monthly ?? []) as { month: string; line_name: string; call_count: number; total_sec: number; status: string }[]}
      topCallers={tcErr ? [] : (topCallersData ?? []) as { caller: string; call_count: number; answered: number; no_answer: number; last_called_at: string }[]}
      avgDuration={adErr ? [] : (avgDurationData ?? []) as { line_name: string; answered_count: number; avg_sec: number; max_sec: number }[]}
      durationDist={ddErr ? [] : (durationDistData ?? []) as { bucket: string; sort_order: number; call_count: number }[]}
      repeatAnalysis={rpErr ? [] : (repeatData ?? []) as { caller_type: string; caller_count: number; call_count: number }[]}
      ivrRoutes={ivrErr ? [] : (ivrData ?? []) as { ivr_route: string; line_name: string; call_count: number; answered: number; no_answer: number; answer_rate: number }[]}
    />
  )
}
