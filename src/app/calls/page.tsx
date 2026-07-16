export const metadata = { title: '通話履歴' }
import { headers } from 'next/headers'
import { supabaseServer } from '@/lib/supabaseServer'
import { BRANDS } from '@/lib/brands'
import { resolveCallerNames } from '@/lib/phonebook'
import { cleanCnam } from '@/lib/phone'
import CallsClient, { type ResolvedEntry } from './CallsClient'

export const dynamic = 'force-dynamic'

export type CallsFilters = {
  q?: string; from?: string; to?: string
  brands?: string; statuses?: string
  minDur?: string; excludeInt?: string; hasMemo?: string
  blocked?: string
  dir?: string
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
  const blockedOnly = sp.blocked === '1'
  const dir        = sp.dir === 'out' ? 'out' as const : 'in' as const
  const minDur     = sp.minDur ? parseInt(sp.minDur) : null

  // naisen_calls_ex = naisen_calls + 電話帳突合フラグ(in_phonebook/is_blocked)のビュー
  // （電話帳の全番号を .in() で渡すと URL 長超過で 502 になるため DB 側で判定）
  let query = supabaseServer
    .from('naisen_calls_ex')
    .select('*', { count: 'exact' })
    .order('started_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (sp.q)    query = query.ilike(dir === 'out' ? 'destination' : 'caller', `%${sp.q}%`)
  if (sp.from) query = query.gte('started_at', new Date(sp.from + 'T00:00:00+09:00').toISOString())
  if (sp.to)   query = query.lte('started_at', new Date(sp.to   + 'T23:59:59+09:00').toISOString())

  if (brandIds.length > 0) {
    const activeLines = brandIds.flatMap(id => BRANDS.find(b => b.id === id)?.lines ?? [])
    if (activeLines.length > 0) query = query.in('line_name', activeLines)
  }

  if (statusList.length > 0) query = query.in('status', statusList)
  if (minDur)       query = query.gte('duration_sec', minDur)

  if (dir === 'out') {
    // 発信 = 内線発・外線宛（outbound_line が有効な行）。電話帳系フラグは caller 基準のため適用しない
    query = query
      .not('caller', 'is', null).not('caller', 'like', '0%')
      .not('outbound_line', 'is', null).neq('outbound_line', '').neq('outbound_line', 'nan')
  } else {
    if (excludeInt)   query = query.or('caller.is.null,caller.like.0%')
    if (hasMemo)     query = query.eq('in_phonebook', true)
    if (blockedOnly) query = query.eq('is_blocked', true)
  }

  const { data, count } = await query
  // 過去取込分の caller_name には PBX の表示プレフィックス（例「水炊き大和|090xxx」）が
  // 残っているため表示前にクリーニング（新規取込は cdr-transform 側で適用済み）
  const calls = (data ?? []).map(c => ({ ...c, caller_name: cleanCnam(c.caller_name) }))

  // 相手名の突合（着信=caller / 発信=destination）: 表示ページ分のみ一括解決
  const counterparts = calls.map(c => (dir === 'out' ? c.destination : c.caller)).filter(Boolean) as string[]
  const nameMap = await resolveCallerNames(counterparts)
  const names: ResolvedEntry[] = [...nameMap.entries()].map(([caller, r]) => ({
    caller, name: r.name, source: r.source, entryId: r.entryId, note: r.note ?? null, blocked: r.blocked ?? false, group: r.group ?? null,
    partnerNo: r.partnerNo, partnerName: r.partnerName,
  }))

  const isAdmin = (await headers()).get('x-auth-role') === 'admin'

  // ✏️の取引先リンク用（38件・軽量）
  const { data: partners } = await supabaseServer
    .from('partners')
    .select('partner_no,partner_name')
    .eq('is_deleted', false)
    .order('partner_name')

  return (
    <CallsClient
      calls={calls}
      total={count ?? 0}
      page={page}
      filters={sp}
      names={names}
      partners={partners ?? []}
      isAdmin={isAdmin}
      excludeIntDefault={excludeInt}
    />
  )
}
