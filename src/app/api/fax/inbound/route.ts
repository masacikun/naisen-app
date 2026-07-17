import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { isValidSyncToken } from '@/lib/sync-auth'
import { notifySlackFax } from '@/lib/slack'

export const dynamic = 'force-dynamic'

// FAX受信の受け口（FreePBX fax-postprocess から POST・2026-07-18）
// - nginx 側は location = /n/api/fax/inbound で TelPro FreePBX の IP のみ許可（auth_request バイパス）
// - アプリ側は Bearer（SYNC_FEED_TOKENS・sync系と共通）を検証する二重防御
// - 冪等: pbx_uniqueid が既存なら再登録せず 200 + 既存 id を返す
// - PDF は base64 のまま pdf_data に保存（録音のようなPBX側実体が無いため・budget loans.pdf_data 先例）
// - Slack 通知の失敗は登録を巻き戻さない（ログのみ）

const VIEW_BASE = 'https://banto.hakata-yamato.co.jp/n/fax'

type InboundBody = {
  received_at?: string
  from_number?: string
  pages?: number
  uniqueid?: string
  filename?: string
  pdf_base64?: string
  drive_file_id?: string
  drive_url?: string
}

async function parseBody(req: NextRequest): Promise<InboundBody | null> {
  const ctype = req.headers.get('content-type') ?? ''
  if (ctype.includes('multipart/form-data')) {
    // FreePBX 側実装の都合で multipart も受ける（pdf はファイル or base64 文字列）
    const fd = await req.formData().catch(() => null)
    if (!fd) return null
    const pdf = fd.get('pdf')
    let pdf_base64 = typeof fd.get('pdf_base64') === 'string' ? String(fd.get('pdf_base64')) : undefined
    let filename = typeof fd.get('filename') === 'string' ? String(fd.get('filename')) : undefined
    if (pdf instanceof File) {
      pdf_base64 = Buffer.from(await pdf.arrayBuffer()).toString('base64')
      filename = filename || pdf.name
    }
    const pages = parseInt(String(fd.get('pages') ?? ''), 10)
    return {
      received_at: String(fd.get('received_at') ?? '') || undefined,
      from_number: String(fd.get('from_number') ?? '') || undefined,
      pages: Number.isFinite(pages) ? pages : undefined,
      uniqueid: String(fd.get('uniqueid') ?? '') || undefined,
      filename,
      pdf_base64,
    }
  }
  return (await req.json().catch(() => null)) as InboundBody | null
}

export async function POST(req: NextRequest) {
  if (!isValidSyncToken(req.headers.get('authorization'))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const body = await parseBody(req)
  if (!body) return NextResponse.json({ error: 'invalid body' }, { status: 400 })

  const uniqueid = body.uniqueid?.trim()
  if (!uniqueid) return NextResponse.json({ error: 'uniqueid required' }, { status: 400 })

  // 冪等: 既存なら二重登録しない
  const { data: existing } = await supabaseAdmin
    .from('naisen_fax_messages')
    .select('id')
    .eq('pbx_uniqueid', uniqueid)
    .maybeSingle()
  if (existing) {
    return NextResponse.json({ id: existing.id, view_url: `${VIEW_BASE}/${existing.id}`, duplicate: true })
  }

  const pdfB64 = body.pdf_base64?.replace(/\s/g, '')
  if (!pdfB64) return NextResponse.json({ error: 'pdf_base64 required' }, { status: 400 })
  const pdfBuf = Buffer.from(pdfB64, 'base64')
  if (pdfBuf.length === 0 || !pdfBuf.subarray(0, 5).toString('latin1').startsWith('%PDF')) {
    return NextResponse.json({ error: 'pdf_base64 is not a valid PDF' }, { status: 400 })
  }

  let receivedAt = new Date()
  if (body.received_at) {
    const d = new Date(body.received_at)
    if (isNaN(d.getTime())) return NextResponse.json({ error: 'invalid received_at' }, { status: 400 })
    receivedAt = d
  }

  const row = {
    received_at: receivedAt.toISOString(),
    from_number: body.from_number?.trim() || null,
    pages: Number.isFinite(body.pages) ? body.pages : null,
    pdf_storage: 'local',
    pdf_data: pdfB64,
    pdf_filename: body.filename?.trim() || `fax_${uniqueid}.pdf`,
    drive_file_id: body.drive_file_id?.trim() || null,
    drive_url: body.drive_url?.trim() || null,
    pbx_uniqueid: uniqueid,
    status: 'untriaged',
  }

  const { data: inserted, error } = await supabaseAdmin
    .from('naisen_fax_messages')
    .insert(row)
    .select('id')
    .single()
  if (error || !inserted) {
    // 同時POSTのユニーク衝突は冪等扱いで既存を返す
    if (error?.code === '23505') {
      const { data: dup } = await supabaseAdmin
        .from('naisen_fax_messages')
        .select('id')
        .eq('pbx_uniqueid', uniqueid)
        .maybeSingle()
      if (dup) return NextResponse.json({ id: dup.id, view_url: `${VIEW_BASE}/${dup.id}`, duplicate: true })
    }
    return NextResponse.json({ error: error?.message ?? 'insert failed' }, { status: 500 })
  }

  const viewUrl = `${VIEW_BASE}/${inserted.id}`
  const jst = new Date(receivedAt.getTime() + 9 * 60 * 60 * 1000)
  const stamp = `${jst.getUTCMonth() + 1}/${jst.getUTCDate()} ${String(jst.getUTCHours()).padStart(2, '0')}:${String(jst.getUTCMinutes()).padStart(2, '0')}`
  try {
    await notifySlackFax(
      `📠 新着FAX: ${row.from_number ?? '番号不明'} から ${row.pages ?? '?'}枚（${stamp} 受信）\n${viewUrl}`,
    )
  } catch (e) {
    console.error('[fax] Slack通知失敗（登録は成立）:', e)
  }

  return NextResponse.json({ id: inserted.id, view_url: viewUrl }, { status: 201 })
}
