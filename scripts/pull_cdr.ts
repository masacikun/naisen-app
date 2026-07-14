// FreePBX asteriskcdrdb.cdr → naisen_calls 取込ジョブ（接続層・2026-07-14）
//
// 方式: SSHトンネル都度張り → MySQL(naisen_ro・読取専用) から 48h窓＋CDR_CUTOFF_AT 以降を SELECT
//       → linkedid 集約（cdr-transform.ts）→ PostgREST へ call_id UPSERT（冪等）→ トンネル切断。
// 実行: scripts/pull_cdr.sh 経由（cron 登録はフェーズ2で :08/:23/:38/:53）。
// 秘密は /var/www/naisen-app/.env.local から読む（stdout に一切出さない）。
//
// .env.local に必要なキー:
//   CDR_DB_PASSWORD  (必須・naisen_ro のパスワード)
//   CDR_CUTOFF_AT    (必須・'YYYY-MM-DD HH:MM:SS' JST・これ以前は取込まない=試験通話除外)
//   CDR_SSH_HOST(=162.43.89.64) CDR_SSH_PORT(=2222) CDR_SSH_USER(=cdrpull)
//   CDR_SSH_KEY(=/home/smileadmin/.ssh/cdrpull_ed25519) CDR_LOCAL_PORT(=13306)
//   CDR_DB_USER(=naisen_ro) CDR_DB_NAME(=asteriskcdrdb)   ※括弧はデフォルト値
import { spawn, type ChildProcess } from 'child_process'
import * as fs from 'fs'
import * as net from 'net'
import * as path from 'path'
import { aggregateCdr, type CdrLeg } from '../src/lib/cdr-transform'

const APP_DIR = '/var/www/naisen-app'

function readEnv(name: string, def?: string): string {
  if (process.env[name]) return process.env[name]!.trim() // プロセスenvが最優先（ドライラン時の一時上書き用）
  for (const f of ['.env.local', '.env']) {
    const p = path.join(APP_DIR, f)
    if (!fs.existsSync(p)) continue
    const m = fs.readFileSync(p, 'utf8').match(new RegExp(`^${name}=(.*)$`, 'm'))
    if (m) return m[1].trim()
  }
  if (def !== undefined) return def
  throw new Error(`${name} が .env.local にありません`)
}

function waitPort(port: number, timeoutMs = 15000): Promise<void> {
  const started = Date.now()
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const sock = net.connect({ host: '127.0.0.1', port }, () => { sock.destroy(); resolve() })
      sock.on('error', () => {
        sock.destroy()
        if (Date.now() - started > timeoutMs) reject(new Error('SSHトンネルの疎通待ちがタイムアウト'))
        else setTimeout(tryOnce, 500)
      })
    }
    tryOnce()
  })
}

async function main() {
  const sshHost = readEnv('CDR_SSH_HOST', '162.43.89.64')
  const sshPort = readEnv('CDR_SSH_PORT', '2222')
  const sshUser = readEnv('CDR_SSH_USER', 'cdrpull')
  const sshKey = readEnv('CDR_SSH_KEY', '/home/smileadmin/.ssh/cdrpull_ed25519')
  const localPort = parseInt(readEnv('CDR_LOCAL_PORT', '13306'))
  const dbUser = readEnv('CDR_DB_USER', 'naisen_ro')
  const dbPassword = readEnv('CDR_DB_PASSWORD')
  const dbName = readEnv('CDR_DB_NAME', 'asteriskcdrdb')
  const cutoffAt = readEnv('CDR_CUTOFF_AT')
  const supabaseUrl = readEnv('SUPABASE_URL')
  const serviceKey = readEnv('SUPABASE_SERVICE_ROLE_KEY')

  let tunnel: ChildProcess | null = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let conn: any = null
  try {
    tunnel = spawn('ssh', [
      '-N',
      '-o', 'ExitOnForwardFailure=yes',
      '-o', 'StrictHostKeyChecking=accept-new',
      '-o', 'ConnectTimeout=10',
      '-o', 'BatchMode=yes',
      '-i', sshKey,
      '-p', sshPort,
      '-L', `127.0.0.1:${localPort}:127.0.0.1:3306`,
      `${sshUser}@${sshHost}`,
    ], { stdio: ['ignore', 'ignore', 'pipe'] })
    let sshErr = ''
    tunnel.stderr?.on('data', d => { sshErr += String(d) })
    tunnel.on('exit', code => { if (code) console.error(`ssh tunnel exit=${code}: ${sshErr.slice(0, 300)}`) })
    await waitPort(localPort)

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mysql = require('mysql2/promise')
    conn = await mysql.createConnection({
      host: '127.0.0.1', port: localPort,
      user: dbUser, password: dbPassword, database: dbName,
      dateStrings: true, connectTimeout: 10000,
    })
    const [rows] = await conn.query(
      `SELECT calldate, src, dst, dcontext, channel, dstchannel, lastapp,
              duration, billsec, disposition, uniqueid, did, recordingfile,
              cnam, outbound_cnum, linkedid, sequence
         FROM cdr
        WHERE calldate >= ? AND calldate >= DATE_SUB(NOW(), INTERVAL 48 HOUR)
        ORDER BY linkedid, sequence`,
      [cutoffAt],
    )
    const legs = rows as CdrLeg[]
    const records = aggregateCdr(legs)
    console.log(`取得 ${legs.length} レグ → 集約 ${records.length} 通話`)

    // --dry-run: UPSERT せず集約結果のサマリーのみ出力（番号はマスク）
    if (process.argv.includes('--dry-run')) {
      const mask = (v: string | null) =>
        v == null ? null : v.replace(/[0-9](?=[0-9]{2})/g, '#')
      const count = (fn: (r: (typeof records)[0]) => string | null | undefined) => {
        const m = new Map<string, number>()
        for (const r of records) { const k = fn(r) ?? '(null)'; m.set(k, (m.get(k) ?? 0) + 1) }
        return Object.fromEntries(m)
      }
      console.log('status:', JSON.stringify(count(r => r.status)))
      console.log('line_name:', JSON.stringify(count(r => r.line_name)))
      console.log('answered_ext:', JSON.stringify(count(r => r.answered_ext)))
      console.log('ivr_route:', JSON.stringify(count(r => r.ivr_route)))
      console.log('録音あり:', records.filter(r => r.recording_file).length, '/', records.length)
      for (const r of records.slice(0, 12)) {
        console.log(JSON.stringify({
          call_id: r.call_id, started_at: r.started_at, status: r.status,
          caller: mask(r.caller), destination: mask(r.destination),
          line_name: r.line_name, answered_ext: r.answered_ext,
          duration_sec: r.duration_sec, outbound_line: mask(r.outbound_line),
          recording: r.recording_file ? 'あり' : null,
        }))
      }
      console.log('DRY RUN: UPSERT せず終了')
      return
    }

    const headers = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    }
    const BATCH = 200
    let upserted = 0
    for (let i = 0; i < records.length; i += BATCH) {
      const batch = records.slice(i, i + BATCH)
      const res = await fetch(`${supabaseUrl}/rest/v1/naisen_calls?on_conflict=call_id`, {
        method: 'POST', headers, body: JSON.stringify(batch),
      })
      if (!res.ok) throw new Error(`upsert failed (${res.status}): ${(await res.text()).slice(0, 300)}`)
      upserted += batch.length
    }
    console.log(`UPSERT 完了: ${upserted} 行（call_id=linkedid・冪等）`)
  } finally {
    try { await conn?.end() } catch { /* noop */ }
    tunnel?.kill()
  }
}

main().catch(e => { console.error(String(e)); process.exit(1) })
