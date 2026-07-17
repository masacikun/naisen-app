// FreePBX asteriskcdrdb.cdr → naisen_calls 変換（純関数・DB非依存・テスト対象）
//
// 承認済みルール（2026-07-14 CDR取込設計）:
// - linkedid 単位で 1通話 1行に集約（call_id = linkedid・UPSERTキー）
// - 代表レグ = sequence 最小
// - IVR のみが応答した通話は NO ANSWER（人間の応答 = PJSIP/内線 が ANSWERED）
// - duration_sec = 応答レグの billsec 最大
// - 81形式アダプタ: 先頭81かつ12桁以上 → 0 付替え（phone.ts は不変更。
//   出力は数字のみ＝正規化済み形式と同一で、表示側の normalizePhone 突合とそのまま一致する）
import { cleanCnam } from './phone'

export interface CdrLeg {
  calldate: string          // 'YYYY-MM-DD HH:MM:SS'（サーバJST）
  src: string
  dst: string
  dcontext: string
  channel: string
  dstchannel: string
  lastapp: string
  lastdata: string
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
// 着信名称は TelPro PBX 設定一覧（2026-07-16 全25番号割当確定）の「着信名称」に準拠
export const CDR_LINE_NAMES: Record<string, string> = {
  '05054344451': '水炊き大和',
  '05053711034': 'GACHA',
  '05053711025': '水炊き・もつ鍋',
  '05053708217': 'スタッフ中洲',
  '05053711026': '西新餃子スタンド大和',
  '05054344450': 'SmileFood',
  '05053711020': 'SmileEstate',
  '05054344449': 'CoSmile',
  '05053708220': '通販_問い合わせ',
  '05053708216': 'HYD_求人',
  '05053711035': '博多大和ダイニング',
  '05053711021': 'FAX',
  '05053711023': '小林 直通',
  '05053711024': '楠原 直通',
  '05053711027': '武富 直通',
  '05053711028': '主計 直通',
  '05053711029': '鴨川 直通',
  '05053711030': '田原 直通',
  // 予備（着信は切断される・発信は 017→018→019 を楽天発信が使うため旧名を維持）
  '05053711016': '予備',
  '05053711031': '予備',
  '05053711032': '予備',
  '05053708218': '予備',
  '05053711017': '大和A',
  '05053711018': '大和B',
  '05053711019': '大和C',
  // 旧電話サービス時代の識別子（履歴データ用に温存）
  '05054344452': 'tenjin',
  '0922923010':  '1_gates',
}

/**
 * 81形式アダプタ: 数字のみ抽出し、+なし国際表記（81+9〜10桁）は 0 に付替え。
 * 2026-07-18: 0120等のフリーダイヤル（81120…=11桁）が旧条件「12桁以上」から漏れていたため
 * cid-lookup.ts の normalizeCidNumber と同一の正規表現に統一（2-4）。
 */
export function to0Form(raw: string | null | undefined): string {
  const d = (raw ?? '').replace(/[^0-9]/g, '')
  if (/^81[1-9][0-9]{8,9}$/.test(d)) return '0' + d.slice(2)
  return d
}

// ── 2-2 IVR経路の判別マップ（FreePBX 実体照合 2026-07-18・表記はまさし承認） ──
// ivr_details の名称
export const IVR_NAMES: Record<string, string> = {
  'ivr-1': '大和A', 'ivr-2': '大和A不在', 'ivr-3': '大和B', 'ivr-4': '大和C',
  'ivr-5': '大和D', 'ivr-6': '大和B不在', 'ivr-7': 'SmileFood', 'ivr-8': 'Estate',
  'ivr-9': 'HYD', 'ivr-10': '西新',
}
// リンググループ番号 → 「IVR名→選択肢」表記（ringgroups.description 準拠・受け内線表記(8001)等は除去）
export const GROUP_ROUTES: Record<string, string> = {
  '600': '代表受け',
  '601': '大和A→予約', '602': '大和A→キャンセル', '603': '大和A→その他',
  '604': '大和B→予約', '605': '大和B→キャンセル', '606': '大和B→変更', '607': '大和B→その他',
  '608': '大和C→当日変更', '609': '大和C→変更', '610': '大和C→その他',
  '611': '大和D→当日変更', '612': '大和D→変更', '613': '大和D→その他',
  '614': 'SmileFood→経理', '615': 'SmileFood→その他',
  '616': 'Estate→経理', '617': 'Estate→その他',
  '618': 'HYD→経理', '619': 'HYD→その他',
  '620': '西新→一次受け', '621': 'GACHA→混雑時', '622': 'GACHA→通常',
  '630': '直通受け',
}
// announcement_id → 案内名（announcement.description 準拠）
export const ANNOUNCEMENT_LABELS: Record<string, string> = {
  '1': '不在案内', '2': '不在案内', '3': '不在案内', '4': '留守電',
  '5': '担当者不在案内', '6': '担当者不在案内', '7': '担当者不在案内',
  '8': '閉店案内', '9': '混み合い案内', '10': 'コールセンター案内',
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

    // 2-2/2-3 終端イベントの検出（後続レグの dcontext / lastapp から）
    const rejected = group.some(l => l.dcontext === 'app-blackhole')          // ブラックリスト着信（app-blacklist-check→blackhole 終端）
    const voicemail = group.some(l => l.lastapp === 'VoiceMail')              // 留守電で完了

    let status: string
    if (answeredLegs.length > 0) status = 'ANSWERED'
    else if (rejected) status = 'REJECTED'
    else if (voicemail) status = 'VOICEMAIL'
    else if (group.some(l => l.disposition === 'BUSY')) status = 'BUSY'
    else if (group.some(l => l.disposition === 'ANSWERED')) status = 'NO ANSWER' // IVR応答のみ
    else if (group.every(l => l.disposition === 'FAILED')) status = 'FAILED'
    else status = 'NO ANSWER'

    const durationSec = answeredLegs.length > 0 ? Math.max(...answeredLegs.map(l => l.billsec || 0)) : 0
    const bestAnswered = answeredLegs.slice().sort((a, b) => (b.billsec || 0) - (a.billsec || 0))[0]

    const didRaw = group.map(l => l.did).find(v => v && v.trim()) ?? ''
    const lineNumber = didRaw ? to0Form(didRaw) : ''
    const lineName = lineNumber ? CDR_LINE_NAMES[lineNumber] ?? null : null

    // 2-2 IVR経路（人間可読）: 最後に居た IVR ＋ 押下先（グループ/案内/留守電/TableCheck）で判別
    const ivrCtxs = group
      .map(l => [l.dcontext, l.dst].find(v => /^ivr-\d+$/.test(v ?? '')))
      .filter((v): v is string => !!v)
    const ivrName = ivrCtxs.length > 0 ? (IVR_NAMES[ivrCtxs[ivrCtxs.length - 1]] ?? ivrCtxs[ivrCtxs.length - 1]) : null
    const groupLeg = [...group].reverse()
      .find(l => l.dcontext === 'ext-group' && GROUP_ROUTES[(l.dst ?? '').replace(/[^0-9]/g, '')])
    const annId = group
      .map(l => ((l.dcontext ?? '').match(/^app-announcement-(\d+)$/) ?? [])[1])
      .find(v => v) ?? null
    const hasMisc = group.some(l => l.dcontext === 'ext-miscdests')

    let ivrRoute: string | null = null
    if (voicemail) ivrRoute = ivrName ? `${ivrName}→留守電` : '留守電'
    else if (hasMisc) ivrRoute = ivrName ? `${ivrName}→TableCheck転送` : 'TableCheck転送'
    else if (groupLeg) ivrRoute = GROUP_ROUTES[(groupLeg.dst ?? '').replace(/[^0-9]/g, '')]
    else if (annId) {
      const label = ANNOUNCEMENT_LABELS[annId] ?? `案内${annId}`
      ivrRoute = ivrName ? `${ivrName}→${label}` : label
    } else if (rejected) ivrRoute = null
    else if (ivrName) ivrRoute = `${ivrName}(IVR途中切断)`

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
      caller_name: cleanCnam(rep.cnam),
      destination,
      destination_name: null,
      line_number: lineNumber || null,
      line_name: lineName,
      ivr_route: ivrRoute,
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
