import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "crypto"
import { escapeXml } from "@/lib/grandstream-phonebook"

export const dynamic = "force-dynamic"

// Groundwire(Acrobits) 向けプロビジョニング配布。
// wsContacts 系 prefKey だけを mergeable XML(低優先度 priority=5)で追加 → 既存SIPアカウントは温存。
//
// iOS 実機知見(2026-07-17): provlinkbs:// スキームは「リンクとしてタップ」した時のみ発火する。
//   アドレスバー入力・302リダイレクト・QR→アドレス では起動しない(実機で「アドレスは無効」)。
//   → ブラウザ経路は【タップ可能ボタンを置いたHTMLページ】を返す(302をやめた)。
//   → ボタンの href は fmt=xml 付き。Groundwire がそれを開いて https で再取得 → XML を適用。
//      これで Groundwire 側の User-Agent に依存せず XML を確実に返せる。
// ?token=<PROVISIONING_TOKEN> で保護(未設定/不一致は404)。フィードのBasic認証情報を含むため。
const APP_UA = /acrobits|groundwire|cloudsoftphone/i

function tokenOk(given: string | null): boolean {
  const expected = process.env.PROVISIONING_TOKEN
  if (!expected || !given) return false
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

function buildXml(host: string): string {
  const user = process.env.PHONEBOOK_USER || ""
  const pass = process.env.PHONEBOOK_PASS || ""
  // %account[username]% は Groundwire が SIPユーザー名(=内線)に置換 → サーバーが購読電話帳を解決
  const feedUrl = `https://${host}/n/api/phonebook/acrobits?user=%account[username]%`
  return (
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n" +
    "<account>\n" +
    `  <wsContactsUrl priority="5" source="provisioning">${escapeXml(feedUrl)}</wsContactsUrl>\n` +
    `  <wsContactsAuthUsername priority="5" source="provisioning">${escapeXml(user)}</wsContactsAuthUsername>\n` +
    `  <wsContactsAuthPassword priority="5" source="provisioning">${escapeXml(pass)}</wsContactsAuthPassword>\n` +
    // refresh キー名は版差があるため両方入れる(mergeableで未知キーは無害に保持)。テスト後に有効な方へ整理。
    "  <wsContactsRefresh priority=\"5\" source=\"provisioning\">300</wsContactsRefresh>\n" +
    "  <wsContactsRefreshInterval priority=\"5\" source=\"provisioning\">300</wsContactsRefreshInterval>\n" +
    "</account>\n"
  )
}

function buildLanding(host: string, token: string): string {
  const provlink = `provlinkbs://${host}/n/api/phonebook/provisioning/groundwire?token=${token}&fmt=xml`
  const h = provlink.replace(/&/g, "&amp;") // HTML属性/本文用にエンティティ化
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Groundwire 会社電話帳セットアップ</title>
<style>
  :root{color-scheme:light dark}
  body{font-family:-apple-system,system-ui,"Hiragino Sans",sans-serif;line-height:1.7;
    margin:0;padding:28px 20px;max-width:560px;margin:0 auto;
    background:#f4f6f8;color:#161c22}
  @media(prefers-color-scheme:dark){body{background:#0f1318;color:#e7ecf1}}
  h1{font-size:20px;margin:0 0 4px}
  p{margin:10px 0;font-size:15px}
  .btn{display:block;text-align:center;background:#0f7d78;color:#fff;text-decoration:none;
    font-size:19px;font-weight:700;padding:18px;border-radius:14px;margin:22px 0 10px}
  .muted{color:#6b7682;font-size:13px}
  @media(prefers-color-scheme:dark){.muted{color:#9aa6b2}}
  code{display:block;word-break:break-all;background:rgba(127,127,127,.14);
    padding:12px;border-radius:10px;font-size:12px;margin-top:6px;
    -webkit-user-select:all;user-select:all}
  ol{padding-left:20px;font-size:15px}
</style>
</head>
<body>
  <h1>Groundwire に会社電話帳を入れる</h1>
  <p>下のボタンを <b>タップ</b> してください。<br>「"Groundwire" で開きますか?」→ <b>開く</b> → 取り込み。</p>
  <a class="btn" href="${h}">Groundwire で開く</a>
  <p class="muted">※このボタンは「タップ」した時だけ Groundwire が開きます（アドレスバーに貼り付け/QRから直接ひらく方式では開きません）。</p>
  <p>開かない場合の代替:</p>
  <ol>
    <li>下のリンクを長押し→全部コピー</li>
    <li>Apple「メモ」に貼り付け（リンク化される）</li>
    <li>メモ上でそのリンクを <b>タップ</b></li>
  </ol>
  <code>${h}</code>
  <p class="muted">会社電話帳は Groundwire アプリ内にだけ入り、iPhone 本体の「連絡先」には書き込みません。</p>
</body>
</html>
`
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token")
  if (!tokenOk(token)) {
    return new NextResponse("Not found", { status: 404 })
  }

  const host = req.headers.get("host") || "banto.hakata-yamato.co.jp"
  const ua = req.headers.get("user-agent") || ""
  const fmt = req.nextUrl.searchParams.get("fmt")

  // fmt=xml もしくはアプリUA → プロビジョニングXMLを返す(Groundwireが取得する経路)
  if (fmt === "xml" || APP_UA.test(ua)) {
    return new NextResponse(buildXml(host), {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "no-store",
      },
    })
  }

  // それ以外(ブラウザ/カメラ) → タップ用ボタンを置いたランディングページ
  return new NextResponse(buildLanding(host, token as string), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  })
}
