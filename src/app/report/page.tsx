export const metadata = { title: 'レポート | 電話履歴管理' }
import { supabaseServer } from '@/lib/supabaseServer'
import ReportClient from './ReportClient'

export const dynamic = 'force-dynamic'

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const sp = await searchParams
  const now = new Date()
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const month = sp.month || defaultMonth

  const [year, mon] = month.split('-').map(Number)
  const monthStart = new Date(year, mon - 1, 1).toISOString()
  const monthEnd   = new Date(year, mon, 0, 23, 59, 59).toISOString()

  const [{ data: calls }, { data: dailyRows }] = await Promise.all([
    supabaseServer
      .from('naisen_calls')
      .select('status,duration_sec,line_name,caller,started_at')
      .gte('started_at', monthStart)
      .lte('started_at', monthEnd)
      .limit(20000),
    supabaseServer
      .from('v_naisen_daily')
      .select('call_date,call_count,answered,no_answer')
      .gte('call_date', month + '-01')
      .lte('call_date', month + '-31')
      .order('call_date'),
  ])

  return (
    <ReportClient
      month={month}
      calls={(calls ?? []) as { status: string; duration_sec?: number; line_name?: string; caller?: string; started_at: string }[]}
      dailyRows={(dailyRows ?? []) as { call_date: string; call_count: number; answered: number; no_answer: number }[]}
    />
  )
}
