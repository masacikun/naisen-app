import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// FAX PDF の取得（プレビュー/ダウンロード・2026-07-18）
// 認証: nginx auth_request（/n 配下）通過が前提。X-Auth-User 必須（録音再生と同方針）
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!req.headers.get('x-auth-user')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const { id } = await ctx.params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'bad id' }, { status: 400 })

  const { data } = await supabaseAdmin
    .from('naisen_fax_messages')
    .select('pdf_data, pdf_filename, drive_url')
    .eq('id', id)
    .maybeSingle()
  if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 })

  if (!data.pdf_data) {
    // 二重化期間で Drive のみの場合はリンク先へ
    if (data.drive_url) return NextResponse.redirect(data.drive_url)
    return NextResponse.json({ error: 'no pdf' }, { status: 404 })
  }

  const buf = Buffer.from(data.pdf_data, 'base64')
  const fname = data.pdf_filename ?? `fax-${id}.pdf`
  const dl = req.nextUrl.searchParams.get('dl') === '1'
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Length': String(buf.length),
      'Content-Disposition': `${dl ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(fname)}`,
      'Cache-Control': 'private, no-store',
    },
  })
}
