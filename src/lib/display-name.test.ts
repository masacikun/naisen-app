import { describe, it, expect } from 'vitest'
import { displayNameWithPrefix, toNumberKind } from './display-name'

describe('displayNameWithPrefix', () => {
  it('extension → 内線)プレフィックス', () => {
    expect(displayNameWithPrefix('中村まさし', 'extension')).toBe('内線)中村まさし')
  })
  it('internal → 社内)プレフィックス', () => {
    expect(displayNameWithPrefix('中村まさし', 'internal')).toBe('社内)中村まさし')
  })
  it('external → 素の name', () => {
    expect(displayNameWithPrefix('昭南開発', 'external')).toBe('昭南開発')
  })
})

describe('toNumberKind', () => {
  it('extension / internal はそのまま', () => {
    expect(toNumberKind('extension')).toBe('extension')
    expect(toNumberKind('internal')).toBe('internal')
  })
  it('external・不明値・null は external', () => {
    expect(toNumberKind('external')).toBe('external')
    expect(toNumberKind('garbage')).toBe('external')
    expect(toNumberKind(null)).toBe('external')
    expect(toNumberKind(undefined)).toBe('external')
  })
})
