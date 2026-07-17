// 電話帳配信フィード 共通ロジック（純関数・DB非依存・テスト対象）。
// ?user=<内線番号> → 購読電話帳(identity_books)を解決 → 掲載(entry_books)で連絡先を絞る。
// 購読0件は 'all' へフォールバック。退職(active=false)・着信拒否(blocked)は除外。
// DB アクセスは phonebook-feed-server.ts 側（この分離は vitest のため）。
import { type NumberKind, toNumberKind, displayNameWithPrefix, entryDisplayKind } from './display-name'

export interface FeedNumberRow {
  phone_raw: string
  phone_normalized: string | null
  label: string | null
  kind: string | null
}

export interface FeedEntryRow {
  id: number
  name: string
  furigana: string | null
  blocked?: boolean
  active?: boolean
  updated_at: string
  phonebook_numbers: FeedNumberRow[]
  phonebook_categories?: { name: string } | null
}

export interface FeedNumber {
  dial: string
  kind: NumberKind
  label: string | null
}

export interface FeedEntry {
  id: number
  name: string
  furigana: string | null
  category: string | null
  updatedAt: string
  numbers: FeedNumber[]
}

/** 購読電話帳の解決。0件（未設定）は 'all' へフォールバック */
export function resolveBookKeys(rows: { book_key: string }[] | null | undefined): string[] {
  const keys = [...new Set((rows ?? []).map(r => r.book_key).filter(Boolean))]
  return keys.length > 0 ? keys : ['all']
}

/**
 * 番号をダイヤル可能形（先頭0の国内表記＝楽天トランク発信可）へ。
 * - phone_normalized があればそれ（既存正規化と同じ数字列）
 * - null（内線3〜4桁など）は raw から数字を抽出して使う
 * - 数字が1桁も無ければ null（配信対象外）
 */
export function toDialable(n: FeedNumberRow): string | null {
  if (n.phone_normalized) return n.phone_normalized
  const digits = n.phone_raw.normalize('NFKC').replace(/[^0-9]/g, '')
  return digits.length > 0 ? digits : null
}

/** 配信用の表示名（displayName / vCard FN）。エントリ内番号の優先 kind でプレフィックスを付ける（2026-07-18） */
export function feedDisplayName(e: FeedEntry): string {
  return displayNameWithPrefix(e.name, entryDisplayKind(e.numbers.map(n => n.kind)))
}

/**
 * DB 行 → 配信エントリ。退職・着信拒否・番号0件を除外し番号をダイヤル可能形へ。
 * displayName は feedDisplayName（kind プレフィックス付き・2026-07-18 掲載ルール改定）。
 */
export function toFeedEntries(rows: FeedEntryRow[]): FeedEntry[] {
  const out: FeedEntry[] = []
  for (const e of rows) {
    if (e.blocked === true || e.active === false) continue
    const numbers: FeedNumber[] = []
    for (const n of e.phonebook_numbers ?? []) {
      const dial = toDialable(n)
      if (!dial) continue
      numbers.push({ dial, kind: toNumberKind(n.kind), label: n.label })
    }
    if (numbers.length === 0) continue
    out.push({
      id: e.id,
      name: e.name,
      furigana: e.furigana ?? null,
      category: e.phonebook_categories?.name ?? null,
      updatedAt: e.updated_at,
      numbers,
    })
  }
  return out
}

export interface AcrobitsContact {
  contactId: string
  displayName: string
  fnamePhonetic: string
  lnamePhonetic: string
  company: string
  contactEntries: { entryId: string; label: string; type: 'tel'; uri: string }[]
  checksum: string
}

/**
 * Acrobits Groundwire Web Service Contacts JSON。
 * contactId は entry PK（安定・一意でないと端末同期が壊れる）。
 * displayName は kind プレフィックス付き（内線)/外線)/携帯)/AP)・external は素の name）。
 * checksum は updated_at（変更検知用）。phonetic はひらがな。
 * company は番頭さんの区分名（公式 schema にグループ項目が無いため最近縁キーに載せる。
 * Groundwire の一覧はフラットで畳み表示はされない＝詳細画面・検索用）。
 */
export function buildAcrobitsJson(entries: FeedEntry[]): { contacts: AcrobitsContact[] } {
  return {
    contacts: entries.map(e => ({
      contactId: String(e.id),
      displayName: feedDisplayName(e),
      fnamePhonetic: e.furigana ?? '',
      lnamePhonetic: '',
      company: e.category ?? '',
      contactEntries: e.numbers.map((n, i) => ({
        entryId: String(i),
        label: n.label || 'work',
        type: 'tel' as const,
        uri: n.dial,
      })),
      checksum: e.updatedAt,
    })),
  }
}

/**
 * If-Modified-Since 判定（HTTP 日付は秒精度 → 双方を秒へ切り捨てて比較）。
 * 不正な日付ヘッダは false（=200 で全量返す）。
 */
export function isNotModified(ifModifiedSince: string | null, lastModified: Date): boolean {
  if (!ifModifiedSince) return false
  const ims = Date.parse(ifModifiedSince)
  if (Number.isNaN(ims)) return false
  return Math.floor(lastModified.getTime() / 1000) <= Math.floor(ims / 1000)
}

/** ?groups=a,b（旧形式・テスト用オーバーライド）のパース */
export function parseGroupsParam(groups: string | null): string[] | null {
  if (!groups) return null
  const list = groups.split(',').map(s => s.trim()).filter(Boolean)
  return list.length > 0 ? list : null
}
