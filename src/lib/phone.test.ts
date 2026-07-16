// phone.ts 単体テスト（実番号禁止・明らかな合成値のみ使用）
import { describe, it, expect } from 'vitest'
import { normalizePhone, splitPhones, isExtension, isCanonicalJp, cleanCnam } from './phone'

describe('normalizePhone', () => {
  it('ハイフン除去（10桁）', () => {
    expect(normalizePhone('03-1234-5678')).toBe('0312345678')
  })
  it('全角→半角（11桁）', () => {
    expect(normalizePhone('０９０－１２３４－５６７８')).toBe('09012345678')
  })
  it('括弧・番号内スペース', () => {
    expect(normalizePhone('(03) 1234 5678')).toBe('0312345678')
  })
  it('TEL 等の文字除去', () => {
    expect(normalizePhone('TEL:03-1234-5678')).toBe('0312345678')
    expect(normalizePhone('℡03-1234-5678')).toBe('0312345678')
    expect(normalizePhone('Tel 03(1234)5678')).toBe('0312345678')
  })
  it('+81→0（国内番号の国際表記）', () => {
    expect(normalizePhone('+819012345678')).toBe('09012345678')
    expect(normalizePhone('+81-90-1234-5678')).toBe('09012345678')
  })
  it('他の国番号は変換しない（+のみ除去し数字は保持）', () => {
    expect(normalizePhone('+11234567890')).toBe('11234567890')
  })
  it('フリーダイヤル10桁・先頭0保持', () => {
    expect(normalizePhone('0120-000-000')).toBe('0120000000')
  })
  it('050番号・先頭0保持（11桁）', () => {
    expect(normalizePhone('050-1234-5678')).toBe('05012345678')
  })
  it('旧データの先頭0欠落は復元せずそのまま返す', () => {
    expect(normalizePhone('9012345678')).toBe('9012345678')
  })
  it('内線（旧3桁）は null', () => {
    expect(normalizePhone('200')).toBeNull()
  })
  it('内線（新4桁）は null', () => {
    expect(normalizePhone('7005')).toBeNull()
  })
  it('非通知は null', () => {
    expect(normalizePhone('anonymous')).toBeNull()
    expect(normalizePhone('Anonymous')).toBeNull()
  })
  it('空・空白のみは null', () => {
    expect(normalizePhone('')).toBeNull()
    expect(normalizePhone('　')).toBeNull()
    expect(normalizePhone('   ')).toBeNull()
  })
})

describe('splitPhones', () => {
  it('スラッシュ区切りで分割し原表記を保持', () => {
    expect(splitPhones('03-1234-5678 / 090-1234-5678')).toEqual([
      { raw: '03-1234-5678', normalized: '0312345678' },
      { raw: '090-1234-5678', normalized: '09012345678' },
    ])
  })
  it('読点・カンマ・セミコロン・改行でも分割', () => {
    expect(splitPhones('03-1234-5678、090-1234-5678')).toHaveLength(2)
    expect(splitPhones('03-1234-5678,090-1234-5678')).toHaveLength(2)
    expect(splitPhones('03-1234-5678;090-1234-5678')).toHaveLength(2)
    expect(splitPhones('03-1234-5678\n090-1234-5678')).toHaveLength(2)
  })
  it('番号内スペースでは分割しない（1件のまま）', () => {
    expect(splitPhones('03 1234 5678')).toEqual([
      { raw: '03 1234 5678', normalized: '0312345678' },
    ])
  })
  it('空要素は除外・正規化不能要素は normalized: null', () => {
    expect(splitPhones('03-1234-5678 / ')).toHaveLength(1)
    expect(splitPhones('anonymous / 03-1234-5678')).toEqual([
      { raw: 'anonymous', normalized: null },
      { raw: '03-1234-5678', normalized: '0312345678' },
    ])
  })
  it('空文字は空配列', () => {
    expect(splitPhones('')).toEqual([])
  })
})

describe('isExtension', () => {
  it('3桁・4桁は内線', () => {
    expect(isExtension('200')).toBe(true)
    expect(isExtension('7005')).toBe(true)
  })
  it('実番号・先頭0欠落・非数字は内線でない', () => {
    expect(isExtension('0312345678')).toBe(false)
    expect(isExtension('9012345678')).toBe(false)
    expect(isExtension('anonymous')).toBe(false)
    expect(isExtension('')).toBe(false)
  })
})

describe('isCanonicalJp', () => {
  it('0始まり10〜11桁のみ true', () => {
    expect(isCanonicalJp('0312345678')).toBe(true)
    expect(isCanonicalJp('09012345678')).toBe(true)
    expect(isCanonicalJp('9012345678')).toBe(false) // 先頭0欠落
    expect(isCanonicalJp('031234567')).toBe(false) // 9桁
    expect(isCanonicalJp('090123456789')).toBe(false) // 12桁
  })
})

describe('cleanCnam', () => {
  it('着信名称プレフィックス＋番号のみ → null（実名なし）', () => {
    expect(cleanCnam('水炊き大和|09000000000')).toBe(null)
    expect(cleanCnam('他|水炊き大和|09000000000')).toBe(null)
    expect(cleanCnam('予約|0300000000')).toBe(null)
  })
  it('番号そのもの・空 → null', () => {
    expect(cleanCnam('09000000000')).toBe(null)
    expect(cleanCnam('090-0000-0000')).toBe(null)
    expect(cleanCnam('')).toBe(null)
    expect(cleanCnam(null)).toBe(null)
    expect(cleanCnam('||')).toBe(null)
  })
  it('プレフィックス付きの実名 → 実名のみ', () => {
    expect(cleanCnam('水炊き大和|YAMADA TARO')).toBe('YAMADA TARO')
  })
  it('プレフィックスなしの実名はそのまま', () => {
    expect(cleanCnam('YAMADA TARO')).toBe('YAMADA TARO')
    expect(cleanCnam('anonymous')).toBe('anonymous')
  })
})
