import { describe, it, expect } from 'vitest'
import { filterByView, blockedTogglePatch } from './phonebook-view'

const entries = [
  { id: 1, blocked: false },
  { id: 2, blocked: true },
  { id: 3, blocked: false },
]

describe('filterByView（一覧フィルタ）', () => {
  it('連絡先(normal)は blocked=false のみ', () => {
    expect(filterByView(entries, 'normal').map(e => e.id)).toEqual([1, 3])
  })
  it('ブラックリスト(blocked)は blocked=true のみ', () => {
    expect(filterByView(entries, 'blocked').map(e => e.id)).toEqual([2])
  })
  it('all はすべて', () => {
    expect(filterByView(entries, 'all').map(e => e.id)).toEqual([1, 2, 3])
  })
})

describe('blockedTogglePatch（相互移動）', () => {
  it('連絡先→BL追加（blocked=true）', () => {
    expect(blockedTogglePatch({ blocked: false })).toEqual({ blocked: true })
  })
  it('BL解除→連絡先へ（blocked=false）', () => {
    expect(blockedTogglePatch({ blocked: true })).toEqual({ blocked: false })
  })
  it('blocked 以外のキーを含まない（区分・掲載・番号は現状維持）', () => {
    expect(Object.keys(blockedTogglePatch({ blocked: true }))).toEqual(['blocked'])
  })
})
