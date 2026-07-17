import { describe, it, expect } from 'vitest'
import { isValidSyncAuth, isValidSyncToken } from './sync-auth'

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

describe('isValidSyncAuth（Bearer + Basic）', () => {
  const basic = (user: string, pass: string) =>
    `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`

  it('Bearer は従来どおり true / false', () => {
    expect(isValidSyncAuth(`Bearer ${T1}`, T1)).toBe(true)
    expect(isValidSyncAuth(`Bearer ${T2}`, T1)).toBe(false)
  })
  it('Basic の password 部がトークン一致なら true（username は不問）', () => {
    expect(isValidSyncAuth(basic('naisen', T1), T1)).toBe(true)
    expect(isValidSyncAuth(basic('anything', T2), `${T1}, ${T2}`)).toBe(true)
  })
  it('Basic の password 不一致・空は false', () => {
    expect(isValidSyncAuth(basic('naisen', T2), T1)).toBe(false)
    expect(isValidSyncAuth(basic('naisen', ''), T1)).toBe(false)
  })
  it('コロン無し・base64 不正・ヘッダー欠落は false', () => {
    expect(isValidSyncAuth(`Basic ${Buffer.from('nocolon').toString('base64')}`, T1)).toBe(false)
    expect(isValidSyncAuth('Basic %%%%', T1)).toBe(false)
    expect(isValidSyncAuth(null, T1)).toBe(false)
  })
  it('env 未設定は常に false（fail-closed）', () => {
    expect(isValidSyncAuth(basic('naisen', T1), undefined)).toBe(false)
  })
})
