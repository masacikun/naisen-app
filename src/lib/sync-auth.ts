// FreePBX 同期フィードの機械間認証（Bearer トークン・Slice 4）。
// - トークンは .env.local の SYNC_FEED_TOKENS（カンマ区切りで複数可＝無停止ローテーション用）
// - env 未設定・空は常に拒否（fail-closed）
// - 比較は timingSafeEqual による定数時間照合
import { timingSafeEqual } from 'crypto'

export function isValidSyncToken(
  authHeader: string | null,
  tokensEnv: string | undefined = process.env.SYNC_FEED_TOKENS,
): boolean {
  if (!authHeader?.startsWith('Bearer ')) return false
  const tokens = (tokensEnv ?? '').split(',').map(t => t.trim()).filter(Boolean)
  if (tokens.length === 0) return false
  const given = Buffer.from(authHeader.slice('Bearer '.length).trim())
  return tokens.some(t => {
    const expected = Buffer.from(t)
    return expected.length === given.length && timingSafeEqual(expected, given)
  })
}

/**
 * Bearer に加えて Basic も受ける認証（CID逆引き /api/sync/lookup 用）。
 * FreePBX cidlookup モジュールは user:pass の URL 埋め込み（=Basic）しか渡せないため、
 * Basic の password 部を SYNC_FEED_TOKENS と照合する（username は不問）。
 */
export function isValidSyncAuth(
  authHeader: string | null,
  tokensEnv: string | undefined = process.env.SYNC_FEED_TOKENS,
): boolean {
  if (!authHeader) return false
  if (authHeader.startsWith('Bearer ')) return isValidSyncToken(authHeader, tokensEnv)
  if (authHeader.startsWith('Basic ')) {
    let decoded: string
    try {
      decoded = Buffer.from(authHeader.slice('Basic '.length).trim(), 'base64').toString('utf8')
    } catch {
      return false
    }
    const sep = decoded.indexOf(':')
    if (sep < 0) return false
    const pass = decoded.slice(sep + 1)
    if (!pass) return false
    return isValidSyncToken(`Bearer ${pass}`, tokensEnv)
  }
  return false
}
