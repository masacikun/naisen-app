// フィード整形の単体テスト（合成値のみ）
import { describe, it, expect } from 'vitest'
import { buildContactItems, buildBlacklistItems, type FeedEntry } from './sync-feed'

const entry = (over: Partial<FeedEntry>): FeedEntry => ({
  id: 1, name: 'テスト', name_kana: null, group_name: null, memo: null, blocked: false,
  phonebook_numbers: [], ...over,
})

describe('buildContactItems', () => {
  it('blocked=false のみ・番号は normalized/raw/label で配信・番号0件も含む', () => {
    const items = buildContactItems([
      entry({ id: 1, name: '甲', group_name: 'G', phonebook_numbers: [
        { phone_raw: '03-1234-5678', phone_normalized: '0312345678', label: '代表' },
      ]}),
      entry({ id: 2, name: '乙(番号なし)' }),
      entry({ id: 3, name: '丙(拒否)', blocked: true, phonebook_numbers: [
        { phone_raw: '0120-000-000', phone_normalized: '0120000000', label: null },
      ]}),
    ])
    expect(items).toHaveLength(2)
    expect(items[0]).toEqual({
      id: 1, name: '甲', name_kana: null, group_name: 'G',
      numbers: [{ normalized: '0312345678', raw: '03-1234-5678', label: '代表' }],
    })
    expect(items[1].numbers).toEqual([])
  })
  it('normalized:null(内線等) も raw 付きで配信', () => {
    const items = buildContactItems([entry({ phonebook_numbers: [
      { phone_raw: '7005', phone_normalized: null, label: null },
    ]})])
    expect(items[0].numbers).toEqual([{ normalized: null, raw: '7005', label: null }])
  })
})

describe('buildBlacklistItems', () => {
  it('blocked=true を番号単位に展開・label=name（memoあれば付記）', () => {
    const items = buildBlacklistItems([
      entry({ id: 1, name: '迷惑A', memo: 'しつこい営業', blocked: true, phonebook_numbers: [
        { phone_raw: '050-1234-5678', phone_normalized: '05012345678', label: null },
        { phone_raw: '03-1234-5678', phone_normalized: '0312345678', label: null },
      ]}),
      entry({ id: 2, name: '通常', phonebook_numbers: [
        { phone_raw: '0120-000-000', phone_normalized: '0120000000', label: null },
      ]}),
    ])
    expect(items).toEqual([
      { number: '05012345678', label: '迷惑A（しつこい営業）' },
      { number: '0312345678', label: '迷惑A（しつこい営業）' },
    ])
  })
  it('normalized=null は除外・重複番号は先勝ち dedup', () => {
    const items = buildBlacklistItems([
      entry({ id: 1, name: '拒否A', blocked: true, phonebook_numbers: [
        { phone_raw: '7005', phone_normalized: null, label: null },
        { phone_raw: '090-1234-5678', phone_normalized: '09012345678', label: null },
      ]}),
      entry({ id: 2, name: '拒否B', blocked: true, phonebook_numbers: [
        { phone_raw: '09012345678', phone_normalized: '09012345678', label: null },
      ]}),
    ])
    expect(items).toEqual([{ number: '09012345678', label: '拒否A' }])
  })
})
