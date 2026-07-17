import { describe, it, expect } from 'vitest'
import { normalizeCidNumber } from './cid-lookup'

describe('normalizeCidNumber（着信CID→突合キー）', () => {
  it('国内表記（楽天CDR実績形）はそのまま', () => {
    expect(normalizeCidNumber('09074555000')).toBe('09074555000')
    expect(normalizeCidNumber('0921234567')).toBe('0921234567')
  })
  it('ハイフン・空白は除去', () => {
    expect(normalizeCidNumber('090-7455-5000')).toBe('09074555000')
    expect(normalizeCidNumber('03 1234 5678')).toBe('0312345678')
  })
  it('+81 → 0（normalizePhone 由来）', () => {
    expect(normalizeCidNumber('+819074555000')).toBe('09074555000')
    expect(normalizeCidNumber('+81 90 7455 5000')).toBe('09074555000')
  })
  it('素の 81（+なし国際表記）→ 0', () => {
    expect(normalizeCidNumber('819074555000')).toBe('09074555000')
    expect(normalizeCidNumber('81312345678')).toBe('0312345678')
  })
  it('0 始まりの 081x 局番は誤変換しない', () => {
    expect(normalizeCidNumber('0812345678')).toBe('0812345678')
  })
  it('内線（3〜4桁）・非通知・空は null', () => {
    expect(normalizeCidNumber('1034')).toBeNull()
    expect(normalizeCidNumber('anonymous')).toBeNull()
    expect(normalizeCidNumber('')).toBeNull()
    expect(normalizeCidNumber(null)).toBeNull()
    expect(normalizeCidNumber(undefined)).toBeNull()
  })
})
