import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "crypto"
import { escapeXml } from "@/lib/grandstream-phonebook"

export const dynamic = "force-dynamic"

// Groundwire(Acrobits) 向けプロビジョニング配布。
// wsContacts 系 prefKey だけを mergeable XML(低優先度 priority=5)で追加 → 既存SIPアカウントは温存。
// 配布動線: ブラウザ/カメラで開くと provlinkbs://(HTTPS+マージ)へ302 → Groundwire起動 →
//           アプリUAで同URLを再取得し XML を適用。個人連絡先(ab)ソースには触れない=本体連絡先はONのまま。
// ?token=<PROVISIONING_TOKEN> で保護(未設定/不一致は404)。フィードのBasic認証情報を含むため。
const APP_UA = /acrobits|groundwire|cloudsoftphone/i

function tokenOk(given: string | null): boolean {
  const expected = process.env.PROVISIONING_TOKEN
  if (!expected || !given) return false
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token")
  if (!tokenOk(token)) {
    return new NextResponse("Not found", { status: 404 })
  }

  const host = req.headers.get("host") || "banto.hakata-yamato.co.jp"
  const ua = req.headers.get("user-agent") || ""

  // アプリ以外(ブラウザ/カメラ)から開かれたら provlinkbs へ誘導して Groundwire を起動
  if (!APP_UA.test(ua)) {
    const t = encodeURIComponent(token as string)
    return NextResponse.redirect(
      `provlinkbs://${host}/n/api/phonebook/provisioning/groundwire?token=${t}`,
      302,
    )
  }

  const user = process.env.PHONEBOOK_USER || ""
  const pass = process.env.PHONEBOOK_PASS || ""
  // %account[username]% は Groundwire が SIPユーザー名(=内線)に置換 → サーバーが購読電話帳を解決
  const feedUrl = `https://${host}/n/api/phonebook/acrobits?user=%account[username]%`

  const xml =
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n" +
    "<account>\n" +
    `  <wsContactsUrl priority="5" source="provisioning">${escapeXml(feedUrl)}</wsContactsUrl>\n` +
    `  <wsContactsAuthUsername priority="5" source="provisioning">${escapeXml(user)}</wsContactsAuthUsername>\n` +
    `  <wsContactsAuthPassword priority="5" source="provisioning">${escapeXml(pass)}</wsContactsAuthPassword>\n` +
    // refresh キー名は版差があるため両方入れる(mergeableで未知キーは無害に保持)。テスト後に有効な方へ整理。
    "  <wsContactsRefresh priority=\"5\" source=\"provisioning\">300</wsContactsRefresh>\n" +
    "  <wsContactsRefreshInterval priority=\"5\" source=\"provisioning\">300</wsContactsRefreshInterval>\n" +
    "</account>\n"

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "no-store",
    },
  })
}
