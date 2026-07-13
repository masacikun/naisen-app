// 旧PBX電話帳CSVの取込ロジック（純関数・DB非依存・テスト対象）。
// CSV列: 名前 / カナ / 電話番号(引用符内改行で複数) / 短縮番号(無視) / グループ / 着信拒否(0|1) / メモ
import { splitPhones } from './phone'

export interface AddressbookEntry {
  name: string
  name_kana: string | null
  group_name: string | null
  memo: string | null
  blocked: boolean
  numbers: { phone_raw: string; phone_normalized: string | null }[]
}

export interface AddressbookParseResult {
  entries: AddressbookEntry[]
  skippedRows: number       // 名前も番号も無い行
  numberCount: number
  blockedCount: number
  nullNormalizedCount: number // 内線/非数字で phone_normalized=null の番号数
}

/** 引用符内の改行・エスケープ("")対応のCSVパーサ（文字単位） */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cur = ''
  let inQ = false
  const src = text.replace(/^﻿/, '')
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (inQ) {
      if (c === '"') {
        if (src[i + 1] === '"') { cur += '"'; i++ }
        else inQ = false
      } else cur += c
    } else if (c === '"') {
      inQ = true
    } else if (c === ',') {
      row.push(cur); cur = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(cur); cur = ''
      if (row.some(v => v !== '')) rows.push(row)
      row = []
    } else {
      cur += c
    }
  }
  row.push(cur)
  if (row.some(v => v !== '')) rows.push(row)
  return rows
}

/** ヘッダー付きCSVテキスト → 取込用エントリ配列＋統計 */
export function parseAddressbook(text: string): AddressbookParseResult {
  const rows = parseCsv(text)
  if (rows.length < 2) return { entries: [], skippedRows: 0, numberCount: 0, blockedCount: 0, nullNormalizedCount: 0 }
  const header = rows[0]
  const col = (name: string) => header.indexOf(name)
  const iName = col('名前'), iKana = col('カナ'), iTel = col('電話番号'),
        iGroup = col('グループ'), iBlocked = col('着信拒否'), iMemo = col('メモ')
  if (iName < 0 || iTel < 0 || iBlocked < 0) {
    throw new Error(`期待するヘッダーがありません: ${JSON.stringify(header)}`)
  }

  const result: AddressbookParseResult = {
    entries: [], skippedRows: 0, numberCount: 0, blockedCount: 0, nullNormalizedCount: 0,
  }
  for (const r of rows.slice(1)) {
    const name = (r[iName] ?? '').trim()
    const numbers = splitPhones(r[iTel] ?? '').map(sp => ({
      phone_raw: sp.raw, phone_normalized: sp.normalized,
    }))
    if (!name && numbers.length === 0) { result.skippedRows++; continue }
    const blocked = (r[iBlocked] ?? '').trim() === '1'
    result.entries.push({
      name: name || '(名称未設定)',
      name_kana: (iKana >= 0 && r[iKana]?.trim()) || null,
      group_name: (iGroup >= 0 && r[iGroup]?.trim()) || null,
      memo: (iMemo >= 0 && r[iMemo]?.trim()) || null,
      blocked,
      numbers,
    })
    result.numberCount += numbers.length
    if (blocked) result.blockedCount++
    result.nullNormalizedCount += numbers.filter(n => n.phone_normalized === null).length
  }
  return result
}
