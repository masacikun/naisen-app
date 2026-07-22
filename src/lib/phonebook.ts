// 電話帳・master(取引先/従業員)による着信相手名解決（サーバ専用・DB接続あり）。
// 純ロジックは phonebook-match.ts に分離（そちらは単体テスト対象）。
import { supabaseAdmin } from './supabase-admin'
import { normalizePhone } from './phone'
import {
  buildNameMap,
  type ResolvedName,
  type PhonebookMatchRow,
  type PartnerRow,
  type PartnerExtraPhoneRow,
  type MeishiRow,
} from './phonebook-match'

export type { ResolvedName } from './phonebook-match'

// .in() は GET のクエリ文字列になるため URL 長対策でチャンク分割
const IN_CHUNK = 100

type RawPbRow = {
  phone_normalized: string | null
  kind: string | null
  phonebook_entries:
    | { id: number; name: string; memo: string | null; blocked?: boolean; partner_id?: number | null; group_name?: string | null; category_key?: string | null }
    | { id: number; name: string; memo: string | null; blocked?: boolean; partner_id?: number | null; group_name?: string | null; category_key?: string | null }[]
    | null
}

/** caller(原表記)配列 → 電話帳(主)→取引先→従業員 の順で表示名を引く */
export async function resolveCallerNames(callers: string[]): Promise<Map<string, ResolvedName>> {
  const uniq = [...new Set(callers.filter(Boolean))]
  const norms = [...new Set(uniq.map(c => normalizePhone(c)).filter((n): n is string => !!n))]
  if (norms.length === 0) return new Map()

  const pbRows: PhonebookMatchRow[] = []
  for (let i = 0; i < norms.length; i += IN_CHUNK) {
    const { data } = await supabaseAdmin
      .from('phonebook_numbers')
      .select('phone_normalized, kind, phonebook_entries(id,name,memo,blocked,partner_id,group_name,category_key)')
      .in('phone_normalized', norms.slice(i, i + IN_CHUNK))
    for (const r of (data ?? []) as RawPbRow[]) {
      const e = Array.isArray(r.phonebook_entries) ? r.phonebook_entries[0] : r.phonebook_entries
      if (e) pbRows.push({ phone_normalized: r.phone_normalized, kind: r.kind, entry: e })
    }
  }

  // master・名刺フォールバック: 小規模テーブルのため全件取得し、正規化はコード側で行う
  const [{ data: partners }, { data: employees }, { data: meishi }, { data: extraPhones }] = await Promise.all([
    // phone 有無を問わず全取引先を取得（電話帳エントリの partner_id → 取引先名の解決にも使う）
    supabaseAdmin
      .from('partners')
      .select('partner_no,partner_name,phone')
      .eq('is_deleted', false),
    supabaseAdmin
      .from('employees')
      .select('last_name,first_name,phone_landline')
      .not('phone_landline', 'is', null),
    supabaseAdmin
      .from('business_cards')
      .select('name,company,tel,mobile')
      .or('tel.not.is.null,mobile.not.is.null'),
    // 取引先の追加電話番号（partner_phone_numbers・番号相違や複数拠点用・2026-07-22）
    supabaseAdmin
      .from('partner_phone_numbers')
      .select('partner_no,phone'),
  ])

  const employeeRows = ((employees ?? []) as {
    last_name: string | null; first_name: string | null; phone_landline: string | null
  }[]).map(e => ({
    name: [e.last_name, e.first_name].filter(Boolean).join(' '),
    phone_landline: e.phone_landline,
  }))

  return buildNameMap(uniq, pbRows, (partners ?? []) as PartnerRow[], employeeRows, (meishi ?? []) as MeishiRow[], (extraPhones ?? []) as PartnerExtraPhoneRow[])
}

/**
 * 電話帳の正規化済み番号一覧（「電話帳あり」フィルタ用）。
 * naisen_calls.caller は数字のみ保持のため正規化番号との完全一致でヒットする。
 * .in() の URL 長制約のため上限あり（電話帳が大規模化したら naisen_calls 側の
 * 正規化列追加を Slice 2 以降で検討）。
 */
export async function fetchPhonebookNormalized(limit = 500): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from('phonebook_numbers')
    .select('phone_normalized')
    .not('phone_normalized', 'is', null)
    .limit(limit)
  return [...new Set((data ?? []).map(r => r.phone_normalized as string))]
}

/**
 * 電話帳エントリを取引先へリンクした時、その連絡先の番号を取引先の追加電話番号
 * （master-app の partner_phone_numbers・番号相違や複数拠点用）へ同期する（2026-07-22 まさし指示）。
 * 既存の partners.phone / partner_phone_numbers と正規化後に重複しないものだけ追加。
 * fail-soft: 失敗してもリンク自体（POST/PUTの本処理）は止めない。
 */
export async function syncPartnerPhoneFromEntry(entryId: number, partnerId: number | null): Promise<void> {
  if (partnerId == null) return
  try {
    const [{ data: numbers }, { data: partner }, { data: existing }, { data: entry }] = await Promise.all([
      supabaseAdmin.from('phonebook_numbers').select('phone_raw').eq('entry_id', entryId),
      supabaseAdmin.from('partners').select('phone').eq('partner_no', partnerId).maybeSingle(),
      supabaseAdmin.from('partner_phone_numbers').select('phone').eq('partner_no', partnerId),
      supabaseAdmin.from('phonebook_entries').select('name').eq('id', entryId).maybeSingle(),
    ])
    const knownNorm = new Set<string>()
    if (partner?.phone) {
      const n = normalizePhone(partner.phone)
      if (n) knownNorm.add(n)
    }
    for (const r of (existing ?? []) as { phone: string }[]) {
      const n = normalizePhone(r.phone)
      if (n) knownNorm.add(n)
    }
    const toAdd: string[] = []
    for (const r of (numbers ?? []) as { phone_raw: string }[]) {
      const n = normalizePhone(r.phone_raw)
      if (!n || knownNorm.has(n)) continue
      knownNorm.add(n) // 同一リクエスト内の重複番号も間引く
      toAdd.push(r.phone_raw)
    }
    if (toAdd.length === 0) return
    const label = `電話帳連携: ${(entry?.name ?? '').trim()}`.trim()
    await supabaseAdmin.from('partner_phone_numbers').insert(
      toAdd.map(phone => ({ partner_no: partnerId, phone, label, source: 'phonebook_link' })),
    )
  } catch (e) {
    console.error('[phonebook] syncPartnerPhoneFromEntry失敗（fail-soft・リンク自体は成立済み）:', e)
  }
}
