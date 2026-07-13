// FreePBX asteriskcdrdb.cdr → naisen_calls 変換（純関数・DB非依存・テスト対象）
//
// 承認済みルール（2026-07-14 CDR取込設計）:
// - linkedid 単位で 1通話 1行に集約（call_id = linkedid・UPSERTキー）
// - 代表レグ = sequence 最小
// - IVR のみが応答した通話は NO ANSWER（人間の応答 = PJSIP/内線 が ANSWERED）
// - duration_sec = 応答レグの billsec 最大
// - 81形式アダプタ: 先頭81かつ12桁以上 → 0 付替え（phone.ts は不変更。
//   出力は数字のみ＝正規化済み形式と同一で、表示側の normalizePhone 突合とそのまま一致する）
export interface CdrLeg {
  calldate: string          // 'YYYY-MM-DD HH:MM:SS'（サーバJST）
  src: string
  dst: string
  dcontext: string
  channel: string
  dstchannel: string
  lastapp: string
  duration: number
  billsec: number
  disposition: string       // ANSWERED / NO ANSWER / BUSY / FAILED
  uniqueid: string
  did: string
  recordingfile: string
  cnam: string
  outbound_cnum: string
  linkedid: string
  sequence: number
}

export interface NaisenCallRecord {
  started_at: string
  ended_at: string | null
  duration_sec: number
  caller: string | null
  caller_name: string | null
  destination: string | null
  destination_name: string | null
  line_number: string | null
  line_name: string | null
  ivr_route: string | null
  answered_ext: string | null
  outbound_line: string | null
  transferred: string | null
  park_number: string | null
  status: string
  memo: string | null
  comm_id: string | null
  call_id: string
  callback_id: string | null
  source_file: string
  recording_file: string | null
}

// 回線名（0形式キーのみ。81形式は to0Form 適用後に引く）
// 旧ナイセン時代の15回線 ＋ 新FreePBXトランク3本（incoming route の実物照合済み: 017=大和A/018=大和B/019=大和C）
export const CDR_LINE_NAMES: Record<string, string> = {
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
  '05053711017': '大和A',
  '05053711018': '大和B',
  '05053711019': '大和C',
}

/** 81形式アダプタ: 数字のみ抽出し、先頭81かつ12桁以上なら 0 に付替え */
export function to0Form(raw: string | null | undefined): string {
  const d = (raw ?? '').replace(/[^0-9]/g, '')
  if (d.startsWith('81') && d.length > 11) return '0' + d.slice(2)
  return d
}

/** PJSIP/<内線3-4桁>-xxxx から内線番号を取り出す（トランク PJSIP/Rakuten-* は対象外） */
function extFromChannel(ch: string | null | undefined): string | null {
  const m = (ch ?? '').match(/^PJSIP\/(\d{3,4})-/)
  return m ? m[1] : null
}

function toIso(jst: string): string | null {
  if (!jst) return null
  const d = new Date(jst.replace(' ', 'T') + '+09:00')
  return isNaN(d.getTime()) ? null : d.toISOString()
}

function addSec(jst: string, sec: number): string | null {
  const iso = toIso(jst)
  if (!iso) return null
  return new Date(new Date(iso).getTime() + (sec || 0) * 1000).toISOString()
}

type Direction = 'inbound' | 'outbound' | 'internal'

function detectDirection(rep: CdrLeg): Direction {
  if (rep.dcontext === 'from-internal') {
    const d = (rep.dst ?? '').replace(/[^0-9]/g, '')
    return d.length >= 3 && d.length <= 4 ? 'internal' : 'outbound'
  }
  return 'inbound'
}

