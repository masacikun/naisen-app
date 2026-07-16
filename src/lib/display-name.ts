// 表示名プレフィックス 共通ロジック（§②配信・§①着信逆引き /lookup で共用する単一部品）。
// 番号の kind で決定する: extension=「内線)」/ internal=「社内)」/ external=素の name。
// 着信表示は「着信してきた番号の kind」で切り替える（内線から掛かれば〈内線)◯◯〉）。
// 配信フィードの displayName は素の name（端末リスト表示用・プレフィックスなし）。

export type NumberKind = 'extension' | 'internal' | 'external'

/** kind → 表示名（着信名 CALLERID / lookup 用） */
export function displayNameWithPrefix(name: string, kind: NumberKind): string {
  switch (kind) {
    case 'extension':
      return `内線)${name}`
    case 'internal':
      return `社内)${name}`
    default:
      return name
  }
}

/** DB の kind 文字列（不正値含む）を NumberKind に丸める（不明は external） */
export function toNumberKind(kind: string | null | undefined): NumberKind {
  return kind === 'extension' || kind === 'internal' ? kind : 'external'
}
