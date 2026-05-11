import { supabaseServer } from '@/lib/supabaseServer'
import StatsClient from './StatsClient'

export const dynamic = 'force-dynamic'

export default async function StatsPage() {
  const [{ data: hourly }, { data: monthly }] = await Promise.all([
    supabaseServer.from('v_naisen_hourly').select('*').order('hour'),
    supabaseServer.from('v_naisen_monthly').select('*').order('month', { ascending: false }).limit(200),
  ])
  return <StatsClient hourly={hourly ?? []} monthly={monthly ?? []} />
}
