import { describe, it, expect } from 'vitest'
import { displayNameWithPrefix, toNumberKind, entryDisplayKind } from './display-name'

describe('displayNameWithPrefix', () => {
  it('extension → 内線)プレフィックス', () => {
    expect(displayNameWithPrefix('中村まさし', 'extension')).toBe('内線)中村まさし')
  })
  it('company_050 → 外線)プレフィックス', () => {
    expect(displayNameWithPrefix('小林昌義', 'company_050')).toBe('外線)小林昌義')
  })
  it('mobile → 携帯)プレフィックス', () => {
    expect(displayNameWithPrefix('小林昌義', 'mobile')).toBe('携帯)小林昌義')
  })
  it('ap → AP)プレフィックス', () => {
    expect(displayNameWithPrefix('田中花子', 'ap')).toBe('AP)田中花子')
  })
  it('external → 素の name', () => {
    expect(displayNameWithPrefix('昭南開発', 'external')).toBe('昭南開発')
  })
})

describe('toNumberKind', () => {
  it('新kind5種はそのまま', () => {
    expect(toNumberKind('extension')).toBe('extension')
    expect(toNumberKind('company_050')).toBe('company_050')
    expect(toNumberKind('mobile')).toBe('mobile')
    expect(toNumberKind('ap')).toBe('ap')
    expect(toNumberKind('external')).toBe('external')
  })
  it('旧 internal は company_050 に丸める（互換）', () => {
    expect(toNumberKind('internal')).toBe('company_050')
  })
  it('不明値・null は external', () => {
    expect(toNumberKind('garbage')).toBe('external')
    expect(toNumberKind(null)).toBe('external')
    expect(toNumberKind(undefined)).toBe('external')
  })
})

describe('entryDisplayKind（配信displayNameの代表kind）', () => {
  it('extension が最優先', () => {
    expect(entryDisplayKind(['company_050', 'extension'])).toBe('extension')
  })
  it('extension なしは company_050 → mobile → ap の順', () => {
    expect(entryDisplayKind(['mobile', 'company_050'])).toBe('company_050')
    expect(entryDisplayKind(['external', 'mobile'])).toBe('mobile')
    expect(entryDisplayKind(['external', 'ap'])).toBe('ap')
  })
  it('external のみ・空は external', () => {
    expect(entryDisplayKind(['external'])).toBe('external')
    expect(entryDisplayKind([])).toBe('external')
  })
})
