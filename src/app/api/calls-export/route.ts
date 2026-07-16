import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'
import { BRANDS } from '@/lib/brands'
import { resolveCallerNames } from '@/lib/phonebook'

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
  const blockedOnly = sp.get('blocked') === '1'
  const dir         = sp.get('dir') === 'out' ? 'out' : 'in'
  const minDur     = sp.get('minDur') ? parseInt(sp.get('minDur')!) : null
  const q          = sp.get('q') || ''
  const from       = sp.get('from') || ''
  const to         = sp.get('to') || ''

  // naisen_calls_ex = 電話帳突合フラグ付きビュー（/calls ページと同一のフィルタ意味論）
  let query = supabaseServer
    .from('naisen_calls_ex')
    .select('started_at,caller,caller_name,destination,line_name,ivr_route,duration_sec,status')
    .order('started_at', { ascending: false })
    .limit(5000)

  if (q)    query = query.ilike(dir === 'out' ? 'destination' : 'caller', `%${q}%`)
  if (from) query = query.gte('started_at', new Date(from + 'T00:00:00+09:00').toISOString())
  if (to)   query = query.lte('started_at', new Date(to   + 'T23:59:59+09:00').toISOString())

  if (brandIds.length > 0) {
    const activeLines = brandIds.flatMap(id => BRANDS.find(b => b.id === id)?.lines ?? [])
    if (activeLines.length > 0) query = query.in('line_name', activeLines)
  }

  if (statusList.length > 0) query = query.in('status', statusList)
  if (minDur)     query = query.gte('duration_sec', minDur)

  if (dir === 'out') {
    query = query
      .not('caller', 'is', null).not('caller', 'like', '0%')
      .not('outbound_line', 'is', null).neq('outbound_line', '').neq('outbound_line', 'nan')
  } else {
    if (excludeInt) query = query.or('caller.is.null,caller.like.0%')
    if (hasMemo)     query = query.eq('in_phonebook', true)
    if (blockedOnly) query = query.eq('is_blocked', true)
  }

  const { data } = await query

  // 着信相手名の突合（電話帳 主・master フォールバック）
  const rowsData = (data ?? []) as {
    started_at: string; caller: string | null; caller_name: string | null
    destination: string | null; line_name: string | null; ivr_route: string | null
    duration_sec: number | null; status: string
  }[]
  const nameMap = await resolveCallerNames(
    rowsData.map(c => (dir === 'out' ? c.destination : c.caller)).filter(Boolean) as string[])

  const STATUS_LABEL: Record<string, string> = {
    'ANSWERED': '応答', 'NO ANSWER': '不在', 'BUSY': '話中', 'FAILED': 'FAILED',
  }

  const header = dir === 'out'
    ? '日時,発信先,名前,発信内線,IVR,通話時間,ステータス,メモ\n'
    : '日時,発信元,名前,回線,IVR,通話時間,ステータス,メモ\n'
  const rows = rowsData.map(c => {
    const other = dir === 'out' ? c.destination : c.caller
    const hit = other ? nameMap.get(other) : undefined
    return [
      csvEscape(toJST(c.started_at)),
      csvEscape(other),
      csvEscape(hit?.name || (dir === 'out' ? '' : c.caller_name)),
      csvEscape(dir === 'out' ? c.caller : c.line_name),
      csvEscape(c.ivr_route),
      csvEscape(fmtSec(c.duration_sec)),
      csvEscape(STATUS_LABEL[c.status] || c.status),
      csvEscape(hit?.note ?? ''),
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
