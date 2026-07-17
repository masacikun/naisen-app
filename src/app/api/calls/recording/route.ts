import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

// 通話録音の再生/ダウンロード（2-1・2026-07-18）
// - 認証: nginx auth_request（/n 配下）通過が前提。X-Auth-User 必須（sync系のようなバイパス location ではない）
// - 実体は PBX 側 /var/spool/asterisk/monitor/YYYY/MM/DD/<file>。
//   取得は録音取得専用ユーザー recfetch の forced-command SSH（読み取りだけ・パスは PBX 側スクリプトが検証）
// - クライアントからはファイル名を受けない（?id= の naisen_calls.recording_file だけを使う）。
//   ?vm= は留守電アーカイブ（F3・PBX 側 vm-archive ディレクトリ）用で、ファイル名形式を厳格に検証する。

const FILE_RE = /^[A-Za-z0-9._-]+\.(wav|WAV|gsm)$/
const DATE_RE = /-(20\d{6})-/

function envOr(name: string, def: string): string {
  return process.env[name]?.trim() || def
}

function fetchViaSsh(relPath: string): Promise<Buffer> {
  const host = envOr('REC_SSH_HOST', '162.43.89.64')
  const port = envOr('REC_SSH_PORT', '2222')
  const user = envOr('REC_SSH_USER', 'recfetch')
  const key = envOr('REC_SSH_KEY', '/home/smileadmin/.ssh/recfetch_ed25519')
  return new Promise((resolve, reject) => {
    const p = spawn('ssh', [
      '-o', 'BatchMode=yes',
      '-o', 'ConnectTimeout=10',
      '-o', 'StrictHostKeyChecking=accept-new',
      '-i', key,
      '-p', port,
      `${user}@${host}`,
      relPath, // forced-command の SSH_ORIGINAL_COMMAND として渡る（PBX 側で検証）
    ], { stdio: ['ignore', 'pipe', 'pipe'] })
    const chunks: Buffer[] = []
    let err = ''
    p.stdout.on('data', c => chunks.push(c as Buffer))
    p.stderr.on('data', c => { err += String(c) })
    p.on('error', reject)
    p.on('close', code => {
      if (code === 0 && chunks.length > 0) resolve(Buffer.concat(chunks))
      else reject(new Error(`recfetch failed (exit=${code}): ${err.slice(0, 200)}`))
    })
  })
}

export async function GET(req: NextRequest) {
  if (!req.headers.get('x-auth-user')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const sp = req.nextUrl.searchParams
  let rel: string
  let fname: string

  const vm = sp.get('vm')
  if (vm) {
    // 留守電アーカイブ（F3）: vm-archive/<file>
    if (!FILE_RE.test(vm) || !vm.startsWith('vm-')) {
      return NextResponse.json({ error: 'bad vm name' }, { status: 400 })
    }
    rel = `vm/${vm}`
    fname = vm
  } else {
    const id = parseInt(sp.get('id') ?? '')
    if (!Number.isFinite(id)) return NextResponse.json({ error: 'bad id' }, { status: 400 })
    const { data } = await supabaseAdmin
      .from('naisen_calls')
      .select('recording_file')
      .eq('id', id)
      .single()
    const file = (data?.recording_file ?? '').trim()
    if (!file || !FILE_RE.test(file)) return NextResponse.json({ error: 'no recording' }, { status: 404 })
    const m = file.match(DATE_RE) // ファイル名の -YYYYMMDD- から保存ディレクトリを導出
    if (!m) return NextResponse.json({ error: 'no recording' }, { status: 404 })
    rel = `${m[1].slice(0, 4)}/${m[1].slice(4, 6)}/${m[1].slice(6, 8)}/${file}`
    fname = `call-${id}.wav`
  }

  try {
    const buf = await fetchViaSsh(rel)
    const dl = sp.get('dl') === '1'
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'audio/wav',
        'Content-Length': String(buf.length),
        'Cache-Control': 'private, max-age=3600',
        ...(dl ? { 'Content-Disposition': `attachment; filename="${fname}"` } : {}),
      },
    })
  } catch (e) {
    console.error('recording fetch error:', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'fetch failed' }, { status: 502 })
  }
}
