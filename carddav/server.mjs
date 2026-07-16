// CardDAV サイドカー（Groundwire「連絡先ソース→CardDAV」向け・読み取り専用）。
// Next.js App Router は PROPFIND/REPORT を扱えないため別プロセス（port 3012・pm2: naisen-carddav）。
// データ源は既存 acrobits フィード（localhost:3002）＝ ?user= 解決・退職/blocked除外・ふりがな込みを再利用。
// URL 形式: /n/carddav/<内線番号 or all>/ … このパスが addressbook コレクション。
// 全リクエストをログ（実機 Groundwire が何を要求するかの採取用）。書き込み系メソッドは 403。
import http from 'node:http'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  buildVcard, checkBasicAuth, collectionResponse, ctagOf, etagOf,
  itemResponse, multistatus, parseDotEnv, parseMultigetHrefs, reportItemResponse,
} from './lib.mjs'

const ROOT = dirname(fileURLToPath(import.meta.url))
const env = parseDotEnv(readFileSync(join(ROOT, '..', '.env.local'), 'utf-8'))
const USER = env.PHONEBOOK_USER
const PASS = env.PHONEBOOK_PASS
const PORT = Number(process.env.PORT || 3012)
const FEED = 'http://127.0.0.1:3002/n/api/phonebook/acrobits'
const BASE = '/n/carddav'
const CACHE_MS = 30_000

if (!USER || !PASS) {
  console.error('FATAL: PHONEBOOK_USER/PASS missing in .env.local')
  process.exit(1)
}

const cache = new Map() // ext -> { at, contacts }

async function fetchContacts(ext) {
  const hit = cache.get(ext)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.contacts
  // ?user= は常に付ける（'all' は購読なし→'all' 電話帳へフォールバック＝約184件。無指定だと全件が出てしまう）
  const url = `${FEED}?user=${encodeURIComponent(ext)}`
  const res = await fetch(url, {
    headers: { authorization: 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64') },
  })
  if (!res.ok) throw new Error(`feed HTTP ${res.status}`)
  const contacts = (await res.json()).contacts ?? []
  cache.set(ext, { at: Date.now(), contacts })
  return contacts
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', c => {
      size += c.length
      if (size > 1_000_000) reject(new Error('body too large'))
      else chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    req.on('error', reject)
  })
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'DAV': '1, 3, addressbook',
    'Allow': 'OPTIONS, GET, HEAD, PROPFIND, REPORT',
    ...headers,
  })
  res.end(body ?? '')
}

const XML = { 'Content-Type': 'application/xml; charset=utf-8' }

// パス解釈: /n/carddav/<ext>/(<uid>.vcf)? （ext は数字3-4桁 or all。?user= 併記も許容）
function parsePath(req) {
  const u = new URL(req.url, 'http://localhost')
  let rest = u.pathname.replace(/\/+$/, '')
  if (rest === BASE || rest === BASE + '/') rest = BASE
  if (!rest.startsWith(BASE)) return null
  const parts = rest.slice(BASE.length).split('/').filter(Boolean)
  const qUser = u.searchParams.get('user')?.trim()
  if (parts.length === 0) return { kind: 'root', ext: qUser && /^[0-9]{3,4}$/.test(qUser) ? qUser : null }
  const ext = parts[0]
  if (!/^[0-9]{3,4}$/.test(ext) && ext !== 'all') return null
  if (parts.length === 1) return { kind: 'collection', ext }
  const m = parts[1].match(/^bantosan-(\d+)\.vcf$/)
  if (parts.length === 2 && m) return { kind: 'item', ext, id: m[1] }
  return null
}

const hrefOfColl = ext => `${BASE}/${ext}/`
const hrefOfItem = (ext, c) => `${BASE}/${ext}/bantosan-${c.contactId}.vcf`

