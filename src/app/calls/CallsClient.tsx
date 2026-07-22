'use client'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { useState, useCallback, useTransition, useEffect } from 'react'
import { BRANDS } from '@/lib/brands'
import type { CallsFilters } from './page'

type Call = {
  id: number; started_at: string; duration_sec: number
  caller: string; caller_name: string; line_name: string
  status: string; ivr_route: string
  destination: string; outbound_line: string
  recording_file: string | null
}
export type PartnerOpt = { partner_no: number; partner_name: string }
export type CategoryOpt = { key: string; name: string }
export type ResolvedEntry = {
  caller: string
  name: string
  source: '電話帳' | '名刺' | '取引先' | '従業員'
  entryId?: number
  note: string | null
  blocked?: boolean
  group?: string | null
  categoryKey?: string | null
  partnerNo?: number
  partnerName?: string
}

const STATUS_STYLE: Record<string, string> = {
  'ANSWERED':  'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
  'NO ANSWER': 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400',
  'BUSY':      'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400',
  'FAILED':    'bg-gray-100 dark:bg-gray-800 text-slate-500',
  'VOICEMAIL': 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  'REJECTED':  'bg-gray-200 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
}
const STATUS_LABEL: Record<string, string> = {
  'ANSWERED': '応答', 'NO ANSWER': '不在', 'BUSY': '話中', 'FAILED': 'FAILED',
  'VOICEMAIL': '留守電', 'REJECTED': '拒否',
}
// 旧取込分（48h より前）の ivr_route は 'ivr-N' 形式のまま残るため表示時に名称へ読み替える
const LEGACY_IVR_NAMES: Record<string, string> = {
  'ivr-1': '大和A', 'ivr-2': '大和A不在', 'ivr-3': '大和B', 'ivr-4': '大和C',
  'ivr-5': '大和D', 'ivr-6': '大和B不在', 'ivr-7': 'SmileFood', 'ivr-8': 'Estate',
  'ivr-9': 'HYD', 'ivr-10': '西新',
}
function fmtIvrRoute(v: string | null): string {
  if (!v) return '—'
  return LEGACY_IVR_NAMES[v] ?? v
}
const SOURCE_STYLE: Record<string, string> = {
  '電話帳': 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  '名刺':   'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  '取引先': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  '従業員': 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
}
const DUR_OPTIONS = [
  { label: '指定なし', value: '' },
  { label: '30秒以上', value: '30' },
  { label: '1分以上',  value: '60' },
  { label: '3分以上',  value: '180' },
  { label: '5分以上',  value: '300' },
]
const STATUS_OPTS = ['ANSWERED', 'NO ANSWER', 'BUSY', 'VOICEMAIL', 'REJECTED'] as const

function fmtDate(s: string) {
  const d = new Date(new Date(s).getTime() + 9 * 60 * 60 * 1000)
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}
function fmtSec(s: number) {
  if (!s) return '-'
  const m = Math.floor(s / 60)
  return m ? `${m}分${s % 60 ? s % 60 + '秒' : ''}` : `${s}秒`
}

// 知らない番号のネット検索アシスト（最終判断は人間）
const NUMBER_SEARCH_SITES = [
  { label: 'Google',     url: (n: string) => `https://www.google.com/search?q=%22${n}%22` },
  { label: 'jpnumber',   url: (n: string) => `https://www.jpnumber.com/searchnumber.do?number=${n}` },
  { label: '電話帳ナビ', url: (n: string) => `https://www.telnavi.jp/phone/${n}` },
]
function isSearchableNumber(caller?: string | null): boolean {
  return !!caller && caller.startsWith('0') && caller.length >= 10
}

// 2-4: 旧取込分に残る 81/+81 形式（0落ち国際表記）を表示だけ国内 0 形式へ（フィルタ値は原文のまま）
function fmt81(n?: string | null): string {
  if (!n) return ''
  return /^81[1-9][0-9]{8,9}$/.test(n) ? '0' + n.slice(2) : n
}

