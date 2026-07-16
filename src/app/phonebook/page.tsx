export const metadata = { title: '電話帳' }
import { headers } from 'next/headers'
import { supabaseServer } from '@/lib/supabaseServer'
import PhonebookClient, { type Entry, type PartnerOption } from './PhonebookClient'
import { attachLastCalls } from '@/lib/call-history-server'

export const dynamic = 'force-dynamic'

export default async function PhonebookPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const h = await headers()
  const isAdmin = h.get('x-auth-role') === 'admin'

  const [{ data: entries }, { data: partners }] = await Promise.all([
    supabaseServer
      .from('phonebook_entries')
      .select('id,name,name_kana,group_name,memo,partner_id,blocked,updated_at,phonebook_numbers(id,phone_raw,phone_normalized,label)')
      .order('updated_at', { ascending: false })
      .limit(2000),
    supabaseServer
      .from('partners')
      .select('partner_no,partner_name')
      .eq('is_deleted', false)
      .order('partner_name'),
  ])

  const withLast = await attachLastCalls((entries ?? []) as Omit<Entry, 'last_called_at'>[])

  return (
    <PhonebookClient
      initialQ={q ?? ''}
      initialEntries={withLast as Entry[]}
      partners={(partners ?? []) as PartnerOption[]}
      isAdmin={isAdmin}
    />
  )
}
