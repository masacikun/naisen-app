// 電話番号正規化 共通部品（電話帳・ブラックリスト・CDR照合で共通利用する単一部品）
// 純関数・副作用なし・外部依存なし。DB / UI には触れない。
//
// 確定仕様（2026-07-13 Phase 0 承認）:
// - 全角→半角（NFKC）。ハイフン・スペース・タブ・括弧・「TEL」「℡」等を除去し数字のみ
// - +81 は 0 へ変換（国内番号の国際表記）。他の国番号変換はしない
// - 内線（数字3〜4桁: 旧PBX 3桁＋FreePBX 4桁）は正規化対象外 → null
// - 突合キー＝正規化後の数字列の完全一致。原表記は呼び出し側で別に保持
// - 桁数が非標準（先頭0欠落の旧データ等）でも破棄も復元もせず数字列のまま返す

export interface SplitPhone {
  raw: string
  normalized: string | null
}

// 複数番号の区切り: / 、 , ; 改行（全角の ／ ， ； を含む）
// スペースは番号内区切り（例: 03 1234 5678）と衝突するため区切りにしない
const SEPARATORS = /[/／、,，;；\r\n]+/

/** 数字と + 以外を除去した文字列を返す（NFKC で全角→半角済み） */
function toDigitsAndPlus(raw: string): string {
  return raw.normalize('NFKC').replace(/[^0-9+]/g, '')
}

/**
 * 電話番号を突合キー（数字のみの文字列）へ正規化する。
 * 内線（3〜4桁）・数字なし（anonymous / 空文字 等）は null。
 */
export function normalizePhone(raw: string): string | null {
  if (!raw) return null
  let s = toDigitsAndPlus(raw.trim())
  if (s.startsWith('+81')) s = '0' + s.slice(3)
  s = s.replace(/\+/g, '')
  if (!s) return null
  if (s.length === 3 || s.length === 4) return null // 内線は対象外
  return s
}

/**
 * 複数番号が詰め込まれたフィールドを分割し、各要素を正規化して返す。
 * 分割は normalize より先に行う（先に記号除去すると番号が連結されるため）。
 */
export function splitPhones(raw: string): SplitPhone[] {
  if (!raw) return []
  return raw
    .split(SEPARATORS)
    .map(part => part.trim())
    .filter(part => part.length > 0)
    .map(part => ({ raw: part, normalized: normalizePhone(part) }))
}

/** 内線番号か（数字抽出後の長さが 3 または 4）。正規化対象外の判定に使う。 */
export function isExtension(raw: string): boolean {
  if (!raw) return false
  const digits = toDigitsAndPlus(raw).replace(/\+/g, '')
  return digits.length === 3 || digits.length === 4
}

/**
 * 正規化済みの数字列が国内の標準形（0始まり10〜11桁）かを返す。
 * 表示制御用ヘルパー。復元はしない（先頭0欠落の旧データは false のまま扱う）。
 */
export function isCanonicalJp(normalized: string): boolean {
  return /^0[0-9]{9,10}$/.test(normalized)
}
