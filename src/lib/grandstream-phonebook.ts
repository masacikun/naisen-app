// Grandstream XML 電話帳（DP750/WP810 定期DL用）の整形と Basic 認証（純関数・DB非依存・テスト対象）。
// 出力形式は Grandstream AddressBook XML（GXP/DP/WP 共通の phonebook.xml 形式）。
// 2026-07-16: 入力を配信共通の FeedEntry（phonebook-feed.ts）に統一（?user= 絞り込み・内線番号対応）。
import { timingSafeEqual } from 'crypto'
import { feedDisplayName, type FeedEntry } from './phonebook-feed'

/** XML 特殊文字のエスケープ（& < > " '） */
export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Grandstream AddressBook XML を生成する。
 * - 番号は FeedEntry.numbers.dial（ダイヤル可能形・内線は数字そのまま）
 * - 番号0件の連絡先は FeedEntry 化の時点で除外済み（toFeedEntries）
 * - 複数番号は同一 Contact 内に <Phone type="Work"> を複数並べる
 */
export function buildGrandstreamXml(entries: FeedEntry[]): string {
  const contacts: string[] = []
  for (const e of entries) {
    if (e.numbers.length === 0) continue
    const phones = e.numbers
      .map(
        n =>
          `    <Phone type="Work">\n      <phonenumber>${escapeXml(n.dial)}</phonenumber>\n      <accountindex>0</accountindex>\n    </Phone>`,
      )
      .join('\n')
    contacts.push(
      `  <Contact>\n    <id>${e.id}</id>\n    <FirstName>${escapeXml(feedDisplayName(e))}</FirstName>\n    <LastName></LastName>\n${phones}\n  </Contact>`,
    )
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<AddressBook>\n  <version>1</version>\n${contacts.join('\n')}\n</AddressBook>\n`
}

/**
 * HTTP Basic 認証の照合（定数時間比較）。
 * - PHONEBOOK_USER / PHONEBOOK_PASS が両方未設定なら素通し（true）
 * - どちらか設定済みならヘッダ必須・完全一致のみ許可
 */
export function isValidBasicAuth(
  authHeader: string | null,
  user: string | undefined = process.env.PHONEBOOK_USER,
  pass: string | undefined = process.env.PHONEBOOK_PASS,
): boolean {
  if (!user && !pass) return true
  if (!authHeader?.startsWith('Basic ')) return false
  let decoded: string
  try {
    decoded = Buffer.from(authHeader.slice('Basic '.length).trim(), 'base64').toString('utf-8')
  } catch {
    return false
  }
  const idx = decoded.indexOf(':')
  if (idx < 0) return false
  const given = Buffer.from(decoded)
  const expected = Buffer.from(`${user ?? ''}:${pass ?? ''}`)
  return expected.length === given.length && timingSafeEqual(expected, given)
}
