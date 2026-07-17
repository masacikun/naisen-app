import { describe, it, expect } from 'vitest'
import {
  resolveBookKeys,
  toDialable,
  toFeedEntries,
  buildAcrobitsJson,
  feedDisplayName,
  isNotModified,
  parseGroupsParam,
  type FeedEntryRow,
} from './phonebook-feed'

const num = (raw: string, normalized: string | null, kind = 'external', label: string | null = null) => ({
  phone_raw: raw,
  phone_normalized: normalized,
  label,
  kind,
})

const row = (id: number, name: string, over: Partial<FeedEntryRow> = {}): FeedEntryRow => ({
  id,
  name,
  furigana: null,
  blocked: false,
  active: true,
  updated_at: '2026-07-16T10:00:00+09:00',
  phonebook_numbers: [num('0921234567', '0921234567')],
  ...over,
})

describe('resolveBookKeys（?user= の購読解決）', () => {
  it('購読ありはその book_key 群（重複除去）', () => {
    expect(resolveBookKeys([{ book_key: 'honsha' }, { book_key: 'all' }, { book_key: 'honsha' }]))
      .toEqual(['honsha', 'all'])
  })
  it('購読0件・null は all へフォールバック', () => {
    expect(resolveBookKeys([])).toEqual(['all'])
    expect(resolveBookKeys(null)).toEqual(['all'])
    expect(resolveBookKeys(undefined)).toEqual(['all'])
  })
})

describe('toDialable（先頭0の国内表記・内線対応）', () => {
  it('phone_normalized があればそのまま', () => {
    expect(toDialable(num('092-123-4567', '0921234567'))).toBe('0921234567')
  })
  it('normalized=null の内線は raw の数字（全角も半角化）', () => {
    expect(toDialable(num('8001', null))).toBe('8001')
    expect(toDialable(num('内線８００１', null))).toBe('8001')
  })
  it('数字なしは null', () => {
    expect(toDialable(num('anonymous', null))).toBe(null)
  })
})

describe('toFeedEntries（除外規則）', () => {
  it('blocked=true（着信拒否）を除外する', () => {
    const out = toFeedEntries([row(1, 'A', { blocked: true }), row(2, 'B')])
    expect(out.map(e => e.id)).toEqual([2])
  })
  it('active=false（退職）を除外する', () => {
    const out = toFeedEntries([row(1, 'A', { active: false }), row(2, 'B')])
    expect(out.map(e => e.id)).toEqual([2])
  })
  it('ダイヤル可能な番号が0件の連絡先は出さない', () => {
    const out = toFeedEntries([row(1, 'A', { phonebook_numbers: [num('anonymous', null)] })])
    expect(out).toEqual([])
  })
  it('kind を番号ごとに保持し name は素のまま（旧 internal は company_050 に丸め）', () => {
    const out = toFeedEntries([
      row(1, '中村まさし', {
        phonebook_numbers: [num('8001', null, 'extension'), num('09011112222', '09011112222', 'internal')],
      }),
    ])
    expect(out[0].name).toBe('中村まさし')
    expect(out[0].numbers).toEqual([
      { dial: '8001', kind: 'extension', label: null },
      { dial: '09011112222', kind: 'company_050', label: null },
    ])
  })
})

