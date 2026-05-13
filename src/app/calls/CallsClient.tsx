'use client'
import { useRouter, usePathname } from 'next/navigation'
import { useState, useCallback } from 'react'
import { BRANDS } from '@/lib/brands'
import type { CallsFilters } from './page'

type Call = {
  id: number; started_at: string; duration_sec: number
  caller: string; caller_name: string; line_name: string
  status: string; ivr_route: string
}
type Memo = { caller: string; name: string; note?: string }

const STATUS_STYLE: Record<string, string> = {
  'ANSWERED':  'bg-green-100 text-green-700',
  'NO ANSWER': 'bg-red-100 text-red-600',
  'BUSY':      'bg-yellow-100 text-yellow-700',
  'FAILED':    'bg-slate-100 text-slate-500',
}
const STATUS_LABEL: Record<string, string> = {
  'ANSWERED': '応答', 'NO ANSWER': '不在', 'BUSY': '話中', 'FAILED': 'FAILED',
}
const DUR_OPTIONS = [
  { label: '指定なし', value: '' },
  { label: '30秒以上', value: '30' },
  { label: '1分以上',  value: '60' },
  { label: '3分以上',  value: '180' },
  { label: '5分以上',  value: '300' },
]
const STATUS_OPTS = ['ANSWERED', 'NO ANSWER', 'BUSY'] as const

function fmtDate(s: string) {
  const d = new Date(new Date(s).getTime() + 9 * 60 * 60 * 1000)
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}
function fmtSec(s: number) {
  if (!s) return '-'
  const m = Math.floor(s / 60)
  return m ? `${m}分${s % 60 ? s % 60 + '秒' : ''}` : `${s}秒`
}

