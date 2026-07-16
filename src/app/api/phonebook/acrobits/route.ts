import { NextRequest, NextResponse } from 'next/server'
import { isValidBasicAuth } from '@/lib/grandstream-phonebook'
import { buildAcrobitsJson, isNotModified, parseGroupsParam } from '@/lib/phonebook-feed'
import { fetchFeedEntries, fetchFeedLastModified } from '@/lib/phonebook-feed-server'

export const dynamic = 'force-dynamic'

// Acrobits Groundwire 向け Web Service Contacts JSON 配信。
// nginx 側で auth_request バイパス（承認後適用）＋この route で Basic 認証（PHONEBOOK_USER / PHONEBOOK_PASS）。
// ?user=<内線番号> で購読電話帳を解決（未設定は all）。?groups= はテスト用オーバーライド。
// ポーリング前提のため If-Modified-Since → 304 対応（Last-Modified は phonebook_feed_state）。
export async function GET(req: NextRequest) {
  if (!isValidBasicAuth(req.headers.get('authorization'))) {
    return new NextResponse('Unauthorized', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="phonebook"' },
    })
  }

  try {
    const lastModified = await fetchFeedLastModified()
    const lmHeaders: Record<string, string> = lastModified
      ? { 'Last-Modified': lastModified.toUTCString() }
      : {}
    if (lastModified && isNotModified(req.headers.get('if-modified-since'), lastModified)) {
      return new NextResponse(null, { status: 304, headers: lmHeaders })
    }

    const user = req.nextUrl.searchParams.get('user')?.trim() || null
    const groups = parseGroupsParam(req.nextUrl.searchParams.get('groups'))
    const entries = await fetchFeedEntries(user, groups)
    return new NextResponse(JSON.stringify(buildAcrobitsJson(entries)), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-cache',
        ...lmHeaders,
      },
    })
  } catch {
    return new NextResponse('DB error', { status: 500 })
  }
}