describe('feedDisplayName（配信displayNameのkindプレフィックス）', () => {
  it('extension を含むエントリは 内線)名前', () => {
    const out = toFeedEntries([
      row(1, '中村 まさし', { phonebook_numbers: [num('7000', null, 'extension')] }),
    ])
    expect(feedDisplayName(out[0])).toBe('内線)中村 まさし')
  })
  it('extension + company_050 は extension 優先で 内線)', () => {
    const out = toFeedEntries([
      row(1, '小林 昌義', {
        phonebook_numbers: [num('7001', null, 'extension'), num('05053711023', '05053711023', 'company_050')],
      }),
    ])
    expect(feedDisplayName(out[0])).toBe('内線)小林 昌義')
  })
  it('company_050 のみは 外線)・mobile は 携帯)・ap は AP)', () => {
    const mk = (kind: string) =>
      toFeedEntries([row(1, 'X', { phonebook_numbers: [num('05011112222', '05011112222', kind)] })])[0]
    expect(feedDisplayName(mk('company_050'))).toBe('外線)X')
    expect(feedDisplayName(mk('mobile'))).toBe('携帯)X')
    expect(feedDisplayName(mk('ap'))).toBe('AP)X')
  })
  it('external のみはプレフィックスなし', () => {
    const out = toFeedEntries([row(1, '昭南開発')])
    expect(feedDisplayName(out[0])).toBe('昭南開発')
  })
})

describe('buildAcrobitsJson', () => {
  it('company に区分名を載せる（区分なしは空文字）', () => {
    const json = buildAcrobitsJson(
      toFeedEntries([
        row(1, '博多大和', { phonebook_categories: { name: '店舗' } }),
        row(2, '区分なし'),
      ]),
    )
    expect(json.contacts[0].company).toBe('店舗')
    expect(json.contacts[1].company).toBe('')
  })
  it('contactId は entry PK 文字列で一意・checksum は updated_at・phonetic はふりがな', () => {
    const json = buildAcrobitsJson(
      toFeedEntries([
        row(5, '中村まさし', { furigana: 'なかむらまさし' }),
        row(7, '昭南開発'),
      ]),
    )
    expect(json.contacts).toHaveLength(2)
    const ids = json.contacts.map(c => c.contactId)
    expect(ids).toEqual(['5', '7'])
    expect(new Set(ids).size).toBe(ids.length)
    expect(json.contacts[0].displayName).toBe('中村まさし')
    expect(json.contacts[0].fnamePhonetic).toBe('なかむらまさし')
    expect(json.contacts[0].lnamePhonetic).toBe('')
    expect(json.contacts[0].checksum).toBe('2026-07-16T10:00:00+09:00')
    expect(json.contacts[1].fnamePhonetic).toBe('')
  })
  it('contactEntries は番号ごとに entryId 連番・type=tel・label 既定 work', () => {
    const json = buildAcrobitsJson(
      toFeedEntries([
        row(1, 'A', {
          phonebook_numbers: [num('0921111111', '0921111111'), num('09022223333', '09022223333', 'external', '携帯')],
        }),
      ]),
    )
    expect(json.contacts[0].contactEntries).toEqual([
      { entryId: '0', label: 'work', type: 'tel', uri: '0921111111' },
      { entryId: '1', label: '携帯', type: 'tel', uri: '09022223333' },
    ])
  })
})

describe('isNotModified（If-Modified-Since / 304）', () => {
  const lm = new Date('2026-07-16T10:00:00.500Z') // ミリ秒は切り捨てて比較される
  it('同時刻（秒精度）・それ以降は 304', () => {
    expect(isNotModified('Thu, 16 Jul 2026 10:00:00 GMT', lm)).toBe(true)
    expect(isNotModified('Thu, 16 Jul 2026 10:05:00 GMT', lm)).toBe(true)
  })
  it('それ以前・ヘッダなし・不正日付は 200（false）', () => {
    expect(isNotModified('Thu, 16 Jul 2026 09:59:59 GMT', lm)).toBe(false)
    expect(isNotModified(null, lm)).toBe(false)
    expect(isNotModified('garbage', lm)).toBe(false)
  })
})

describe('parseGroupsParam（旧形式・テスト用オーバーライド）', () => {
  it('カンマ区切りをトリムして配列に', () => {
    expect(parseGroupsParam('ホテル, 拒否')).toEqual(['ホテル', '拒否'])
  })
  it('null・空は null', () => {
    expect(parseGroupsParam(null)).toBe(null)
    expect(parseGroupsParam('')).toBe(null)
    expect(parseGroupsParam(' , ')).toBe(null)
  })
})
