// 表示名プレフィックス 共通ロジック（§②配信・§①着信逆引き /lookup で共用する単一部品）。
// 番号の kind で決定する:
//   extension(SIP内線)=「内線)」/ company_050(社員の050外線)=「外線)」/
//   mobile(社員の携帯)=「携帯)」/ ap(アルバイトの外線)=「AP)」/ external(取引先など)=素の name。
// 着信表示は「着信してきた番号の kind」で切り替える（050直通から掛かれば〈外線)◯◯〉）。
// 配信フィードの displayName は entryDisplayKind（エントリ内番号の優先 kind）で付与する。

export type NumberKind = 'extension' | 'company_050' | 'mobile' | 'ap' | 'external'

const PREFIX: Record<NumberKind, string> = {
  extension: '内線)',
  company_050: '外線)',
  mobile: '携帯)',
  ap: 'AP)',
  external: '',
}

/** kind → 表示名（着信名 CALLERID / lookup / 配信 displayName 用） */
export function displayNameWithPrefix(name: string, kind: NumberKind): string {
  return `${PREFIX[kind]}${name}`
}

/** DB の kind 文字列（不正値・旧値含む）を NumberKind に丸める（旧 internal は company_050・不明は external） */
export function toNumberKind(kind: string | null | undefined): NumberKind {
  if (kind === 'extension' || kind === 'company_050' || kind === 'mobile' || kind === 'ap') return kind
  if (kind === 'internal') return 'company_050' // 2026-07-18 kind拡張前の旧値（互換）
  return 'external'
}

// エントリ（連絡先）は複数番号を持てるため、配信 displayName のプレフィックスは優先順で1つに決める
const ENTRY_KIND_PRIORITY: NumberKind[] = ['extension', 'company_050', 'mobile', 'ap']

/** エントリ内の番号 kind 群 → 配信 displayName に使う代表 kind */
export function entryDisplayKind(kinds: NumberKind[]): NumberKind {
  for (const k of ENTRY_KIND_PRIORITY) if (kinds.includes(k)) return k
  return 'external'
}
