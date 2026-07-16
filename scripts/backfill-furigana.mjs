#!/usr/bin/env node
// ふりがな一括バックフィル（ワンショット）。
// 使い方: cd /var/www/naisen-app && node --env-file=.env.local scripts/backfill-furigana.mjs [--dry-run]
// - furigana が NULL/空 の連絡先のみ name → ひらがな を生成して埋める（verified=false のまま）
// - 人手済み（furigana に値あり）は温存・上書きしない
import { createRequire } from 'module'
import path from 'path'
import process from 'process'

const require = createRequire(import.meta.url)

function unwrapDefault(mod) {
  return mod?.default?.default ?? mod?.default ?? mod
}

const DRY_RUN = process.argv.includes('--dry-run')

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !serviceKey) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定（--env-file=.env.local を付けて実行）')
  process.exit(1)
}

// supabase-js は Node20 単体だと Realtime の WebSocket 初期化で落ちるため PostgREST 直 fetch を使う
const restHeaders = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  'Content-Type': 'application/json',
}
async function restGet(pathAndQuery) {
  const res = await fetch(`${supabaseUrl}/rest/v1${pathAndQuery}`, { headers: restHeaders })
  if (!res.ok) throw new Error(`GET ${pathAndQuery}: ${res.status} ${await res.text()}`)
  return res.json()
}
async function restPatch(pathAndQuery, body) {
  const res = await fetch(`${supabaseUrl}/rest/v1${pathAndQuery}`, {
    method: 'PATCH',
    headers: { ...restHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`PATCH ${pathAndQuery}: ${res.status} ${await res.text()}`)
}

const Kuroshiro = unwrapDefault(require('kuroshiro'))
const KuromojiAnalyzer = unwrapDefault(require('kuroshiro-analyzer-kuromoji'))

// カタカナ→ひらがな（kuroshiro は漢字のみ変換するため後段で揃える。src/lib/kana.ts と同じ規則）
const kataToHira = s => s.replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60))

const kuroshiro = new Kuroshiro()
console.log('kuromoji 辞書を読込中...')
await kuroshiro.init(
  new KuromojiAnalyzer({ dictPath: path.join(process.cwd(), 'node_modules/kuromoji/dict') }),
)

const rows = await restGet('/phonebook_entries?select=id,name,furigana&order=id&limit=10000')

const targets = rows.filter(r => !r.furigana || !r.furigana.trim())
console.log(`対象 ${targets.length} 件 / 全 ${rows.length} 件（既存ふりがなは温存）`)

let done = 0
let failed = 0
for (const row of targets) {
  try {
    const furigana = kataToHira(await kuroshiro.convert(row.name, { to: 'hiragana', mode: 'normal' }))
    if (DRY_RUN) {
      console.log(`[dry] #${row.id} ${row.name} → ${furigana}`)
    } else {
      await restPatch(`/phonebook_entries?id=eq.${row.id}`, { furigana, furigana_verified: false })
    }
    done++
    if (done % 100 === 0) console.log(`${done}/${targets.length} ...`)
  } catch (e) {
    failed++
    console.error(`#${row.id} ${row.name}: ${e.message}`)
  }
}
console.log(`完了: 生成 ${done} 件 / 失敗 ${failed} 件${DRY_RUN ? '（dry-run・未書込）' : ''}`)
