import { describe, it, expect } from 'vitest'
import { kataToHira } from './kana'

describe('kataToHira', () => {
  it('カタカナをひらがなへ（長音・記号は温存）', () => {
    expect(kataToHira('ハウステンボス')).toBe('はうすてんぼす')
    expect(kataToHira('コーヒー')).toBe('こーひー')
    expect(kataToHira('しょうなんかいはつ_にしじんゴミ')).toBe('しょうなんかいはつ_にしじんごみ')
  })
  it('ひらがな・英数はそのまま', () => {
    expect(kataToHira('やまだたろう ABC 123')).toBe('やまだたろう ABC 123')
  })
})
