export const metadata = { title: 'FAX詳細' }
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { supabaseServer } from '@/lib/supabaseServer'
import { canEditFax } from '@/lib/fax'
import FaxDetailClient, { type FaxDetail } from './FaxDetailClient'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function FaxDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) notFound()

  const hdrs = await headers()
  const canEdit = canEditFax(hdrs.get('x-auth-role'))

  const { data } = await supabaseServer
    .from('naisen_fax_messages')
    .select('id, received_at, from_number, pages, pdf_filename, status, category, memo, drive_url, pbx_uniqueid, deleted_at')
    .eq('id', id)
    .maybeSingle()
  if (!data) notFound()

  return <FaxDetailClient fax={data as FaxDetail} canEdit={canEdit} />
}
