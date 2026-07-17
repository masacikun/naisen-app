// 着信相手名の突合（純関数・DB非依存）と番号入力のパース。
// 突合キーは normalizePhone の結果（数字列）の完全一致。
// 優先順位: 電話帳（主）→ 取引先 → 従業員（master はフォールバック）。
import { normalizePhone, splitPhones } from './phone'

export type NameSource = '電話帳' | '名刺' | '取引先' | '従業員'

export interface ResolvedName {
  name: string
  source: NameSource
  entryId?: number
  note?: string | null
  blocked?: boolean
  group?: string | null        // 電話帳ヒット時のグループ名（履歴インライン編集用）
  partnerNo?: number        // 取引先ヒット時の partner_no（電話帳クイック登録の自動リンク用）
  partnerName?: string      // 電話帳ヒットで partner_id リンク済みの場合の取引先名
  numberKind?: string | null // 電話帳ヒット時のヒット番号の kind（/lookup の 内線)/社内) プレフィックス用）
}

export interface PhonebookMatchRow {
  phone_normalized: string | null
  kind?: string | null
  entry: { id: number; name: string; memo: string | null; blocked?: boolean; partner_id?: number | null; group_name?: string | null }
}
export interface PartnerRow { partner_no: number; partner_name: string; phone: string | null }
export interface EmployeeRow { name: string; phone_landline: string | null }
export interface MeishiRow { name: string | null; company: string | null; tel: string | null; mobile: string | null }

/** caller(原表記)の配列を正規化番号で突合し、caller→表示名(出所付き)の Map を返す */
export function buildNameMap(
  callers: string[],
  phonebook: PhonebookMatchRow[],
  partners: PartnerRow[],
  employees: EmployeeRow[],
  meishi: MeishiRow[] = [],
): Map<string, ResolvedName> {
  // 優先度の低い順に詰め、高い方で上書き（従業員 → 取引先 → 名刺 → 電話帳）
  const byNorm = new Map<string, ResolvedName>()
  for (const e of employees) {
    const n = e.phone_landline ? normalizePhone(e.phone_landline) : null
    if (n && e.name) byNorm.set(n, { name: e.name, source: '従業員' })
  }
  const partnersByNo = new Map(partners.map(p => [p.partner_no, p.partner_name]))
  for (const p of partners) {
    const n = p.phone ? normalizePhone(p.phone) : null
    if (n) byNorm.set(n, { name: p.partner_name, source: '取引先', partnerNo: p.partner_no })
  }
  for (const m of meishi) {
    // 表示は「会社 氏名」（片方欠けは有る方のみ）。tel/mobile の両方を突合キーにする
    const label = [m.company, m.name].filter(Boolean).join(' ')
    if (!label) continue
    for (const raw of [m.tel, m.mobile]) {
      const n = raw ? normalizePhone(raw) : null
      if (n) byNorm.set(n, { name: label, source: '名刺' })
    }
  }
  for (const row of phonebook) {
    if (!row.phone_normalized) continue
    // 同一番号の多重ヒットは決定的に最小 entry_id を採用
    const prev = byNorm.get(row.phone_normalized)
    if (prev?.source === '電話帳' && prev.entryId != null && prev.entryId <= row.entry.id) continue
    const partnerName = row.entry.partner_id != null ? partnersByNo.get(row.entry.partner_id) : undefined
    byNorm.set(row.phone_normalized, {
      name: row.entry.name,
      source: '電話帳',
      entryId: row.entry.id,
      note: row.entry.memo,
      blocked: row.entry.blocked ?? false,
      group: row.entry.group_name ?? null,
      numberKind: row.kind ?? null,
      ...(partnerName ? { partnerName } : {}),
      ...(row.entry.partner_id != null ? { partnerNo: row.entry.partner_id } : {}),
    })
  }

  const out = new Map<string, ResolvedName>()
  for (const caller of callers) {
    if (!caller) continue
    const n = normalizePhone(caller) // 内線(3-4桁)・非通知は null → 突合しない
    const hit = n ? byNorm.get(n) : undefined
    if (hit) out.set(caller, hit)
  }
  return out
}

/**
 * 番号入力（文字列 or 配列・複数番号の詰め込み可）を phonebook_numbers 行の素に変換する。
 * splitPhones で分割するため、1入力が複数行になりうる。
 */
export function parseNumbersInput(
  input: string | string[] | null | undefined,
): { phone_raw: string; phone_normalized: string | null }[] {
  const parts = Array.isArray(input) ? input : input ? [input] : []
  return parts
    .flatMap(p => splitPhones(p ?? ''))
    .filter(sp => sp.raw.length > 0)
    .map(sp => ({ phone_raw: sp.raw, phone_normalized: sp.normalized }))
}

export type NumberInput = string | { raw: string; label?: string | null; kind?: string | null }

/** kind の許容値（display-name.ts の NumberKind と同一。旧 internal は company_050・不正は external） */
export function sanitizeNumberKind(
  kind: string | null | undefined,
): 'extension' | 'company_050' | 'mobile' | 'ap' | 'external' {
  if (kind === 'extension' || kind === 'company_050' || kind === 'mobile' || kind === 'ap') return kind
  if (kind === 'internal') return 'company_050' // 2026-07-18 kind拡張前の旧値（互換）
  return 'external'
}

/** body.book_keys（掲載電話帳）のサニタイズ。配列以外は undefined（=既存維持/新規は all） */
export function parseBookKeys(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined
  return [...new Set(v.filter((k): k is string => typeof k === 'string' && k.trim().length > 0))]
}

/** API 入力（文字列 or {raw,label,kind} の配列）→ phonebook_numbers の insert 行 */
export function buildNumberRows(
  numbers: NumberInput[] | string | null | undefined,
  entryId: number,
): { phone_raw: string; phone_normalized: string | null; label: string | null; kind: string; entry_id: number }[] {
  const inputs: NumberInput[] = Array.isArray(numbers) ? numbers : numbers ? [numbers] : []
  return inputs.flatMap(n => {
    const raw = typeof n === 'string' ? n : n.raw
    const label = typeof n === 'string' ? null : (n.label?.trim() || null)
    const kind = sanitizeNumberKind(typeof n === 'string' ? null : n.kind)
    return parseNumbersInput(raw).map(p => ({ ...p, label, kind, entry_id: entryId }))
  })
}
