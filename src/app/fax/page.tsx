export const metadata = { title: 'FAX受信管理' }
import { headers } from 'next/headers'
import { supabaseServer } from '@/lib/supabaseServer'
import { canEditFax } from '@/lib/fax'
import FaxClient, { type FaxRow } from './FaxClient'

export const dynamic = 'force-dynamic'

export default async function FaxPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; status?: string; cat?: string; dm?: string }>
}) {
  const sp = await searchParams
  const hdrs = await headers()
  const canEdit = canEditFax(hdrs.get('x-auth-role'))

  let q = supabaseServer
    .from('naisen_fax_messages')
    .select('id, received_at, from_number, pages, pdf_filename, status, category, memo, drive_url')
    .order('received_at', { ascending: false })
    .limit(500)

  if (sp.from) q = q.gte('received_at', `${sp.from}T00:00:00+09:00`)
  if (sp.to) q = q.lte('received_at', `${sp.to}T23:59:59+09:00`)
  if (sp.status) q = q.eq('status', sp.status)
  if (sp.cat) q = q.eq('category', sp.cat)
  // 既定は DM を隠す（dm=1 で表示・status=dm 指定時はそのまま）
  if (!sp.status && sp.dm !== '1') q = q.neq('status', 'dm')

  const { data } = await q
  const rows = (data ?? []) as FaxRow[]

  return (
    <FaxClient
      rows={rows}
      canEdit={canEdit}
      filters={{ from: sp.from ?? '', to: sp.to ?? '', status: sp.status ?? '', cat: sp.cat ?? '', dm: sp.dm === '1' }}
    />
  )
}
