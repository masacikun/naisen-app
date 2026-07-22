// 突合ロジックと番号入力パースの単体テスト（実番号禁止・合成値のみ）
import { describe, it, expect } from 'vitest'
import { buildNameMap, parseNumbersInput, buildNumberRows } from './phonebook-match'

const noMaster = { partners: [], employees: [] }

describe('buildNameMap', () => {
  it('電話帳ヒット（entryId・note 付き）', () => {
    const map = buildNameMap(
      ['0312345678'],
      [{ phone_normalized: '0312345678', entry: { id: 1, name: 'テスト商店', memo: '得意先' } }],
      noMaster.partners, noMaster.employees,
    )
    expect(map.get('0312345678')).toEqual({
      name: 'テスト商店', source: '電話帳', entryId: 1, note: '得意先', blocked: false, group: null, categoryKey: null, numberKind: null,
    })
  })

  it('電話帳ヒットはヒット番号の kind が numberKind に伝播（/lookup プレフィックス用）', () => {
    const map = buildNameMap(
      ['09012345678'],
      [{ phone_normalized: '09012345678', kind: 'internal', entry: { id: 1, name: '社用携帯', memo: null } }],
      noMaster.partners, noMaster.employees,
    )
    expect(map.get('09012345678')).toMatchObject({ name: '社用携帯', numberKind: 'internal' })
  })

  it('blocked が伝播し、多重ヒットは最小 entry_id が決定的に勝つ', () => {
    const rows = [
      { phone_normalized: '0312345678', entry: { id: 9, name: '後勝ち候補', memo: null, blocked: false } },
      { phone_normalized: '0312345678', entry: { id: 3, name: '最小ID', memo: null, blocked: true } },
      { phone_normalized: '0312345678', entry: { id: 7, name: '中間', memo: null, blocked: false } },
    ]
    const map = buildNameMap(['0312345678'], rows, [], [])
    expect(map.get('0312345678')).toMatchObject({ name: '最小ID', entryId: 3, blocked: true })
  })

  it('電話帳が主・master はフォールバック（同一番号なら電話帳が勝つ）', () => {
    const map = buildNameMap(
      ['0312345678'],
      [{ phone_normalized: '0312345678', entry: { id: 1, name: '電話帳名', memo: null } }],
      [{ partner_no: 9, partner_name: '取引先名', phone: '03-1234-5678' }],
      [{ name: '従業員名', phone_landline: '03-1234-5678' }],
    )
    expect(map.get('0312345678')?.name).toBe('電話帳名')
    expect(map.get('0312345678')?.source).toBe('電話帳')
  })

  it('partner_id リンク済み電話帳エントリは partnerName が付く', () => {
    const map = buildNameMap(
      ['0312345678'],
      [{ phone_normalized: '0312345678', entry: { id: 1, name: '電話帳名', memo: null, partner_id: 9 } }],
      [{ partner_no: 9, partner_name: '取引先名', phone: null }],
      [],
    )
    expect(map.get('0312345678')).toMatchObject({ name: '電話帳名', source: '電話帳', partnerName: '取引先名' })
  })

  it('名刺フォールバック: 会社+氏名で表示・tel と mobile 両方が突合キー', () => {
    const map = buildNameMap(
      ['0312345678', '09012345678'],
      [], [], [],
      [{ name: 'テスト太郎', company: 'テスト商事', tel: '03-1234-5678', mobile: '090-1234-5678' }],
    )
    expect(map.get('0312345678')).toEqual({ name: 'テスト商事 テスト太郎', source: '名刺' })
    expect(map.get('09012345678')).toEqual({ name: 'テスト商事 テスト太郎', source: '名刺' })
  })

  it('優先順位: 電話帳 ＞ 名刺 ＞ 取引先（同一番号）', () => {
    const meishi = [{ name: '名刺氏名', company: null, tel: '03-1234-5678', mobile: null }]
    const partner = [{ partner_no: 1, partner_name: '取引先名', phone: '03-1234-5678' }]
    const withPb = buildNameMap(
      ['0312345678'],
      [{ phone_normalized: '0312345678', entry: { id: 1, name: '電話帳名', memo: null } }],
      partner, [], meishi,
    )
    expect(withPb.get('0312345678')?.source).toBe('電話帳')
    const noPb = buildNameMap(['0312345678'], [], partner, [], meishi)
    expect(noPb.get('0312345678')).toEqual({ name: '名刺氏名', source: '名刺' })
  })

  it('master フォールバック: ハイフン付き保持形式でも正規化して突合（取引先＞従業員）', () => {
    const map = buildNameMap(
      ['0312345678', '09012345678'],
      [],
      [{ partner_no: 9, partner_name: '取引先名', phone: '03-1234-5678' }],
      [
        { name: '従業員A', phone_landline: '03-1234-5678' },   // 取引先と同番号→取引先が勝つ
        { name: '従業員B', phone_landline: '090-1234-5678' },
      ],
    )
    expect(map.get('0312345678')).toEqual({ name: '取引先名', source: '取引先', partnerNo: 9 })
    expect(map.get('09012345678')).toEqual({ name: '従業員B', source: '従業員' })
  })

  it('内線(3-4桁)・非通知 caller は突合しない', () => {
    const map = buildNameMap(
      ['200', '7005', 'anonymous', ''],
      [{ phone_normalized: '200', entry: { id: 1, name: 'X', memo: null } }],
      noMaster.partners, noMaster.employees,
    )
    expect(map.size).toBe(0)
  })

  it('未ヒット caller は Map に含めない', () => {
    const map = buildNameMap(['0509876543', '0312345678'],
      [{ phone_normalized: '0312345678', entry: { id: 2, name: 'A', memo: null } }],
      noMaster.partners, noMaster.employees,
    )
    expect(map.has('0509876543')).toBe(false)
    expect(map.has('0312345678')).toBe(true)
  })
})