const server = http.createServer(async (req, res) => {
  const started = Date.now()
  const ua = (req.headers['user-agent'] || '-').slice(0, 60)
  const depth = req.headers['depth'] ?? '-'
  const done = status =>
    console.log(`${req.method} ${req.url} -> ${status} (depth=${depth}, ${Date.now() - started}ms, UA=${ua})`)

  try {
    if (req.method === 'OPTIONS') {
      send(res, 200, '')
      return done(200)
    }
    if (!checkBasicAuth(req.headers.authorization, USER, PASS)) {
      send(res, 401, 'Unauthorized', { 'WWW-Authenticate': 'Basic realm="bantosan-carddav"' })
      return done(401)
    }
    const p = parsePath(req)
    if (!p) {
      send(res, 404, 'Not Found')
      return done(404)
    }
    if (['PUT', 'DELETE', 'MKCOL', 'MKCALENDAR', 'PROPPATCH', 'MOVE', 'COPY', 'POST', 'PATCH'].includes(req.method)) {
      send(res, 403, 'read-only') // 本体側からの書き込みは受けない（番頭さんが正）
      return done(403)
    }

    if (req.method === 'PROPFIND') {
      const body = await readBody(req)
      if (p.kind === 'root') {
        // ベースURLで探索された場合: ?user= があればそのコレクションへ誘導、無ければ all を名乗る
        const ext = p.ext ?? 'all'
        const contacts = await fetchContacts(ext)
        send(res, 207, multistatus([collectionResponse(hrefOfColl(ext), `番頭さん電話帳(${ext})`, ctagOf(contacts))]), XML)
        return done(207)
      }
      const contacts = await fetchContacts(p.ext)
      if (p.kind === 'item') {
        const c = contacts.find(x => x.contactId === p.id)
        if (!c) { send(res, 404, 'Not Found'); return done(404) }
        send(res, 207, multistatus([itemResponse(hrefOfItem(p.ext, c), etagOf(c))]), XML)
        return done(207)
      }
      const resps = [collectionResponse(hrefOfColl(p.ext), `番頭さん電話帳(${p.ext})`, ctagOf(contacts))]
      if (depth !== '0') for (const c of contacts) resps.push(itemResponse(hrefOfItem(p.ext, c), etagOf(c)))
      if (body.length > 0 && body.length < 2000) console.log(`  PROPFIND body: ${body.replace(/\s+/g, ' ').slice(0, 500)}`)
      send(res, 207, multistatus(resps), XML)
      return done(207)
    }

    if (req.method === 'REPORT') {
      const body = await readBody(req)
      console.log(`  REPORT body: ${body.replace(/\s+/g, ' ').slice(0, 500)}`)
      const ext = p.kind === 'root' ? (p.ext ?? 'all') : p.ext
      const contacts = await fetchContacts(ext)
      const hrefs = parseMultigetHrefs(body)
      const wanted = hrefs
        ? contacts.filter(c => hrefs.includes(hrefOfItem(ext, c)))
        : contacts // addressbook-query / sync-collection は全量返す
      const resps = wanted.map(c => reportItemResponse(hrefOfItem(ext, c), etagOf(c), buildVcard(c)))
      send(res, 207, multistatus(resps), XML)
      return done(207)
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      if (p.kind === 'item') {
        const contacts = await fetchContacts(p.ext)
        const c = contacts.find(x => x.contactId === p.id)
        if (!c) { send(res, 404, 'Not Found'); return done(404) }
        const v = buildVcard(c)
        send(res, 200, req.method === 'HEAD' ? '' : v, {
          'Content-Type': 'text/vcard; charset=utf-8',
          'ETag': etagOf(c),
        })
        return done(200)
      }
      // コレクションGET: 全件を1ファイルの vCard として返す（動作確認・手動インポート用）
      const ext = p.kind === 'root' ? (p.ext ?? 'all') : p.ext
      const contacts = await fetchContacts(ext)
      send(res, 200, req.method === 'HEAD' ? '' : contacts.map(buildVcard).join(''), {
        'Content-Type': 'text/vcard; charset=utf-8',
      })
      return done(200)
    }

    send(res, 405, 'Method Not Allowed')
    return done(405)
  } catch (e) {
    console.error(`ERROR ${req.method} ${req.url}: ${e.message}`)
    send(res, 500, 'Internal Server Error')
    return done(500)
  }
})

server.listen(PORT, '127.0.0.1', () => console.log(`naisen-carddav listening on 127.0.0.1:${PORT}`))
