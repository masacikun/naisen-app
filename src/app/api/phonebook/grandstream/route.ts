import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import {
  buildGrandstreamXml,
  isValidBasicAuth,
  type PhonebookEntry,
} from '@/lib/grandstream-phonebook'

export const dynamic = 'force-dynamic'

// Grandstream 電話機（DP750/WP810）向け XML 電話帳配信。
// nginx 側で auth_request バイパス＋この route で Basic 認証（PHONEBOOK_USER / PHONEBOOK_PASS）。
export async function GET(req: NextRequest) {
  if (!isValidBasicAuth(req.headers.get('authorization'))) {
    return new NextResponse('Unauthorized', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="phonebook"' },
    })
  }
  const { data, error } = await supabaseAdmin
    .from('phonebook_entries')
    .select('id,name,phonebook_numbers(phone_raw,phone_normalized,label)')
    .eq('blocked', false)
    .order('id')
    .limit(5000)
  if (error) return new NextResponse('DB error', { status: 500 })

  const xml = buildGrandstreamXml((data ?? []) as PhonebookEntry[])
  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}
