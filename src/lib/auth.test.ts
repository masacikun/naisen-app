import { describe, it, expect } from 'vitest'
import { isAdminHeaders } from './auth'

describe('isAdminHeaders（fail-closed）', () => {
  it('x-auth-role: admin のみ true', () => {
    expect(isAdminHeaders(new Headers({ 'x-auth-role': 'admin' }))).toBe(true)
  })
  it('user は false', () => {
    expect(isAdminHeaders(new Headers({ 'x-auth-role': 'user' }))).toBe(false)
  })
  it('ヘッダー欠落は false（fail-closed）', () => {
    expect(isAdminHeaders(new Headers())).toBe(false)
  })
  it('空文字・大文字値は false', () => {
    expect(isAdminHeaders(new Headers({ 'x-auth-role': '' }))).toBe(false)
    expect(isAdminHeaders(new Headers({ 'x-auth-role': 'Admin' }))).toBe(false)
  })
})
