// CID逆引き（/api/sync/lookup）用の着信番号正規化（純関数・DB非依存）。
// 共通部品 phone.ts の確定仕様（Phase 0 承認・不可侵）はそのままに、
// 着信CID特有の変形（050→8150 等・国番号81が素で付く形）だけをここで吸収する。
import { normalizePhone } from './phone'

/**
 * 着信CIDを電話帳突合キーへ正規化する。
 * - 基本は normalizePhone（NFKC・記号除去・+81→0・内線3〜4桁とanonymous等は null）
 * - 素の「81…」（+なし国際表記）は 0 始まりへ変換。国内番号は必ず 0 始まりのため
 *   0 保持済みの番号（081x…）と衝突せず誤変換しない
 */
export function normalizeCidNumber(raw: string | null | undefined): string | null {
  if (!raw) return null
  const n = normalizePhone(raw)
  if (!n) return null
  if (/^81[1-9][0-9]{8,9}$/.test(n)) return '0' + n.slice(2)
  return n
}
