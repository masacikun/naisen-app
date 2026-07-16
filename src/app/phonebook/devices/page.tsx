export const metadata = { title: '端末電話帳' }
import { headers } from 'next/headers'
import { supabaseServer } from '@/lib/supabaseServer'
import DevicesClient, { type BookOption, type IdentityBookRow } from './DevicesClient'

export const dynamic = 'force-dynamic'

export default async function DevicesPage() {
  const h = await headers()
  const isAdmin = h.get('x-auth-role') === 'admin'

  const [{ data: books }, { data: identityBooks }] = await Promise.all([
    supabaseServer.from('phonebook_books').select('key,name,sort').order('sort'),
    supabaseServer.from('phonebook_identity_books').select('identity,book_key').order('identity'),
  ])

  return (
    <DevicesClient
      initialBooks={(books ?? []) as BookOption[]}
      initialRows={(identityBooks ?? []) as IdentityBookRow[]}
      isAdmin={isAdmin}
    />
  )
}