describe('parseNumbersInput', () => {
  it('複数番号の詰め込みを分割して正規化', () => {
    expect(parseNumbersInput('03-1234-5678 / 090-1234-5678')).toEqual([
      { phone_raw: '03-1234-5678', phone_normalized: '0312345678' },
      { phone_raw: '090-1234-5678', phone_normalized: '09012345678' },
    ])
  })
  it('配列入力も可・内線は raw 保持で normalized は null', () => {
    expect(parseNumbersInput(['03-1234-5678', '7005'])).toEqual([
      { phone_raw: '03-1234-5678', phone_normalized: '0312345678' },
      { phone_raw: '7005', phone_normalized: null },
    ])
  })
  it('空は空配列', () => {
    expect(parseNumbersInput('')).toEqual([])
    expect(parseNumbersInput(null)).toEqual([])
    expect(parseNumbersInput(undefined)).toEqual([])
  })
})

describe('buildNumberRows', () => {
  it('{raw,label} 入力→ insert 行（1入力の複数番号にも label を引き継ぐ）', () => {
    expect(buildNumberRows([{ raw: '03-1234-5678、090-1234-5678', label: '代表' }], 5)).toEqual([
      { phone_raw: '03-1234-5678', phone_normalized: '0312345678', label: '代表', kind: 'external', entry_id: 5 },
      { phone_raw: '090-1234-5678', phone_normalized: '09012345678', label: '代表', kind: 'external', entry_id: 5 },
    ])
  })
  it('文字列入力は label null', () => {
    expect(buildNumberRows('0120-000-000', 7)).toEqual([
      { phone_raw: '0120-000-000', phone_normalized: '0120000000', label: null, kind: 'external', entry_id: 7 },
    ])
  })
  it('kind を指定すれば保持・旧 internal は company_050・不正値は external に丸める', () => {
    expect(buildNumberRows([{ raw: '8001', kind: 'extension' }], 1)[0].kind).toBe('extension')
    expect(buildNumberRows([{ raw: '050-1111-2222', kind: 'company_050' }], 1)[0].kind).toBe('company_050')
    expect(buildNumberRows([{ raw: '090-1111-2222', kind: 'mobile' }], 1)[0].kind).toBe('mobile')
    expect(buildNumberRows([{ raw: '090-1111-2222', kind: 'ap' }], 1)[0].kind).toBe('ap')
    expect(buildNumberRows([{ raw: '090-1111-2222', kind: 'internal' }], 1)[0].kind).toBe('company_050')
    expect(buildNumberRows([{ raw: '090-1111-2222', kind: 'bogus' }], 1)[0].kind).toBe('external')
  })
})
