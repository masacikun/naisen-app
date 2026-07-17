// FAX完全削除バッチ（2026-07-18新設・毎日4:50 cron）
// 削除（ゴミ箱・deleted_at セット）から30日経過した行を PDF ごと物理削除する。
// supabase-js は単体 Node20 で WebSocket 要求により起動不可のため PostgREST を fetch で直接叩く。
// 実行: cd /var/www/naisen-app && node --env-file=.env.local scripts/purge-fax.mjs
const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定')
  process.exit(1)
}

const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
const endpoint =
  `${url.replace(/\/$/, '')}/rest/v1/naisen_fax_messages` +
  `?deleted_at=lt.${encodeURIComponent(cutoff)}` +
  `&select=id,pbx_uniqueid,deleted_at`

const res = await fetch(endpoint, {
  method: 'DELETE',
  headers: {
    apikey: key,
    Authorization: `Bearer ${key}`,
    Prefer: 'return=representation',
  },
})
if (!res.ok) {
  console.error(`${new Date().toISOString()} purge error: HTTP ${res.status} ${await res.text()}`)
  process.exit(1)
}
const data = await res.json()
const n = data.length
console.log(
  `${new Date().toISOString()} purged ${n} fax(es)` +
  (n ? `: ${data.map(d => `${d.id}(deleted=${d.deleted_at})`).join(', ')}` : '')
)
