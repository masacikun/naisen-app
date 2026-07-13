// 旧PBX電話帳CSVの一回限り一括取込スクリプト（Slice 2・2026-07-14）
//
// 実行（VPS上・naisen-app ルートで）:
//   npx tsc scripts/import_addressbook.ts src/lib/addressbook-import.ts src/lib/phone.ts \
//     --outDir /tmp/import_ab --module commonjs --target es2020 --esModuleInterop --skipLibCheck
//   node /tmp/import_ab/scripts/import_addressbook.js /home/smileadmin/addressbook20260713.csv
//
// - 二重取込防止: phonebook_entries が空でなければ即中断
// - 書込先は phonebook_entries / phonebook_numbers のみ（内部PostgREST 3101・service_role）
// - 出力は件数のみ（PII を stdout に出さない）
import * as fs from 'fs'
import * as path from 'path'
import { parseAddressbook } from '../src/lib/addressbook-import'

const APP_DIR = '/var/www/naisen-app'

function readEnv(name: string): string {
  for (const f of ['.env.local', '.env']) {
    const p = path.join(APP_DIR, f)
    if (!fs.existsSync(p)) continue
    const m = fs.readFileSync(p, 'utf8').match(new RegExp(`^${name}=(.*)$`, 'm'))
    if (m) return m[1].trim()
  }
  throw new Error(`${name} not found in env files`)
}

function decodeBuffer(buf: Buffer): string {
  // UTF-8(BOM可)を優先、失敗時は cp932（iconv-lite は naisen-app の依存に含まれる）
  const utf8 = buf.toString('utf8')
  if (!utf8.includes('�')) return utf8.replace(/^﻿/, '')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const iconv = require(path.join(APP_DIR, 'node_modules', 'iconv-lite'))
  return iconv.decode(buf, 'cp932')
}

async function main() {
  const csvPath = process.argv[2]
  if (!csvPath) { console.error('usage: node import_addressbook.js <csv path>'); process.exit(1) }

  const base = readEnv('SUPABASE_URL') // http://127.0.0.1:3101
  const key = readEnv('SUPABASE_SERVICE_ROLE_KEY')
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  }
  const rest = (p: string) => `${base}/rest/v1${p}`

  // 二重取込防止ガード
  const guard = await fetch(rest('/phonebook_entries?select=id&limit=1'), { headers })
  const existing = await guard.json()
  if (!guard.ok) throw new Error(`guard query failed: ${guard.status}`)
  if (Array.isArray(existing) && existing.length > 0) {
    console.error('中断: phonebook_entries が空ではありません（二重取込防止）。再取込は明示クリア後にのみ。')
    process.exit(2)
  }

  const parsed = parseAddressbook(decodeBuffer(fs.readFileSync(csvPath)))
  console.log(`パース完了: entries=${parsed.entries.length} numbers=${parsed.numberCount} blocked=${parsed.blockedCount} skipped=${parsed.skippedRows} null_normalized=${parsed.nullNormalizedCount}`)

  let inserted = 0, numInserted = 0
  for (const e of parsed.entries) {
    const res = await fetch(rest('/phonebook_entries'), {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({
        name: e.name, name_kana: e.name_kana, group_name: e.group_name,
        memo: e.memo, blocked: e.blocked,
      }),
    })
    if (!res.ok) throw new Error(`entry insert failed (${res.status}) at row ${inserted + 1}: ${await res.text()}`)
    const [row] = await res.json()
    inserted++
    if (e.numbers.length > 0) {
      const res2 = await fetch(rest('/phonebook_numbers'), {
        method: 'POST',
        headers,
        body: JSON.stringify(e.numbers.map(n => ({ ...n, entry_id: row.id }))),
      })
      if (!res2.ok) throw new Error(`numbers insert failed (${res2.status}) for entry ${row.id}: ${await res2.text()}`)
      numInserted += e.numbers.length
    }
    if (inserted % 200 === 0) console.log(`  ... ${inserted}/${parsed.entries.length}`)
  }
  console.log(`取込完了: entries=${inserted} numbers=${numInserted}`)
}

main().catch(e => { console.error(String(e)); process.exit(1) })
