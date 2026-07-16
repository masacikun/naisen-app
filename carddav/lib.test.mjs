import { describe, expect, it } from 'vitest'
import {
  buildVcard, checkBasicAuth, collectionResponse, ctagOf, escapeVcard, etagOf,
  multistatus, parseDotEnv, parseMultigetHrefs, toRev,
} from './lib.mjs'

const contact = {
  contactId: '42',
  displayName: '山田 太郎',
  fnamePhonetic: 'やまだ たろう',
  lnamePhonetic: '',
  contactEntries: [
    { entryId: '0', label: '代表', type: 'tel', uri: '0921234567' },
    { entryId: '1', label: 'work', type: 'tel', uri: '7001' },
  ],
  checksum: '2026-07-17T01:23:45.000Z',
}

describe('buildVcard', () => {
  const v = buildVcard(contact)
  it('vCard 3.0 の基本構造と CRLF', () => {
    expect(v.startsWith('BEGIN:VCARD\r\nVERSION:3.0\r\n')).toBe(true)
    expect(v.endsWith('END:VCARD\r\n')).toBe(true)
    expect(v).toContain('UID:bantosan-42')
    expect(v).toContain('FN:山田 太郎')
  })
  it('ふりがなを X-PHONETIC-* と SORT-STRING に載せる', () => {
    expect(v).toContain('X-PHONETIC-FIRST-NAME:やまだ たろう')
    expect(v).toContain('X-PHONETIC-LAST-NAME:やまだ たろう')
    expect(v).toContain('SORT-STRING:やまだ たろう')
  })
  it('番号は内線含め全件 TEL に', () => {
    expect(v).toContain(':0921234567')
    expect(v).toContain(':7001')
  })
  it('REV は基本形式へ変換', () => {
    expect(v).toContain('REV:20260717T012345Z')
  })
  it('ふりがな無しなら phonetic 行を出さない', () => {
    const v2 = buildVcard({ ...contact, fnamePhonetic: '' })
    expect(v2).not.toContain('X-PHONETIC')
    expect(v2).not.toContain('SORT-STRING')
  })
})

describe('escape/rev', () => {
  it('escapeVcard は ; , \\ 改行を潰す', () => {
    expect(escapeVcard('a;b,c\\d\ne')).toBe('a\\;b\\,c\\\\d\\ne')
  })
  it('toRev は不正日時で null', () => {
    expect(toRev('not-a-date')).toBeNull()
  })
})

describe('etag/ctag', () => {
  it('etag は checksum に追随し quoted', () => {
    const a = etagOf(contact)
    expect(a).toMatch(/^"[0-9a-f]{16}"$/)
    expect(etagOf({ ...contact, checksum: 'other' })).not.toBe(a)
  })
  it('ctag は全件から安定生成', () => {
    expect(ctagOf([contact])).toBe(ctagOf([contact]))
    expect(ctagOf([contact])).not.toBe(ctagOf([]))
  })
})

describe('multistatus / multiget', () => {
  it('collectionResponse は addressbook を名乗り自己を principal に', () => {
    const xml = multistatus([collectionResponse('/n/carddav/8001/', '番頭さん', 'ctag1')])
    expect(xml).toContain('<card:addressbook/>')
    expect(xml).toContain('<d:href>/n/carddav/8001/</d:href>')
    expect(xml).toContain('addressbook-home-set')
    expect(xml).toContain('ctag1')
  })
  it('parseMultigetHrefs は multiget の href を抽出', () => {
    const body = `<?xml version="1.0"?><card:addressbook-multiget xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav">
      <d:href>/n/carddav/8001/bantosan-1.vcf</d:href><d:href>/n/carddav/8001/bantosan-2.vcf</d:href></card:addressbook-multiget>`
    expect(parseMultigetHrefs(body)).toEqual(['/n/carddav/8001/bantosan-1.vcf', '/n/carddav/8001/bantosan-2.vcf'])
  })
  it('addressbook-query は null（=全量）', () => {
    expect(parseMultigetHrefs('<card:addressbook-query/>')).toBeNull()
  })
})

describe('parseDotEnv / basic auth', () => {
  it('KEY=VALUE とクォートとコメント', () => {
    expect(parseDotEnv('# c\nA=1\nB="x y"\n\nC=\'z\'')).toEqual({ A: '1', B: 'x y', C: 'z' })
  })
  it('checkBasicAuth は一致のみ true', () => {
    const h = 'Basic ' + Buffer.from('u:p').toString('base64')
    expect(checkBasicAuth(h, 'u', 'p')).toBe(true)
    expect(checkBasicAuth(h, 'u', 'x')).toBe(false)
    expect(checkBasicAuth(null, 'u', 'p')).toBe(false)
    expect(checkBasicAuth('Bearer x', 'u', 'p')).toBe(false)
  })
})
