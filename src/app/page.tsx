import { supabase } from '@/lib/supabase'
import DashboardClient from './DashboardClient'
async function getData() {
  const now = new Date()
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth()-1, 1).toISOString()
  const lastMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString()
  const [{ data: thisMonth }, { data: lastMonth }, { data: monthly }, { data: byLine }] = await Promise.all([
    supabase.from('naisen_calls').select('status,duration_sec,line_name').gte('started_at', thisMonthStart),
    supabase.from('naisen_calls').select('status,duration_sec').gte('started_at', lastMonthStart).lte('started_at', lastMonthEnd),
    supabase.from('v_naisen_monthly').select('*').gte('month', new Date(now.getFullYear(), now.getMonth()-11, 1).toISOString()).eq('status','ANSWERED').order('month',{ascending:true}),
    supabase.from('naisen_calls').select('line_name,status').gte('started_at', thisMonthStart).not('line_name','is',null),
  ])
  return { thisMonth: thisMonth||[], lastMonth: lastMonth||[], monthly: monthly||[], byLine: byLine||[] }
}
export default async function DashboardPage() {
  const data = await getData()
  return <DashboardClient {...data} />
}
