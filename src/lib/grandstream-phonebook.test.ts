import { describe, it, expect } from 'vitest'
import { escapeXml, buildGrandstreamXml, isValidBasicAuth, type PhonebookEntry } from './grandstream-phonebook'

const basic = (u: string, p: string) => 'Basic ' + Buffer.from(`${u}:${p}`).toString('base64')

describe('escapeXml', () => {
  it('5種の特殊文字をエスケープする', () => {
    expect(escapeXml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&apos;')
  })
  it('日本語はそのまま', () => {
    expect(escapeXml('山田＆田中')).toBe('山田＆田中')
  })
})

describe('buildGrandstreamXml', () => {
  const entry = (id: number, name: string, nums: (string | null)[]): PhonebookEntry => ({
    id,
    name,
    phonebook_numbers: nums.map(n => ({ phone_raw: n ?? '', phone_normalized: n, label: null })),
  })

  it('AddressBook/version/Contact 構造を生成する', () => {
    const xml = buildGrandstreamXml([entry(5, '中村まさし', ['09074555000'])])
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(xml).toContain('<AddressBook>')
    expect(xml).toContain('<version>1</version>')
    expect(xml).toContain('<id>5</id>')
    expect(xml).toContain('<FirstName>中村まさし</FirstName>')
    expect(xml).toContain('<phonenumber>09074555000</phonenumber>')
    expect(xml).toContain('<accountindex>0</accountindex>')
    expect(xml.trim().endsWith('</AddressBook>')).toBe(true)
  })

  it('複数番号は同一 Contact 内に Phone を複数出す', () => {
    const xml = buildGrandstreamXml([entry(1, 'A', ['0921111111', '0922222222'])])
    expect(xml.match(/<Contact>/g)).toHaveLength(1)
    expect(xml.match(/<Phone type="Work">/g)).toHaveLength(2)
  })

  it('normalized=null の番号は除外・番号0件の連絡先は出力しない', () => {
    const xml = buildGrandstreamXml([entry(1, 'A', [null]), entry(2, 'B', ['0921234567', null])])
    expect(xml).not.toContain('<id>1</id>')
    expect(xml.match(/<phonenumber>/g)).toHaveLength(1)
  })

  it('名前の XML 特殊文字をエスケープする', () => {
    const xml = buildGrandstreamXml([entry(1, 'A&B <商事>', ['0921234567'])])
    expect(xml).toContain('<FirstName>A&amp;B &lt;商事&gt;</FirstName>')
  })
})

describe('isValidBasicAuth', () => {
  it('env 両方未設定なら素通し', () => {
    expect(isValidBasicAuth(null, undefined, undefined)).toBe(true)
  })
  it('設定済み・一致で許可', () => {
    expect(isValidBasicAuth(basic('u1', 'p1'), 'u1', 'p1')).toBe(true)
  })
  it('設定済み・ヘッダなし/不一致/形式不正は拒否', () => {
    expect(isValidBasicAuth(null, 'u1', 'p1')).toBe(false)
    expect(isValidBasicAuth(basic('u1', 'wrong'), 'u1', 'p1')).toBe(false)
    expect(isValidBasicAuth('Bearer xxx', 'u1', 'p1')).toBe(false)
    expect(isValidBasicAuth('Basic %%%', 'u1', 'p1')).toBe(false)
  })
  it('片方だけ設定でも fail-closed（素通しにならない）', () => {
    expect(isValidBasicAuth(null, 'u1', undefined)).toBe(false)
    expect(isValidBasicAuth(basic('u1', ''), 'u1', undefined)).toBe(true)
  })
})