export default function CallsClient({
  calls, total, page, filters, names, partners, categories = [], isAdmin, excludeIntDefault, extNames = {},
}: {
  calls: Call[]; total: number; page: number
  filters: CallsFilters; names: ResolvedEntry[]; partners: PartnerOpt[]; categories?: CategoryOpt[]; isAdmin: boolean
  excludeIntDefault: boolean
  extNames?: Record<string, string>
}) {
  const dir = filters.dir === 'out' ? 'out' : 'in'
  const router   = useRouter()
  const pathname = usePathname()

  // ── filter state (initialized from URL) ──
  const [q,          setQ]          = useState(filters.q    || '')
  const [from,       setFrom]       = useState(filters.from || '')
  const [to,         setTo]         = useState(filters.to   || '')
  const [brands,     setBrands]     = useState<Set<string>>(
    () => new Set(filters.brands   ? filters.brands.split(',').filter(Boolean)   : [])
  )
  const [statuses,   setStatuses]   = useState<Set<string>>(
    () => new Set(filters.statuses ? filters.statuses.split(',').filter(Boolean) : [])
  )
  const [minDur,     setMinDur]     = useState(filters.minDur || '')
  const [excludeInt, setExcludeInt] = useState(excludeIntDefault)
  const [hasMemo,    setHasMemo]    = useState(filters.hasMemo === '1')
  const [blockedOnly, setBlockedOnly] = useState(filters.blocked === '1')

  // ── 相手名（電話帳/master 突合結果）と電話帳インライン登録 ──
  // names はページ内の発着信相手のみを解決したもの。ページ送りしても CallsClient は
  // 再マウントされないため useState の初期値のままだと古いページの nameMap が残る
  // （電話帳が反映されない・リロードで直る不具合）→ names が変わるたびに再同期する。
  const [nameMap, setNameMap] = useState<Map<string, Omit<ResolvedEntry, 'caller'>>>(
    () => new Map(names.map(n => [n.caller, { name: n.name, source: n.source, entryId: n.entryId, note: n.note, blocked: n.blocked, group: n.group, categoryKey: n.categoryKey, partnerNo: n.partnerNo, partnerName: n.partnerName }]))
  )
  useEffect(() => {
    setNameMap(new Map(names.map(n => [n.caller, { name: n.name, source: n.source, entryId: n.entryId, note: n.note, blocked: n.blocked, group: n.group, categoryKey: n.categoryKey, partnerNo: n.partnerNo, partnerName: n.partnerName }])))
  }, [names])
  const [editingId,   setEditingId]   = useState<number | null>(null)
  const [editCaller,  setEditCaller]  = useState('')
  const [editName,    setEditName]    = useState('')
  const [editNote,    setEditNote]    = useState('')
  const [editPartner, setEditPartner] = useState('')
  // 取引先プルダウンの検索欄（2026-07-22・頭のコード非表示＋名前で検索）。確定した取引先は editPartner のまま。
  const [editPartnerQuery, setEditPartnerQuery] = useState('')
  const [editGroup,   setEditGroup]   = useState('')
  const [editCategory, setEditCategory] = useState('unclassified')
  const [editBlocked, setEditBlocked] = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [editError,   setEditError]   = useState('')
  const [isRefreshing, startRefresh]  = useTransition()
  const [playingId, setPlayingId] = useState<number | null>(null) // 2-1 録音のインライン再生

  // ── URL builder ──
  function buildUrl(ov: {
    q?: string; from?: string; to?: string
    brands?: Set<string>; statuses?: Set<string>
    minDur?: string; excludeInt?: boolean; hasMemo?: boolean; blocked?: boolean; page?: number
  } = {}) {
    const v = {
      q:          ov.q          !== undefined ? ov.q          : q,
      from:       ov.from       !== undefined ? ov.from       : from,
      to:         ov.to         !== undefined ? ov.to         : to,
      brands:     ov.brands     !== undefined ? ov.brands     : brands,
      statuses:   ov.statuses   !== undefined ? ov.statuses   : statuses,
      minDur:     ov.minDur     !== undefined ? ov.minDur     : minDur,
      excludeInt: ov.excludeInt !== undefined ? ov.excludeInt : excludeInt,
      hasMemo:    ov.hasMemo    !== undefined ? ov.hasMemo    : hasMemo,
      blocked:    ov.blocked    !== undefined ? ov.blocked    : blockedOnly,
      page:       ov.page       !== undefined ? ov.page       : page,
    }
    const p: Record<string, string> = {}
    if (v.q)                   p.q          = v.q
    if (v.from)                p.from       = v.from
    if (v.to)                  p.to         = v.to
    if (v.brands.size > 0)     p.brands     = [...v.brands].join(',')
    if (v.statuses.size > 0)   p.statuses   = [...v.statuses].join(',')
    if (v.minDur)              p.minDur     = v.minDur
    if (!v.excludeInt)         p.excludeInt = '0'
    if (v.hasMemo)             p.hasMemo    = '1'
    if (v.blocked)             p.blocked    = '1'
    if (dir === 'out')         p.dir        = 'out'
    if (v.page > 1)            p.page       = String(v.page)
    return `${pathname}?${new URLSearchParams(p).toString()}`
  }

  function nav(ov: Omit<Parameters<typeof buildUrl>[0], 'page'> = {}) {
    router.push(buildUrl({ ...ov, page: 1 }))
  }

  // ── filter handlers ──
  function toggleBrand(id: string) {
    const next = new Set(brands)
    next.has(id) ? next.delete(id) : next.add(id)
    setBrands(next)
    nav({ brands: next })
  }

  function toggleStatus(s: string) {
    const next = new Set(statuses)
    next.has(s) ? next.delete(s) : next.add(s)
    setStatuses(next)
    nav({ statuses: next })
  }

  function applySearch() { nav() }

  function switchDir(next: 'in' | 'out') {
    if (next === dir) return
    const p: Record<string, string> = {}
    if (q)    p.q    = q
    if (from) p.from = from
    if (to)   p.to   = to
    if (minDur) p.minDur = minDur
    if (statuses.size > 0) p.statuses = [...statuses].join(',')
    if (next === 'out') p.dir = 'out'
    // ブランド/内線除外/電話帳系は着信専用のためリセット
    router.push(`${pathname}?${new URLSearchParams(p).toString()}`)
  }

  function reset() {
    setQ(''); setFrom(''); setTo('')
    setBrands(new Set()); setStatuses(new Set())
    setMinDur(''); setExcludeInt(true); setHasMemo(false); setBlockedOnly(false)
    router.push(pathname)
  }

  function exportCsv() {
    const p: Record<string, string> = {}
    if (q)             p.q          = q
    if (from)          p.from       = from
    if (to)            p.to         = to
    if (brands.size)   p.brands     = [...brands].join(',')
    if (statuses.size) p.statuses   = [...statuses].join(',')
    if (minDur)        p.minDur     = minDur
    if (!excludeInt)   p.excludeInt = '0'
    if (hasMemo)       p.hasMemo    = '1'
    if (blockedOnly)   p.blocked    = '1'
    if (dir === 'out') p.dir        = 'out'
    window.open(`/n/api/calls-export?${new URLSearchParams(p).toString()}`)
  }

  function clickCaller(caller: string) {
    if (!caller) return
    setQ(caller)
    nav({ q: caller })
  }

  const openEdit = useCallback((id: number, caller: string) => {
    const ex = nameMap.get(caller)
    setEditName(ex?.name ?? '')
    setEditNote(ex?.note ?? '')
    setEditPartner(ex?.partnerNo != null ? String(ex.partnerNo) : '')
    setEditGroup(ex?.source === '電話帳' ? (ex.group ?? '') : '')
    setEditCategory(ex?.source === '電話帳' ? (ex.categoryKey ?? 'unclassified') : 'unclassified')
    setEditBlocked(ex?.blocked ?? false)
    setEditCaller(caller)
    setEditingId(id)
    setEditError('')
  }, [nameMap])

  // 取引先検索欄の表示テキストを editPartner（確定値）に追従させる
  const selEditPartner = editPartner ? partners.find(pp => String(pp.partner_no) === editPartner) ?? null : null
  useEffect(() => { setEditPartnerQuery(selEditPartner?.partner_name ?? '') }, [selEditPartner?.partner_no, editingId])

  // 電話帳へ登録/更新（既存の電話帳エントリなら名前・メモを更新、無ければ新規作成）
  async function saveEntry() {
    if (!editName.trim()) return
    setSaving(true)
    setEditError('')
    try {
      const ex = nameMap.get(editCaller)
      const isPhonebook = ex?.source === '電話帳' && ex.entryId
      const res = await fetch(isPhonebook ? `/n/api/phonebook/${ex.entryId}` : '/n/api/phonebook', {
        method: isPhonebook ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        // 取引先リンク: セレクト選択 ＞ 番号が取引先解決済みなら自動（案B・2026-07-16 まさし承認）
        body: JSON.stringify((() => {
          const partnerId = editPartner
            ? parseInt(editPartner)
            : (ex?.source === '取引先' && ex.partnerNo != null ? ex.partnerNo : null)
          const common = {
            name: editName.trim(), memo: editNote.trim() || null, partner_id: partnerId,
            group_name: editGroup.trim() || null, category_key: editCategory, blocked: editBlocked,
          }
          return isPhonebook ? common : { ...common, numbers: [editCaller] }
        })()),
      })
      if (!res.ok) {
        setEditError(res.status === 403 ? '登録は管理者のみ可能です' : `保存エラー (${res.status})`)
        return
      }
      const saved = await res.json()
      const linkedNo = editPartner ? parseInt(editPartner) : (ex?.source === '取引先' ? ex.partnerNo : ex?.partnerNo)
      setNameMap(prev => new Map(prev).set(editCaller, {
        name: editName.trim(), source: '電話帳', entryId: saved.id, note: editNote.trim() || null,
        blocked: saved.blocked ?? editBlocked, group: editGroup.trim() || null, categoryKey: saved.category_key ?? editCategory,
        partnerNo: linkedNo,
        partnerName: linkedNo != null ? partners.find(pp => pp.partner_no === linkedNo)?.partner_name : undefined,
      }))
      setEditingId(null)
    } finally { setSaving(false) }
  }

  // 電話帳エントリの削除（電話帳由来の相手のみ）
  async function deleteEntry() {
    const ex = nameMap.get(editCaller)
    if (!(ex?.source === '電話帳' && ex.entryId)) return
    setSaving(true)
    setEditError('')
    try {
      const res = await fetch(`/n/api/phonebook/${ex.entryId}`, { method: 'DELETE' })
      if (!res.ok) {
        setEditError(res.status === 403 ? '削除は管理者のみ可能です' : `削除エラー (${res.status})`)
        return
      }
      setNameMap(prev => { const m = new Map(prev); m.delete(editCaller); return m })
      setEditingId(null)
    } finally { setSaving(false) }
  }

  const totalPages = Math.ceil(total / 50)

  return (
    <div className="max-w-6xl mx-auto space-y-4">

      {/* ─── ヘッダー ─── */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800 dark:text-gray-200">通話履歴</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500 dark:text-gray-400">{total.toLocaleString()} 件</span>
          <button onClick={() => startRefresh(() => router.refresh())} disabled={isRefreshing}
            title="最新の通話を取得"
            className="px-3 py-1.5 rounded bg-indigo-600 text-white text-sm hover:bg-indigo-700 font-medium disabled:opacity-50">
            {isRefreshing ? '更新中…' : '🔄 更新'}
          </button>
          <button onClick={exportCsv}
            className="px-3 py-1.5 rounded bg-emerald-600 text-white text-sm hover:bg-emerald-700 font-medium">
            CSV出力
          </button>
        </div>
      </div>

      {/* ─── フィルターパネル ─── */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 space-y-3">

        {/* 行1: 電話番号検索 + 日付範囲 */}
        <div className="flex flex-wrap gap-2 items-center">
          <input
            type="text" placeholder="電話番号で検索..."
            value={q} onChange={e => setQ(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && applySearch()}
            className="border dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 rounded px-3 py-1.5 text-sm flex-1 min-w-40"
          />
          <input
            type="date" value={from}
            onChange={e => { setFrom(e.target.value); nav({ from: e.target.value }) }}
            className="border dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 rounded px-3 py-1.5 text-sm"
          />
          <span className="text-gray-400 dark:text-gray-500 text-sm">〜</span>
          <input
            type="date" value={to}
            onChange={e => { setTo(e.target.value); nav({ to: e.target.value }) }}
            className="border dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 rounded px-3 py-1.5 text-sm"
          />
          <button onClick={applySearch}
            className="px-3 py-1.5 rounded bg-indigo-600 text-white text-sm hover:bg-indigo-700">
            検索
          </button>
          <button onClick={reset}
            className="border dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 rounded px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700">
            リセット
          </button>
        </div>

        {/* 行2: 方向 + ブランドフィルター + 内線除外 + 電話帳 */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex rounded overflow-hidden border border-slate-300 dark:border-gray-600">
            {([['in', '着信'], ['out', '発信']] as const).map(([k, label]) => (
              <button key={k} onClick={() => switchDir(k)}
                className={`px-3 py-1 text-xs font-medium ${
                  dir === k ? 'bg-slate-700 text-white' : 'bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400'
                }`}>
                {label}
              </button>
            ))}
          </div>
          {dir === 'in' && BRANDS.map(b => (
            <button key={b.id} onClick={() => toggleBrand(b.id)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                brands.has(b.id) ? b.active : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-slate-200 dark:hover:bg-gray-700'
              }`}>
              {b.label}
            </button>
          ))}
          {dir === 'in' && <div className="ml-auto flex gap-2">
            <button
              onClick={() => { const n = !excludeInt; setExcludeInt(n); nav({ excludeInt: n }) }}
              className={`px-3 py-1 rounded text-xs font-medium border transition-colors ${
                excludeInt
                  ? 'bg-slate-700 text-white border-slate-700'
                  : 'bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 border-slate-300 dark:border-gray-600 hover:bg-slate-50 dark:hover:bg-gray-700'
              }`}>
              内線除外 {excludeInt ? 'ON' : 'OFF'}
            </button>
            <button
              onClick={() => { const n = !hasMemo; setHasMemo(n); nav({ hasMemo: n }) }}
              className={`px-3 py-1 rounded text-xs font-medium border transition-colors ${
                hasMemo
                  ? 'bg-amber-500 text-white border-amber-500'
                  : 'bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 border-slate-300 dark:border-gray-600 hover:bg-slate-50 dark:hover:bg-gray-700'
              }`}>
              電話帳あり
            </button>
          </div>}
        </div>

        {/* 行3: ステータス + 通話時間 */}
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">ステータス:</span>
            {STATUS_OPTS.map(s => (
              <label key={s} className="flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={statuses.has(s)} onChange={() => toggleStatus(s)} className="rounded" />
                <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${STATUS_STYLE[s]}`}>
                  {STATUS_LABEL[s]}
                </span>
              </label>
            ))}
            {dir === 'in' && <label className="flex items-center gap-1 cursor-pointer">
              <input type="checkbox" checked={blockedOnly}
                onChange={() => { const n = !blockedOnly; setBlockedOnly(n); nav({ blocked: n }) }} className="rounded" />
              <span className="px-1.5 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                着信拒否
              </span>
            </label>}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">通話時間:</span>
            <select value={minDur}
              onChange={e => { setMinDur(e.target.value); nav({ minDur: e.target.value }) }}
              className="border dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 rounded px-2 py-1 text-xs">
              {DUR_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* ─── テーブル ─── */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 dark:text-gray-400 border-b bg-gray-50 dark:bg-gray-800">
              <th className="text-left px-4 py-2">日時</th>
              <th className="text-left px-4 py-2">{dir === 'out' ? '発信先' : '発信元'}</th>
              <th className="text-left px-4 py-2">電話帳</th>
              <th className="text-left px-4 py-2">{dir === 'out' ? '発信内線' : '回線'}</th>
              <th className="text-left px-4 py-2">IVR</th>
              <th className="text-center px-4 py-2">通話時間</th>
              <th className="text-center px-4 py-2">録音</th>
              <th className="text-center px-4 py-2">ステータス</th>
            </tr>
          </thead>
          <tbody>
            {calls.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-16 text-gray-400 dark:text-gray-500 text-sm">
                  該当する通話がありません
                </td>
              </tr>
            ) : calls.map(c => {
              const other     = dir === 'out' ? c.destination : c.caller
              const info      = other ? nameMap.get(other) : undefined
              const isEditing = editingId === c.id
              return (
                <tr key={c.id} className="border-b dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/60">
                  <td className="px-4 py-2 text-gray-600 dark:text-gray-300 whitespace-nowrap">{fmtDate(c.started_at)}</td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    <div className="flex items-center gap-1 group">
                      <button onClick={() => clickCaller(other)}
                        className="font-mono text-xs text-indigo-600 dark:text-indigo-400 hover:underline" title="この番号で絞り込み">
                        {fmt81(other) || '—'}
                      </button>
                      {isSearchableNumber(fmt81(other)) && (
                        <a href={NUMBER_SEARCH_SITES[0].url(fmt81(other))} target="_blank" rel="noopener noreferrer"
                          className="opacity-0 group-hover:opacity-100 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-xs transition-opacity"
                          title="この番号をネットで検索">
                          🔍
                        </a>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    {isEditing ? (
                      <div className="flex flex-col gap-1 min-w-56">
                        <input autoFocus value={editName} onChange={e => setEditName(e.target.value)}
                          placeholder="名前" className="border dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 rounded px-2 py-1 text-xs w-full" />
                        <select value={editCategory} onChange={e => setEditCategory(e.target.value)}
                          className="border dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 rounded px-2 py-1 text-xs w-full">
                          {categories.map(c => <option key={c.key} value={c.key}>{c.name}</option>)}
                        </select>
                        <input value={editGroup} onChange={e => setEditGroup(e.target.value)}
                          placeholder="グループ（任意）" className="border dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 rounded px-2 py-1 text-xs w-full" />
                        <input value={editNote} onChange={e => setEditNote(e.target.value)}
                          placeholder="メモ（任意）" className="border dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 rounded px-2 py-1 text-xs w-full" />
                        <input list="calls-edit-partner-options" value={editPartnerQuery} autoComplete="off"
                          placeholder="取引先とリンク（任意・名前で検索）"
                          onChange={e => {
                            const text = e.target.value
                            setEditPartnerQuery(text)
                            if (text === '') { setEditPartner(''); return }
                            const pp = partners.find(pp => pp.partner_name === text)
                            if (pp) {
                              setEditPartner(String(pp.partner_no))
                              if (!editName.trim()) setEditName(pp.partner_name)
                            }
                          }}
                          className="border dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 rounded px-2 py-1 text-xs w-full" />
                        <datalist id="calls-edit-partner-options">
                          {partners.map(pp => <option key={pp.partner_no} value={pp.partner_name} />)}
                        </datalist>
                        <label className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 cursor-pointer">
                          <input type="checkbox" checked={editBlocked} onChange={e => setEditBlocked(e.target.checked)} className="rounded" />
                          着信拒否（電話機に着信させない）
                        </label>
                        {nameMap.get(editCaller)?.source === '取引先' && (
                          <div className="text-[11px] text-emerald-600 dark:text-emerald-400">
                            保存時に取引先「{nameMap.get(editCaller)?.name}」とリンクします
                          </div>
                        )}
                        {isSearchableNumber(editCaller) && (
                          <div className="flex gap-2 text-[11px] text-gray-400 dark:text-gray-500 items-center">
                            <span>ネットで調べる:</span>
                            {NUMBER_SEARCH_SITES.map(s => (
                              <a key={s.label} href={s.url(editCaller)} target="_blank" rel="noopener noreferrer"
                                className="text-indigo-500 hover:underline">{s.label}</a>
                            ))}
                          </div>
                        )}
                        {editError && <div className="text-xs text-red-600">{editError}</div>}
                        <div className="flex gap-1 items-center">
                          <button onClick={saveEntry} disabled={saving || !editName.trim()}
                            className="px-2 py-0.5 rounded bg-indigo-600 text-white text-xs disabled:opacity-40">
                            {saving ? '…' : '電話帳に保存'}
                          </button>
                          {nameMap.get(editCaller)?.source === '電話帳' && (
                            <button onClick={deleteEntry} disabled={saving}
                              className="px-2 py-0.5 rounded bg-red-100 text-red-600 text-xs">削除</button>
                          )}
                          <button onClick={() => setEditingId(null)}
                            className="px-2 py-0.5 rounded border text-xs text-gray-500 dark:text-gray-400">✕</button>
                          <Link href={`/phonebook?q=${encodeURIComponent(editCaller)}`} target="_blank"
                            className="ml-auto text-[11px] text-indigo-500 hover:underline whitespace-nowrap" title="電話帳で詳細編集（新しいタブ）">
                            電話帳で詳細 ↗
                          </Link>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 group">
                        {info ? (
                          <>
                            {info.source === '電話帳' ? (
                              <Link href={`/phonebook?q=${encodeURIComponent(other)}`} target="_blank"
                                className="hover:underline text-indigo-700 dark:text-indigo-300 font-medium text-xs whitespace-nowrap"
                                title="電話帳で開く（新しいタブ）">
                                {info.name}
                              </Link>
                            ) : (
                              <span className="text-gray-700 dark:text-gray-300 font-medium text-xs whitespace-nowrap">{info.name}</span>
                            )}
                            <span className={`px-1 py-px rounded text-[10px] ${SOURCE_STYLE[info.source] ?? ''}`}>{info.source}</span>
                            {info.categoryKey && info.categoryKey !== 'unclassified' && (
                              <span className="px-1 py-px rounded text-[10px] bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300 whitespace-nowrap">
                                {categories.find(c => c.key === info.categoryKey)?.name ?? info.categoryKey}
                              </span>
                            )}
                            {info.group && (
                              <span className="px-1 py-px rounded text-[10px] bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300 whitespace-nowrap">{info.group}</span>
                            )}
                            {info.blocked && (
                              <span className="px-1 py-px rounded text-[10px] font-semibold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">着信拒否</span>
                            )}
                            {info.partnerName && (
                              <span className="text-[10px] text-gray-400 dark:text-gray-500 whitespace-nowrap">（取引先: {info.partnerName}）</span>
                            )}
                            {info.note && (
                              <span className="text-xs text-gray-400 dark:text-gray-500 truncate max-w-40" title={info.note}>{info.note}</span>
                            )}
                          </>
                        ) : (dir === 'in' && c.caller_name) ? (
                          <span className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap" title="PBXが受け取った発信者名">{c.caller_name}</span>
                        ) : (
                          <span className="text-xs text-gray-300 dark:text-gray-600">—</span>
                        )}
                        {other && isAdmin && (
                          <button onClick={() => openEdit(c.id, other)}
                            className="opacity-0 group-hover:opacity-100 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-xs transition-opacity shrink-0"
                            title={info?.source === '電話帳' ? '電話帳を編集（名称・グループ・着信拒否）' : '電話帳に登録'}>
                            {info?.source === '電話帳' ? '✏️ 編集' : '＋ 登録'}
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2 font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                    {dir === 'out' ? (
                      c.caller ? <>{c.caller}{extNames[c.caller] && <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">{extNames[c.caller]}</span>}</> : '—'
                    ) : c.line_name ? (
                      c.line_name
                    ) : /^[0-9]{3,4}$/.test(c.destination ?? '') ? (
                      // 内線同士: 誰から誰へ（発信元列=発信内線・ここ=着信内線）
                      <span className="text-xs">内線→ {c.destination}{extNames[c.destination] && <span className="ml-1 text-gray-500 dark:text-gray-400">{extNames[c.destination]}</span>}</span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400 max-w-48 truncate">{fmtIvrRoute(c.ivr_route)}</td>
                  <td className="px-4 py-2 text-center text-gray-600 dark:text-gray-300">{fmtSec(c.duration_sec)}</td>
                  <td className="px-4 py-2 text-center whitespace-nowrap">
                    {c.recording_file ? (
                      <span className="inline-flex items-center gap-1.5">
                        <button
                          onClick={() => setPlayingId(playingId === c.id ? null : c.id)}
                          className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                          title={playingId === c.id ? '閉じる' : '録音を再生'}>
                          {playingId === c.id ? '⏹ 閉じる' : '▶ 再生'}
                        </button>
                        <a href={`/n/api/calls/recording?id=${c.id}&dl=1`}
                          className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                          title="録音をダウンロード">⬇</a>
                      </span>
                    ) : (
                      <span className="text-xs text-gray-300 dark:text-gray-600">—</span>
                    )}
                    {playingId === c.id && c.recording_file && (
                      <div className="mt-1">
                        <audio controls autoPlay preload="none" src={`/n/api/calls/recording?id=${c.id}`} className="h-8 w-56" />
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${STATUS_STYLE[c.status] || 'bg-gray-100 dark:bg-gray-800 text-slate-500'}`}>
                      {STATUS_LABEL[c.status] || c.status}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ─── ページネーション ─── */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <button disabled={page <= 1} onClick={() => router.push(buildUrl({ page: page - 1 }))}
            className="px-3 py-1.5 rounded border text-sm disabled:opacity-40">◀</button>
          <span className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300">{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => router.push(buildUrl({ page: page + 1 }))}
            className="px-3 py-1.5 rounded border text-sm disabled:opacity-40">▶</button>
        </div>
      )}
    </div>
  )
}
