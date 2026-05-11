import { supabaseServer } from '@/lib/supabaseServer'
import DashboardClient from './DashboardClient'

export const dynamic = 'force-dynamic'

async function getData() {
  const now = new Date()
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()
  const lastMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString()

  const [
    { data: thisMonth },
    { data: lastMonth },
    { data: monthly },
    { data: byLine },
    { count: totalCount },
  ] = await Promise.all([
    supabaseServer.from('naisen_calls').select('status,duration_sec,line_name').gte('started_at', thisMonthStart),
    supabaseServer.from('naisen_calls').select('status,duration_sec').gte('started_at', lastMonthStart).lte('started_at', lastMonthEnd),
    supabaseServer.from('v_naisen_monthly').select('*').gte('month', new Date(now.getFullYear(), now.getMonth() - 11, 1).toISOString()).eq('status', 'ANSWERED').order('month', { ascending: true }),
    supabaseServer.from('naisen_calls').select('line_name,status').gte('started_at', thisMonthStart).not('line_name', 'is', null),
    supabaseServer.from('naisen_calls').select('*', { count: 'exact', head: true }),
  ])

  return {
    thisMonth: thisMonth ?? [],
    lastMonth: lastMonth ?? [],
    monthly: monthly ?? [],
    byLine: byLine ?? [],
    totalCount: totalCount ?? 0,
  }
}

export default async function DashboardPage() {
  const data = await getData()
  return <DashboardClient {...data} />
}