export default function CallsClient({
  calls, total, page, filters, memos: initialMemos, excludeIntDefault,
}: {
  calls: Call[]; total: number; page: number
  filters: CallsFilters; memos: Memo[]; excludeIntDefault: boolean
}) {
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

  // ── memo editing state ──
  const [memoMap, setMemoMap] = useState<Map<string, { name: string; note?: string }>>(
    () => new Map(initialMemos.map(m => [m.caller, { name: m.name, note: m.note }]))
  )
  const [editingId,   setEditingId]   = useState<number | null>(null)
  const [editCaller,  setEditCaller]  = useState('')
  const [editName,    setEditName]    = useState('')
  const [editNote,    setEditNote]    = useState('')
  const [saving,      setSaving]      = useState(false)

  // ── URL builder ──
  function buildUrl(ov: {
    q?: string; from?: string; to?: string
    brands?: Set<string>; statuses?: Set<string>
    minDur?: string; excludeInt?: boolean; hasMemo?: boolean; page?: number
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

  function reset() {
    setQ(''); setFrom(''); setTo('')
    setBrands(new Set()); setStatuses(new Set())
    setMinDur(''); setExcludeInt(true); setHasMemo(false)
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
    window.open(`/api/calls-export?${new URLSearchParams(p).toString()}`)
  }

  function clickCaller(caller: string) {
    if (!caller) return
    setQ(caller)
    nav({ q: caller })
  }

  const openEdit = useCallback((id: number, caller: string) => {
    const ex = memoMap.get(caller)
    setEditName(ex?.name ?? '')
    setEditNote(ex?.note ?? '')
    setEditCaller(caller)
    setEditingId(id)
  }, [memoMap])

  async function saveMemo() {
    if (!editName.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/caller-memo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caller: editCaller, name: editName.trim(), note: editNote.trim() || null }),
      })
      if (res.ok) {
        setMemoMap(prev => new Map(prev).set(editCaller, { name: editName.trim(), note: editNote.trim() || undefined }))
        setEditingId(null)
      }
    } finally { setSaving(false) }
  }

  async function deleteMemo() {
    setSaving(true)
    try {
      await fetch('/api/caller-memo', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caller: editCaller }),
      })
      setMemoMap(prev => { const m = new Map(prev); m.delete(editCaller); return m })
      setEditingId(null)
    } finally { setSaving(false) }
  }

  const totalPages = Math.ceil(total / 50)

  return (
    <div className="max-w-6xl mx-auto space-y-4">

      {/* ─── ヘッダー ─── */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">通話履歴</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500">{total.toLocaleString()} 件</span>
          <button onClick={exportCsv}
            className="px-3 py-1.5 rounded bg-emerald-600 text-white text-sm hover:bg-emerald-700 font-medium">
            CSV出力
          </button>
        </div>
      </div>

      {/* ─── フィルターパネル ─── */}
      <div className="bg-white rounded-xl shadow p-4 space-y-3">

        {/* 行1: 電話番号検索 + 日付範囲 */}
        <div className="flex flex-wrap gap-2 items-center">
          <input
            type="text" placeholder="電話番号で検索..."
            value={q} onChange={e => setQ(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && applySearch()}
            className="border rounded px-3 py-1.5 text-sm flex-1 min-w-40"
          />
          <input
            type="date" value={from}
            onChange={e => { setFrom(e.target.value); nav({ from: e.target.value }) }}
            className="border rounded px-3 py-1.5 text-sm"
          />
          <span className="text-slate-400 text-sm">〜</span>
          <input
            type="date" value={to}
            onChange={e => { setTo(e.target.value); nav({ to: e.target.value }) }}
            className="border rounded px-3 py-1.5 text-sm"
          />
          <button onClick={applySearch}
            className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm hover:bg-blue-700">
            検索
          </button>
          <button onClick={reset}
            className="border rounded px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-50">
            リセット
          </button>
        </div>

        {/* 行2: ブランドフィルター + 内線除外 + メモ */}
        <div className="flex flex-wrap gap-2 items-center">
          {BRANDS.map(b => (
            <button key={b.id} onClick={() => toggleBrand(b.id)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                brands.has(b.id) ? b.active : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}>
              {b.label}
            </button>
          ))}
          <div className="ml-auto flex gap-2">
            <button
              onClick={() => { const n = !excludeInt; setExcludeInt(n); nav({ excludeInt: n }) }}
              className={`px-3 py-1 rounded text-xs font-medium border transition-colors ${
                excludeInt
                  ? 'bg-slate-700 text-white border-slate-700'
                  : 'bg-white text-slate-500 border-slate-300 hover:bg-slate-50'
              }`}>
              内線除外 {excludeInt ? 'ON' : 'OFF'}
            </button>
            <button
              onClick={() => { const n = !hasMemo; setHasMemo(n); nav({ hasMemo: n }) }}
              className={`px-3 py-1 rounded text-xs font-medium border transition-colors ${
                hasMemo
                  ? 'bg-amber-500 text-white border-amber-500'
                  : 'bg-white text-slate-500 border-slate-300 hover:bg-slate-50'
              }`}>
              メモあり
            </button>
          </div>
        </div>

        {/* 行3: ステータス + 通話時間 */}
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500 shrink-0">ステータス:</span>
            {STATUS_OPTS.map(s => (
              <label key={s} className="flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={statuses.has(s)} onChange={() => toggleStatus(s)} className="rounded" />
                <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${STATUS_STYLE[s]}`}>
                  {STATUS_LABEL[s]}
                </span>
              </label>
            ))}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-slate-500 shrink-0">通話時間:</span>
            <select value={minDur}
              onChange={e => { setMinDur(e.target.value); nav({ minDur: e.target.value }) }}
              className="border rounded px-2 py-1 text-xs">
              {DUR_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* ─── テーブル ─── */}
      <div className="bg-white rounded-xl shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-500 border-b bg-slate-50">
              <th className="text-left px-4 py-2">日時</th>
              <th className="text-left px-4 py-2">発信元</th>
              <th className="text-left px-4 py-2">回線</th>
              <th className="text-left px-4 py-2">IVR</th>
              <th className="text-center px-4 py-2">通話時間</th>
              <th className="text-center px-4 py-2">ステータス</th>
            </tr>
          </thead>
          <tbody>
            {calls.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-16 text-slate-400 text-sm">
                  該当する通話がありません
                </td>
              </tr>
            ) : calls.map(c => {
              const memo      = c.caller ? memoMap.get(c.caller) : undefined
              const isEditing = editingId === c.id
              return (
                <tr key={c.id} className="border-b last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-2 text-slate-600 whitespace-nowrap">{fmtDate(c.started_at)}</td>
                  <td className="px-4 py-2">
                    {isEditing ? (
                      <div className="flex flex-col gap-1 min-w-52">
                        <input autoFocus value={editName} onChange={e => setEditName(e.target.value)}
                          placeholder="名前" className="border rounded px-2 py-1 text-xs w-full" />
                        <input value={editNote} onChange={e => setEditNote(e.target.value)}
                          placeholder="メモ（任意）" className="border rounded px-2 py-1 text-xs w-full" />
                        <div className="flex gap-1">
                          <button onClick={saveMemo} disabled={saving || !editName.trim()}
                            className="px-2 py-0.5 rounded bg-blue-600 text-white text-xs disabled:opacity-40">
                            {saving ? '…' : '保存'}
                          </button>
                          {memoMap.has(editCaller) && (
                            <button onClick={deleteMemo} disabled={saving}
                              className="px-2 py-0.5 rounded bg-red-100 text-red-600 text-xs">削除</button>
                          )}
                          <button onClick={() => setEditingId(null)}
                            className="px-2 py-0.5 rounded border text-xs text-slate-500">✕</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-1 group">
                        <div>
                          {(memo?.name || c.caller_name) && (
                            <div className="text-slate-700 font-medium text-xs mb-0.5">
                              {memo?.name || c.caller_name}
                            </div>
                          )}
                          <button onClick={() => clickCaller(c.caller)}
                            className="font-mono text-xs text-blue-600 hover:underline" title="この番号で絞り込み">
                            {c.caller || '—'}
                          </button>
                          {memo?.note && (
                            <div className="text-xs text-slate-400 mt-0.5">{memo.note}</div>
                          )}
                        </div>
                        {c.caller && (
                          <button onClick={() => openEdit(c.id, c.caller)}
                            className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-600 text-xs mt-0.5 transition-opacity"
                            title="メモを登録">
                            ✏️
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2 font-medium text-slate-700">{c.line_name || '—'}</td>
                  <td className="px-4 py-2 text-xs text-slate-500 max-w-48 truncate">{c.ivr_route || '—'}</td>
                  <td className="px-4 py-2 text-center text-slate-600">{fmtSec(c.duration_sec)}</td>
                  <td className="px-4 py-2 text-center">
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${STATUS_STYLE[c.status] || 'bg-slate-100 text-slate-500'}`}>
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
          <span className="px-3 py-1.5 text-sm text-slate-600">{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => router.push(buildUrl({ page: page + 1 }))}
            className="px-3 py-1.5 rounded border text-sm disabled:opacity-40">▶</button>
        </div>
      )}
    </div>
  )
}
