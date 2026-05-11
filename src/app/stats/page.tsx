import { supabase } from '@/lib/supabase'
import StatsClient from './StatsClient'
export default async function StatsPage() {
  const [{data:hourly},{data:monthly}]=await Promise.all([
    supabase.from('v_naisen_hourly').select('*').order('hour'),
    supabase.from('v_naisen_monthly').select('*').order('month',{ascending:false}).limit(200),
  ])
  return <StatsClient hourly={hourly||[]} monthly={monthly||[]}/>
}
