// 電話帳・master(取引先/従業員)による着信相手名解決（サーバ専用・DB接続あり）。
// 純ロジックは phonebook-match.ts に分離（そちらは単体テスト対象）。
import { supabaseAdmin } from './supabase-admin'
import { normalizePhone } from './phone'
import {
  buildNameMap,
  type ResolvedName,
  type PhonebookMatchRow,
  type PartnerRow,
} from './phonebook-match'

export type { ResolvedName } from './phonebook-match'

// .in() は GET のクエリ文字列になるため URL 長対策でチャンク分割
const IN_CHUNK = 100

type RawPbRow = {
  phone_normalized: string | null
  phonebook_entries:
    | { id: number; name: string; memo: string | null; blocked?: boolean }
    | { id: number; name: string; memo: string | null; blocked?: boolean }[]
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
      .select('phone_normalized, phonebook_entries(id,name,memo,blocked)')
      .in('phone_normalized', norms.slice(i, i + IN_CHUNK))
    for (const r of (data ?? []) as RawPbRow[]) {
      const e = Array.isArray(r.phonebook_entries) ? r.phonebook_entries[0] : r.phonebook_entries
      if (e) pbRows.push({ phone_normalized: r.phone_normalized, entry: e })
    }
  }

  // master フォールバック: 小規模テーブルのため全件取得し、正規化はコード側で行う
  const [{ data: partners }, { data: employees }] = await Promise.all([
    supabaseAdmin
      .from('partners')
      .select('partner_no,partner_name,phone')
      .eq('is_deleted', false)
      .not('phone', 'is', null),
    supabaseAdmin
      .from('employees')
      .select('last_name,first_name,phone_landline')
      .not('phone_landline', 'is', null),
  ])

  const employeeRows = ((employees ?? []) as {
    last_name: string | null; first_name: string | null; phone_landline: string | null
  }[]).map(e => ({
    name: [e.last_name, e.first_name].filter(Boolean).join(' '),
    phone_landline: e.phone_landline,
  }))

  return buildNameMap(uniq, pbRows, (partners ?? []) as PartnerRow[], employeeRows)
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
