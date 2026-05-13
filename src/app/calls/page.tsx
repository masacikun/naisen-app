export const metadata = { title: '通話履歴 | 電話履歴管理' }
import { supabaseServer } from '@/lib/supabaseServer'
import { BRANDS } from '@/lib/brands'
import CallsClient from './CallsClient'

export const dynamic = 'force-dynamic'

export type CallsFilters = {
  q?: string; from?: string; to?: string
  brands?: string; statuses?: string
  minDur?: string; excludeInt?: string; hasMemo?: string
  page?: string
}

export default async function CallsPage({
  searchParams,
}: {
  searchParams: Promise<CallsFilters>
}) {
  const sp         = await searchParams
  const page       = Math.max(1, parseInt(sp.page || '1'))
  const limit      = 50
  const offset     = (page - 1) * limit

  const brandIds   = sp.brands   ? sp.brands.split(',').filter(Boolean)   : []
  const statusList = sp.statuses ? sp.statuses.split(',').filter(Boolean) : []
  const excludeInt = sp.excludeInt !== '0'          // default ON
  const hasMemo    = sp.hasMemo === '1'
  const minDur     = sp.minDur ? parseInt(sp.minDur) : null

  const { data: memoData } = await supabaseServer
    .from('caller_memo')
    .select('caller,name,note')
    .order('updated_at', { ascending: false })

  const memos = (memoData ?? []) as { caller: string; name: string; note?: string }[]

  let query = supabaseServer
    .from('naisen_calls')
    .select('*', { count: 'exact' })
    .order('started_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (sp.q)    query = query.ilike('caller', `%${sp.q}%`)
  if (sp.from) query = query.gte('started_at', new Date(sp.from + 'T00:00:00+09:00').toISOString())
  if (sp.to)   query = query.lte('started_at', new Date(sp.to   + 'T23:59:59+09:00').toISOString())

  if (brandIds.length > 0) {
    const activeLines = brandIds.flatMap(id => BRANDS.find(b => b.id === id)?.lines ?? [])
    if (activeLines.length > 0) query = query.in('line_name', activeLines)
  }

  if (statusList.length > 0) query = query.in('status', statusList)
  if (minDur)       query = query.gte('duration_sec', minDur)
  if (excludeInt)   query = query.or('caller.is.null,caller.like.0%')

  if (hasMemo) {
    const memoCals = memos.map(m => m.caller)
    query = memoCals.length > 0
      ? query.in('caller', memoCals)
      : (query as typeof query).eq('id', -1)
  }

  const { data, count } = await query

  return (
    <CallsClient
      calls={data ?? []}
      total={count ?? 0}
      page={page}
      filters={sp}
      memos={memos}
      excludeIntDefault={excludeInt}
    />
  )
}
