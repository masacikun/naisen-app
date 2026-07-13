// 取込ロジックの最小テスト（合成データのみ・実CSVは使わない）
import { describe, it, expect } from 'vitest'
import { parseCsv, parseAddressbook } from './addressbook-import'

const HEADER = '名前,カナ,電話番号,短縮番号,グループ,着信拒否,メモ'

describe('parseCsv', () => {
  it('引用符内の改行を1フィールドとして保持', () => {
    const rows = parseCsv('a,b\n"1\n2",c\n')
    expect(rows).toEqual([['a', 'b'], ['1\n2', 'c']])
  })
  it('エスケープ("")とBOMを処理', () => {
    expect(parseCsv('﻿"a""b",c')).toEqual([['a"b', 'c']])
  })
})

describe('parseAddressbook', () => {
  it('通常行＋blocked＋空列のNULL化', () => {
    const csv = `${HEADER}\n甲テスト商店,,03-1234-5678,,仕入先,0,テストメモ\n乙迷惑テスト,,050-1234-5678,,,1,\n`
    const r = parseAddressbook(csv)
    expect(r.entries).toHaveLength(2)
    expect(r.entries[0]).toMatchObject({
      name: '甲テスト商店', name_kana: null, group_name: '仕入先', memo: 'テストメモ', blocked: false,
      numbers: [{ phone_raw: '03-1234-5678', phone_normalized: '0312345678' }],
    })
    expect(r.entries[1].blocked).toBe(true)
    expect(r.blockedCount).toBe(1)
    expect(r.numberCount).toBe(2)
  })
  it('引用符内改行の複数番号を分割', () => {
    const csv = `${HEADER}\n丙テスト,,"03-1234-5678\n090-1234-5678",,,0,\n`
    const r = parseAddressbook(csv)
    expect(r.entries[0].numbers).toEqual([
      { phone_raw: '03-1234-5678', phone_normalized: '0312345678' },
      { phone_raw: '090-1234-5678', phone_normalized: '09012345678' },
    ])
    expect(r.numberCount).toBe(2)
  })
  it('内線(4桁)は raw 保持・normalized null で統計に計上', () => {
    const csv = `${HEADER}\n丁テスト,,7005,,,0,\n`
    const r = parseAddressbook(csv)
    expect(r.entries[0].numbers).toEqual([{ phone_raw: '7005', phone_normalized: null }])
    expect(r.nullNormalizedCount).toBe(1)
  })
  it('名前も番号も無い行はスキップ計上', () => {
    const csv = `${HEADER}\n,,,,,0,\n戊テスト,,0120-000-000,,,0,\n`
    const r = parseAddressbook(csv)
    expect(r.entries).toHaveLength(1)
    expect(r.skippedRows).toBe(1)
  })
  it('ヘッダー不一致はエラー', () => {
    expect(() => parseAddressbook('a,b,c\n1,2,3')).toThrow()
  })
})