/** linkedid ごとに集約して naisen_calls 行へ変換 */
export function aggregateCdr(legs: CdrLeg[]): NaisenCallRecord[] {
  const groups = new Map<string, CdrLeg[]>()
  for (const leg of legs) {
    if (!leg.linkedid) continue
    const g = groups.get(leg.linkedid)
    if (g) g.push(leg)
    else groups.set(leg.linkedid, [leg])
  }

  const out: NaisenCallRecord[] = []
  for (const [linkedid, group] of groups) {
    group.sort((a, b) => (a.sequence - b.sequence) || a.uniqueid.localeCompare(b.uniqueid))
    const rep = group[0]
    const direction = detectDirection(rep)

    // 人間の応答（IVR/アプリ応答は含めない）
    const answeredLegs = group.filter(l =>
      l.disposition === 'ANSWERED' &&
      (direction === 'outbound' ? !!l.dstchannel : extFromChannel(l.dstchannel) !== null))

    let status: string
    if (answeredLegs.length > 0) status = 'ANSWERED'
    else if (group.some(l => l.disposition === 'BUSY')) status = 'BUSY'
    else if (group.some(l => l.disposition === 'ANSWERED')) status = 'NO ANSWER' // IVR応答のみ
    else if (group.every(l => l.disposition === 'FAILED')) status = 'FAILED'
    else status = 'NO ANSWER'

    const durationSec = answeredLegs.length > 0 ? Math.max(...answeredLegs.map(l => l.billsec || 0)) : 0
    const bestAnswered = answeredLegs.slice().sort((a, b) => (b.billsec || 0) - (a.billsec || 0))[0]

    const didRaw = group.map(l => l.did).find(v => v && v.trim()) ?? ''
    const lineNumber = didRaw ? to0Form(didRaw) : ''
    const lineName = lineNumber ? CDR_LINE_NAMES[lineNumber] ?? null : null

    const ivrToken = group
      .map(l => [l.dcontext, l.dst].find(v => /^ivr-\d+$/.test(v ?? '')))
      .find(v => v) ?? null

    const recording = group.map(l => l.recordingfile).find(v => v && v.trim()) ?? null

    const repSrc0 = to0Form(rep.src)
    const callerExt = extFromChannel(rep.channel)

    let caller: string | null
    let destination: string | null
    let answeredExt: string | null
    let outboundLine: string | null = null

    if (direction === 'inbound') {
      caller = repSrc0 || (rep.src?.trim() || null)     // 数字なし(anonymous等)は原文保持
      destination = lineNumber ? (lineName ? `${lineNumber}/${lineName}` : lineNumber) : (rep.dst || null)
      answeredExt = bestAnswered ? extFromChannel(bestAnswered.dstchannel) : null
    } else if (direction === 'outbound') {
      caller = callerExt ?? (repSrc0 || null)
      destination = to0Form(rep.dst) || (rep.dst || null)
      answeredExt = callerExt
      const ob = to0Form(group.map(l => l.outbound_cnum).find(v => v && v.trim()) ?? '')
      if (ob) {
        const obName = CDR_LINE_NAMES[ob]
        outboundLine = obName ? `${ob}/${obName}` : ob
      }
    } else {
      caller = repSrc0 || (rep.src?.trim() || null)
      destination = (rep.dst ?? '').replace(/[^0-9]/g, '') || (rep.dst || null)
      answeredExt = bestAnswered ? extFromChannel(bestAnswered.dstchannel) : null
    }

    const lastCalldate = group.reduce((mx, l) => (l.calldate > mx.calldate ? l : mx), rep)

    out.push({
      started_at: toIso(rep.calldate)!,
      ended_at: addSec(lastCalldate.calldate, lastCalldate.duration),
      duration_sec: durationSec,
      caller,
      caller_name: rep.cnam?.trim() || null,
      destination,
      destination_name: null,
      line_number: lineNumber || null,
      line_name: lineName,
      ivr_route: ivrToken,
      answered_ext: answeredExt,
      outbound_line: outboundLine,
      transferred: null,
      park_number: null,
      status,
      memo: null,
      comm_id: null,
      call_id: linkedid,
      callback_id: null,
      source_file: 'freepbx-cdr',
      recording_file: recording,
    })
  }
  return out
}
