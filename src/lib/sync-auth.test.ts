import { describe, it, expect } from 'vitest'
import { isValidSyncToken } from './sync-auth'

const T1 = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const T2 = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

describe('isValidSyncToken（fail-closed）', () => {
  it('正しいトークンは true', () => {
    expect(isValidSyncToken(`Bearer ${T1}`, T1)).toBe(true)
  })
  it('カンマ区切りの複数トークン（ローテーション併記）はどれでも true', () => {
    expect(isValidSyncToken(`Bearer ${T2}`, `${T1}, ${T2}`)).toBe(true)
    expect(isValidSyncToken(`Bearer ${T1}`, `${T1}, ${T2}`)).toBe(true)
  })
  it('誤トークン・長さ違いは false', () => {
    expect(isValidSyncToken(`Bearer ${T2}`, T1)).toBe(false)
    expect(isValidSyncToken('Bearer short', T1)).toBe(false)
  })
  it('ヘッダー欠落・Bearer以外は false', () => {
    expect(isValidSyncToken(null, T1)).toBe(false)
    expect(isValidSyncToken(T1, T1)).toBe(false)
    expect(isValidSyncToken(`Basic ${T1}`, T1)).toBe(false)
  })
  it('env 未設定・空は常に false（fail-closed）', () => {
    expect(isValidSyncToken(`Bearer ${T1}`, undefined)).toBe(false)
    expect(isValidSyncToken(`Bearer ${T1}`, '')).toBe(false)
    expect(isValidSyncToken('Bearer ', ' , ')).toBe(false)
  })
})
