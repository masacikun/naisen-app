import { supabaseServer } from '@/lib/supabaseServer'
import CallsClient from './CallsClient'

export const dynamic = 'force-dynamic'

export default async function CallsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; line?: string; status?: string; q?: string }>
}) {
  const sp = await searchParams
  const page = parseInt(sp.page || '1'), limit = 50, offset = (page - 1) * limit

  let query = supabaseServer
    .from('naisen_calls')
    .select('*', { count: 'exact' })
    .order('started_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (sp.line)   query = query.eq('line_name', sp.line)
  if (sp.status) query = query.eq('status', sp.status)
  if (sp.q)      query = query.ilike('caller', `%${sp.q}%`)

  const [{ data, count }, { data: lineRows }, { data: memoData, error: memoErr }] = await Promise.all([
    query,
    supabaseServer.from('naisen_calls').select('line_name').not('line_name', 'is', null).limit(5000),
    supabaseServer.from('caller_memo').select('caller,name,note').order('updated_at', { ascending: false }),
  ])

  const lineSet = Array.from(new Set((lineRows ?? []).map((l: { line_name: string }) => l.line_name))).sort() as string[]
  const memos   = (memoErr ? [] : (memoData ?? [])) as { caller: string; name: string; note?: string }[]

  return <CallsClient calls={data ?? []} total={count ?? 0} page={page} lines={lineSet} filters={sp} memos={memos} />
}
