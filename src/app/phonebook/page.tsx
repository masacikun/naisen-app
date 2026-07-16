export const metadata = { title: '連絡先' }
import { headers } from 'next/headers'
import { supabaseServer } from '@/lib/supabaseServer'
import PhonebookClient, { type Entry, type PartnerOption, type CategoryOption, type BookOption } from './PhonebookClient'
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

  const [{ data: entries }, { data: partners }, { data: categories }, { data: books }] = await Promise.all([
    supabaseServer
      .from('phonebook_entries')
      .select('id,name,name_kana,furigana,furigana_verified,category_key,active,group_name,memo,partner_id,blocked,updated_at,phonebook_numbers(id,phone_raw,phone_normalized,label,kind),phonebook_entry_books(book_key)')
      .order('updated_at', { ascending: false })
      .limit(2000),
    supabaseServer
      .from('partners')
      .select('partner_no,partner_name,phone')
      .eq('is_deleted', false)
      .order('partner_name'),
    supabaseServer
      .from('phonebook_categories')
      .select('key,name,sort,is_system')
      .order('sort'),
    supabaseServer
      .from('phonebook_books')
      .select('key,name,sort')
      .order('sort'),
  ])

  const withLast = await attachLastCalls((entries ?? []) as Omit<Entry, 'last_called_at'>[])

  return (
    <PhonebookClient
      initialQ={q ?? ''}
      initialEntries={withLast as Entry[]}
      partners={(partners ?? []) as PartnerOption[]}
      initialCategories={(categories ?? []) as CategoryOption[]}
      initialBooks={(books ?? []) as BookOption[]}
      isAdmin={isAdmin}
    />
  )
}
