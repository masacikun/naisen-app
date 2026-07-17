// CardDAV 配信の純ロジック（vCard 生成・WebDAV XML 組み立て・認証比較）。
// データ源は既存 acrobits フィード（/n/api/phonebook/acrobits）の JSON をそのまま受ける。
// サーバ本体は server.mjs（HTTP/ルーティング/ログ）。
import { createHash, timingSafeEqual } from 'node:crypto'

/** .env.local の素朴なパース（KEY=VALUE・#コメント/空行無視・クォート除去） */
export function parseDotEnv(text) {
  const out = {}
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!m || line.trim().startsWith('#')) continue
    let v = m[2]
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    out[m[1]] = v
  }
  return out
}

/** Basic 認証の定数時間比較 */
export function checkBasicAuth(header, user, pass) {
  if (!user || !pass) return false
  if (!header?.startsWith('Basic ')) return false
  let decoded
  try {
    decoded = Buffer.from(header.slice(6).trim(), 'base64').toString('utf-8')
  } catch {
    return false
  }
  const expected = Buffer.from(`${user}:${pass}`)
  const given = Buffer.from(decoded)
  return expected.length === given.length && timingSafeEqual(expected, given)
}

/** XML 特殊文字エスケープ */
export function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** vCard テキスト値のエスケープ（\ , ; 改行） */
export function escapeVcard(s) {
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/** ISO 日時 → vCard REV 形式（20260717T012345Z）。パース不能なら null */
export function toRev(iso) {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  return new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

/** 連絡先1件の ETag（id + checksum(updated_at) から安定生成・quoted） */
export function etagOf(c) {
  const h = createHash('sha1').update(`${c.contactId}|${c.checksum}`).digest('hex').slice(0, 16)
  return `"${h}"`
}

/** コレクション全体の CTag（全 ETag から安定生成） */
export function ctagOf(contacts) {
  const h = createHash('sha1')
  for (const c of contacts) h.update(etagOf(c))
  return h.digest('hex').slice(0, 16)
}

/**
 * acrobits フィードの contact 1件 → vCard 3.0。
 * ふりがなは iOS/Acrobits 系が解釈する X-PHONETIC-FIRST-NAME / X-PHONETIC-LAST-NAME の
 * 両方と SORT-STRING に載せる（どのキーが効くかは実機確認で絞る）。
 */
export function buildVcard(c) {
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `UID:bantosan-${c.contactId}`,
    `FN:${escapeVcard(c.displayName)}`,
    `N:${escapeVcard(c.displayName)};;;;`,
  ]
  const kana = (c.fnamePhonetic || c.lnamePhonetic || '').trim()
  if (kana) {
    lines.push(`X-PHONETIC-FIRST-NAME:${escapeVcard(kana)}`)
    lines.push(`X-PHONETIC-LAST-NAME:${escapeVcard(kana)}`)
    lines.push(`SORT-STRING:${escapeVcard(kana)}`)
  }
  if (c.company) lines.push(`ORG:${escapeVcard(c.company)}`)
  for (const e of c.contactEntries ?? []) {
    if (e.type !== 'tel' || !e.uri) continue
    const label = (e.label || 'work').replace(/[^0-9A-Za-z　-鿿豈-﫿぀-ヿ・ー\- ]/g, '')
    lines.push(`TEL;TYPE=voice${label ? `;X-LABEL=${escapeVcard(label)}` : ''}:${e.uri}`)
  }
  const rev = toRev(c.checksum)
  if (rev) lines.push(`REV:${rev}`)
  lines.push('END:VCARD')
  return lines.join('\r\n') + '\r\n'
}

const NS = 'xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav" xmlns:cs="http://calendarserver.org/ns/"'

/** PROPFIND(コレクション)の <d:response>。自身を principal/home としても名乗り、探索を自己完結させる */
export function collectionResponse(href, displayName, ctag) {
  return `<d:response>
  <d:href>${escapeXml(href)}</d:href>
  <d:propstat>
    <d:prop>
      <d:resourcetype><d:collection/><card:addressbook/></d:resourcetype>
      <d:displayname>${escapeXml(displayName)}</d:displayname>
      <d:current-user-principal><d:href>${escapeXml(href)}</d:href></d:current-user-principal>
      <d:principal-URL><d:href>${escapeXml(href)}</d:href></d:principal-URL>
      <card:addressbook-home-set><d:href>${escapeXml(href)}</d:href></card:addressbook-home-set>
      <d:supported-report-set>
        <d:supported-report><d:report><card:addressbook-query/></d:report></d:supported-report>
        <d:supported-report><d:report><card:addressbook-multiget/></d:report></d:supported-report>
      </d:supported-report-set>
      <cs:getctag>${escapeXml(ctag)}</cs:getctag>
      <d:sync-token>${escapeXml(ctag)}</d:sync-token>
    </d:prop>
    <d:status>HTTP/1.1 200 OK</d:status>
  </d:propstat>
</d:response>`
}

/** PROPFIND(連絡先1件)の <d:response>（一覧用・本文なし） */
export function itemResponse(href, etag) {
  return `<d:response>
  <d:href>${escapeXml(href)}</d:href>
  <d:propstat>
    <d:prop>
      <d:resourcetype/>
      <d:getetag>${escapeXml(etag)}</d:getetag>
      <d:getcontenttype>text/vcard; charset=utf-8</d:getcontenttype>
    </d:prop>
    <d:status>HTTP/1.1 200 OK</d:status>
  </d:propstat>
</d:response>`
}

/** REPORT 用 <d:response>（address-data＝vCard 本文入り） */
export function reportItemResponse(href, etag, vcard) {
  return `<d:response>
  <d:href>${escapeXml(href)}</d:href>
  <d:propstat>
    <d:prop>
      <d:getetag>${escapeXml(etag)}</d:getetag>
      <card:address-data>${escapeXml(vcard)}</card:address-data>
    </d:prop>
    <d:status>HTTP/1.1 200 OK</d:status>
  </d:propstat>
</d:response>`
}

/** <d:multistatus> で包む */
export function multistatus(responses) {
  return `<?xml version="1.0" encoding="utf-8"?>\n<d:multistatus ${NS}>\n${responses.join('\n')}\n</d:multistatus>\n`
}

/** REPORT ボディから addressbook-multiget の href 一覧を抽出（multiget でなければ null） */
export function parseMultigetHrefs(body) {
  if (!/addressbook-multiget/i.test(body)) return null
  const hrefs = []
  const re = /<[^>]*href[^>]*>([^<]+)<\/[^>]*href[^>]*>/gi
  let m
  while ((m = re.exec(body)) !== null) hrefs.push(decodeURIComponent(m[1].trim()))
  return hrefs
}
