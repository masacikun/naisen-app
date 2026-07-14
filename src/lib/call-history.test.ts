// 最終着信 集約ロジックの単体テスト（合成値のみ）
import { describe, it, expect } from 'vitest'
import { latestByCaller, entryLastCall } from './call-history'

describe('latestByCaller', () => {
  it('caller ごとに最新の started_at を残す', () => {
    const map = latestByCaller([
      { caller: '0312345678', started_at: '2026-05-01T00:00:00Z' },
      { caller: '0312345678', started_at: '2026-05-10T00:00:00Z' },
      { caller: '09012345678', started_at: '2026-04-01T00:00:00Z' },
    ])
    expect(map.get('0312345678')).toBe('2026-05-10T00:00:00Z')
    expect(map.get('09012345678')).toBe('2026-04-01T00:00:00Z')
  })
  it('空 caller・空 started_at は無視', () => {
    const map = latestByCaller([{ caller: '', started_at: '2026-05-01T00:00:00Z' }])
    expect(map.size).toBe(0)
  })
})

describe('entryLastCall', () => {
  const byCaller = new Map([
    ['0312345678', '2026-05-01T00:00:00Z'],
    ['09012345678', '2026-06-01T00:00:00Z'],
  ])
  it('複数番号は最大値へ集約', () => {
    expect(entryLastCall(
      [{ phone_normalized: '0312345678' }, { phone_normalized: '09012345678' }],
      byCaller,
    )).toBe('2026-06-01T00:00:00Z')
  })
  it('未ヒット・null番号のみは null', () => {
    expect(entryLastCall([{ phone_normalized: '0120000000' }], byCaller)).toBeNull()
    expect(entryLastCall([{ phone_normalized: null }], byCaller)).toBeNull()
    expect(entryLastCall([], byCaller)).toBeNull()
  })
})
