import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import iconv from 'iconv-lite'

const LINE_NAMES: Record<string, string> = {
  '05053708216': 'クリマバイト',
  '05053708217': 'スタッフ中洲',
  '05053708218': '求人中洲',
  '05053708220': 'online_order',
  '05053711020': 'SmileEstate',
  '05053711021': '本社FAX',
  '05053711025': '水炊き・もつ鍋',
  '05053711026': '西新',
  '05053711030': 'Central',
  '05053711034': 'GACHA',
  '05054344449': 'CoSmile',
  '05054344450': 'SmileFood',
  '05054344451': 'gates',
  '05054344452': 'tenjin',
  '0922923010':  '1_gates',
}

function decodeBuffer(buf: Buffer): string {
  for (const enc of ['cp932', 'utf-8-sig', 'utf-8'] as const) {
    try {
      const text = iconv.decode(buf, enc)
      if (!text.includes('�')) return text
    } catch {}
  }
  return iconv.decode(buf, 'cp932')
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++ }
      else inQ = !inQ
    } else if (c === ',' && !inQ) {
      result.push(cur.trim())
      cur = ''
    } else {
      cur += c
    }
  }
  result.push(cur.trim())
  return result
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim())
  if (lines.length < 2) return []
  const headers = parseCSVLine(lines[0])
  return lines.slice(1).map(line => {
    const vals = parseCSVLine(line)
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? '']))
  })
}

function extractLineInfo(destination: string): [string | null, string | null] {
  if (!destination) return [null, null]
  const dest = destination.trim()
  if (dest.includes('/')) {
    const slash = dest.indexOf('/')
    const num = dest.slice(0, slash).trim()
    const name = dest.slice(slash + 1).trim()
    return [num, LINE_NAMES[num] ?? name]
  }
  return [dest, LINE_NAMES[dest] ?? null]
}

function toTs(val: string): string | null {
  if (!val?.trim()) return null
  try {
    const d = new Date(val)
    return isNaN(d.getTime()) ? null : d.toISOString()
  } catch { return null }
}

function transform(rows: Record<string, string>[], sourceFile: string) {
  const seen = new Map<string, Record<string, unknown>>()
  for (const row of rows) {
    const callId = (row['通話ID'] ?? '').trim()
    if (!callId) continue
    let [lineNum, lineName] = extractLineInfo(row['発信先'] ?? '')
    if (!lineNum) {
      const outbound = row['発信外線'] ?? ''
      if (outbound.includes('/')) [lineNum, lineName] = extractLineInfo(outbound)
    }
    seen.set(callId, {
      started_at:       toTs(row['開始日時']),
      ended_at:         toTs(row['終了日時']),
      duration_sec:     parseInt(row['接続秒数'] ?? '0') || 0,
      caller:           row['発信元']?.trim() || null,
      caller_name:      row['発信元名']?.trim() || null,
      destination:      row['発信先']?.trim() || null,
      destination_name: row['発信先名']?.trim() || null,
      line_number:      lineNum,
      line_name:        lineName,
      ivr_route:        row['応答機能']?.trim() || null,
      answered_ext:     row['応答内線']?.trim() || null,
      outbound_line:    row['発信外線']?.trim() || null,
      transferred:      row['転送']?.trim() || null,
      park_number:      row['パーク番号']?.trim() || null,
      status:           row['ステータス']?.trim() || null,
      memo:             row['メモ']?.trim() || null,
      comm_id:          row['通信ID']?.trim() || null,
      call_id:          callId,
      callback_id:      row['コールバックID']?.trim() || null,
      source_file:      sourceFile,
    })
  }
  return [...seen.values()]
}

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Failed to parse form data' }, { status: 400 })
  }

  const files = formData.getAll('files') as File[]
  if (!files.length) {
    return NextResponse.json({ error: 'No files provided' }, { status: 400 })
  }

  const results: { file: string; count?: number; error?: string; status: 'ok' | 'error' }[] = []

  for (const file of files) {
    try {
      const buf = Buffer.from(await file.arrayBuffer())
      const text = decodeBuffer(buf)
      const rows = parseCSV(text)
      const records = transform(rows, file.name)

      const BATCH = 500
      let total = 0
      for (let i = 0; i < records.length; i += BATCH) {
        const { error } = await supabase
          .from('naisen_calls')
          .upsert(records.slice(i, i + BATCH), { onConflict: 'call_id' })
        if (error) throw new Error(error.message)
        total += records.slice(i, i + BATCH).length
      }
      results.push({ file: file.name, count: total, status: 'ok' })
    } catch (e) {
      results.push({ file: file.name, error: String(e), status: 'error' })
    }
  }

  return NextResponse.json({ results })
}
