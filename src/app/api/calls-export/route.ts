import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'
import { BRANDS } from '@/lib/brands'

function toJST(utcStr: string) {
  const d = new Date(new Date(utcStr).getTime() + 9 * 60 * 60 * 1000)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

function fmtSec(s: number | null) {
  if (!s) return ''
  const m = Math.floor(s / 60)
  return m ? `${m}分${s % 60 ? s % 60 + '秒' : ''}` : `${s}秒`
}

function csvEscape(v: string | null | undefined) {
  if (v == null) return ''
  const s = String(v)
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams

  const brandIds   = (sp.get('brands')   || '').split(',').filter(Boolean)
  const statusList = (sp.get('statuses') || '').split(',').filter(Boolean)
  const excludeInt = sp.get('excludeInt') !== '0'
  const hasMemo    = sp.get('hasMemo') === '1'
  const minDur     = sp.get('minDur') ? parseInt(sp.get('minDur')!) : null
  const q          = sp.get('q') || ''
  const from       = sp.get('from') || ''
  const to         = sp.get('to') || ''

  const { data: memoData } = await supabaseServer
    .from('caller_memo')
    .select('caller,name,note')

  const memos = (memoData ?? []) as { caller: string; name: string; note?: string }[]
  const memoMap = new Map(memos.map(m => [m.caller, m]))

  let query = supabaseServer
    .from('naisen_calls')
    .select('started_at,caller,caller_name,line_name,ivr_route,duration_sec,status')
    .order('started_at', { ascending: false })
    .limit(5000)

  if (q)    query = query.ilike('caller', `%${q}%`)
  if (from) query = query.gte('started_at', new Date(from + 'T00:00:00+09:00').toISOString())
  if (to)   query = query.lte('started_at', new Date(to   + 'T23:59:59+09:00').toISOString())

  if (brandIds.length > 0) {
    const activeLines = brandIds.flatMap(id => BRANDS.find(b => b.id === id)?.lines ?? [])
    if (activeLines.length > 0) query = query.in('line_name', activeLines)
  }

  if (statusList.length > 0) query = query.in('status', statusList)
  if (minDur)     query = query.gte('duration_sec', minDur)
  if (excludeInt) query = query.or('caller.is.null,caller.like.0%')

  if (hasMemo) {
    const memoCals = memos.map(m => m.caller)
    if (memoCals.length > 0) query = query.in('caller', memoCals)
    else {
      return new NextResponse('', {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8-sig',
          'Content-Disposition': 'attachment; filename="calls.csv"',
        },
      })
    }
  }

  const { data } = await query

  const STATUS_LABEL: Record<string, string> = {
    'ANSWERED': '応答', 'NO ANSWER': '不在', 'BUSY': '話中', 'FAILED': 'FAILED',
  }

  const header = '日時,発信元,名前,回線,IVR,通話時間,ステータス,メモ\n'
  const rows = (data ?? []).map((c: {
    started_at: string; caller: string | null; caller_name: string | null
    line_name: string | null; ivr_route: string | null
    duration_sec: number | null; status: string
  }) => {
    const memo = c.caller ? memoMap.get(c.caller) : undefined
    return [
      csvEscape(toJST(c.started_at)),
      csvEscape(c.caller),
      csvEscape(memo?.name || c.caller_name),
      csvEscape(c.line_name),
      csvEscape(c.ivr_route),
      csvEscape(fmtSec(c.duration_sec)),
      csvEscape(STATUS_LABEL[c.status] || c.status),
      csvEscape(memo?.note),
    ].join(',')
  }).join('\n')

  // BOM付きUTF-8でExcelが文字化けしない
  const bom = '﻿'
  return new NextResponse(bom + header + rows, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="calls_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
