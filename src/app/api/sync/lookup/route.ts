import { NextRequest, NextResponse } from 'next/server'
import { isValidSyncAuth } from '@/lib/sync-auth'
import { normalizeCidNumber } from '@/lib/cid-lookup'
import { displayNameWithPrefix, toNumberKind } from '@/lib/display-name'
import { resolveCallerNames } from '@/lib/phonebook'

export const dynamic = 'force-dynamic'

// FreePBX CID逆引き: 着信番号 → 表示名（1件・text/plain）。docs/freepbx-sync.md 契約 v1 参照。
// - nginx 側は /n/api/sync/ の IP 制限（TelPro FreePBX のみ）を通過してくる
// - 認証は Bearer（curl/dialplan 用）に加え Basic も可（cidlookup GUI は user:pass しか渡せない）
// - 名前解決は履歴画面と同一の resolveCallerNames（電話帳→名刺→取引先→従業員）
// - 電話帳ヒットはヒット番号の kind で 内線)/外線)/携帯)/AP) プレフィックス（display-name.ts 共用）
// - 失敗・未登録・blocked は空文字 200（着信フローを止めない fail-open）
function respond(name: string, json: boolean) {
  return json
    ? NextResponse.json({ name }, { headers: { 'Cache-Control': 'no-store' } })
    : new NextResponse(name, {
        status: 200,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
      })
}

export async function GET(req: NextRequest) {
  if (!isValidSyncAuth(req.headers.get('authorization'))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const json = req.nextUrl.searchParams.get('format') === 'json'
  const number = normalizeCidNumber(req.nextUrl.searchParams.get('number'))
  if (!number) return respond('', json)

  try {
    const hit = (await resolveCallerNames([number])).get(number)
    if (!hit || hit.blocked) return respond('', json)
    const name =
      hit.source === '電話帳' ? displayNameWithPrefix(hit.name, toNumberKind(hit.numberKind)) : hit.name
    return respond(name, json)
  } catch {
    return respond('', json)
  }
}
