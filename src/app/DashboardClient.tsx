'use client'
import { useMemo, useState, useEffect, useCallback } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

// ─── ブランド定義 ────────────────────────────────────────────────
type Brand = { id: string; label: string; lines: string[]; active: string }
const BRANDS: Brand[] = [
  { id: '水炊き',     label: '水炊き・もつ鍋', lines: ['水炊き・もつ鍋'],                            active: 'bg-orange-500 text-white' },
  { id: 'gates',      label: 'gates',           lines: ['gates', '1_gates', '西新'],                  active: 'bg-blue-600 text-white'   },
  { id: 'SmileFood',  label: 'SmileFood',        lines: ['SmileFood'],                                  active: 'bg-emerald-600 text-white' },
  { id: 'CoSmile',    label: 'CoSmile',          lines: ['CoSmile'],                                    active: 'bg-amber-500 text-white'  },
  { id: 'SmileEstate',label: 'SmileEstate',      lines: ['SmileEstate'],                                active: 'bg-violet-600 text-white' },
  { id: 'GACHA',      label: 'GACHA',            lines: ['GACHA'],                                      active: 'bg-red-600 text-white'    },
  { id: 'クリマ',     label: 'クリマバイト',     lines: ['クリマバイト', 'スタッフ中洲', '求人中洲'],  active: 'bg-pink-600 text-white'   },
]
const BRAND_IDS = BRANDS.map(b => b.id)

// ─── 型 ──────────────────────────────────────────────────────────
type Call      = { status: string; duration_sec?: number; line_name?: string }
type Monthly   = { month: string; line_name: string; call_count: number }
type DailyRow  = { call_date: string; line_name: string; call_count: number; answered: number; no_answer: number }

const LINE_COLORS: Record<string, string> = {
  'gates':'#3b82f6','SmileFood':'#10b981','CoSmile':'#f59e0b','SmileEstate':'#8b5cf6',
  'GACHA':'#ef4444','tenjin':'#06b6d4','1_gates':'#84cc16','水炊き・もつ鍋':'#f97316',
  'クリマバイト':'#ec4899','Central':'#6366f1','西新':'#0ea5e9','スタッフ中洲':'#f43f5e','求人中洲':'#a855f7',
}

// ─── ユーティリティ ───────────────────────────────────────────────
function kpi(calls: { status: string }[]) {
  const total = calls.length, answered = calls.filter(c => c.status === 'ANSWERED').length
  return { total, answered, missed: calls.filter(c => c.status === 'NO ANSWER').length, rate: total ? Math.round(answered / total * 100) : 0 }
}

function Delta({ cur, prv, reverse = false }: { cur: number; prv: number; reverse?: boolean }) {
  if (!prv) return null
  const d = cur - prv, good = reverse ? d <= 0 : d >= 0
  return <span className={good ? 'text-green-500' : 'text-red-500'}>{d >= 0 ? '▲' : '▼'}{Math.abs(d)}</span>
}

function localDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ─── 今日のリアルタイム統計 ──────────────────────────────────────
type TodayData = { total: number; answered: number; missed: number; rate: number; updatedAt: string }

function TodayStats() {
  const [data, setData] = useState<TodayData | null>(null)

  const load = useCallback(() => {
    fetch('/api/today-stats').then(r => r.json()).then(setData).catch(() => {})
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, 30000)
    return () => clearInterval(id)
  }, [load])

  return (
    <div className="bg-white rounded-xl shadow p-4">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-sm font-bold text-slate-700">今日の着信</h2>
        {data ? (
          <span className="flex items-center gap-1 text-xs text-slate-400">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse inline-block" />
            {data.updatedAt} 更新
          </span>
        ) : (
          <span className="text-xs text-slate-400 animate-pulse">読み込み中…</span>
        )}
      </div>
      {data ? (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: '総着信', value: data.total, unit: '件', cls: 'text-slate-800' },
            { label: '応答',   value: data.answered, unit: '件', cls: 'text-green-600' },
            { label: '不在',   value: data.missed, unit: '件', cls: 'text-red-500' },
            { label: '応答率', value: data.rate, unit: '%', cls: data.rate >= 80 ? 'text-green-600' : data.rate >= 50 ? 'text-amber-500' : 'text-red-500' },
          ].map(k => (
            <div key={k.label} className="text-center">
              <div className="text-xs text-slate-400 mb-1">{k.label}</div>
              <div className={`text-xl font-bold ${k.cls}`}>{k.value}<span className="text-xs font-normal ml-0.5">{k.unit}</span></div>
            </div>
          ))}
        </div>
      ) : (
        <div className="h-12 bg-slate-100 rounded animate-pulse" />
      )}
    </div>
  )
}

// ─── 応答率ゲージ ────────────────────────────────────────────────
function GoalGauge({ rate }: { rate: number }) {
  const [goal, setGoal] = useState(80)
  const [editing, setEditing] = useState(false)
  const [input, setInput] = useState('')

  useEffect(() => {
    const v = localStorage.getItem('naisen_goal_rate')
    if (v) setGoal(parseInt(v))
  }, [])

  function saveGoal() {
    const v = parseInt(input)
    if (v >= 1 && v <= 100) {
      setGoal(v); localStorage.setItem('naisen_goal_rate', String(v))
    }
    setEditing(false)
  }

  const pct = Math.min(Math.max(rate, 0), 100)
  const gPct = Math.min(Math.max(goal, 0), 100)

  function pt(p: number) {
    const θ = Math.PI * (1 - p / 100)
    return { x: +(50 + 40 * Math.cos(θ)).toFixed(2), y: +(50 - 40 * Math.sin(θ)).toFixed(2) }
  }

  const ep = pt(pct)
  const gp = pt(gPct)
  const gInner = { x: +(50 + 32 * Math.cos(Math.PI * (1 - gPct / 100))).toFixed(2), y: +(50 - 32 * Math.sin(Math.PI * (1 - gPct / 100))).toFixed(2) }

  const fillPath = pct <= 0 ? null
    : pct >= 100 ? 'M 10 50 A 40 40 0 0 0 90 50'
    : `M 10 50 A 40 40 0 0 0 ${ep.x} ${ep.y}`

  const fillColor = rate >= goal ? '#22c55e' : rate >= goal - 10 ? '#f59e0b' : '#ef4444'

  return (
    <div className="bg-white rounded-xl shadow p-4 flex flex-col items-center">
      <h2 className="text-sm font-bold text-slate-700 mb-2 self-start">応答率ゲージ（今月）</h2>
      <svg viewBox="0 0 100 58" className="w-44">
        <path d="M 10 50 A 40 40 0 0 0 90 50" fill="none" stroke="#e2e8f0" strokeWidth="8" strokeLinecap="round" />
        {fillPath && <path d={fillPath} fill="none" stroke={fillColor} strokeWidth="8" strokeLinecap="round" />}
        <line x1={gInner.x} y1={gInner.y} x2={gp.x} y2={gp.y} stroke="#64748b" strokeWidth="2.5" strokeLinecap="round" />
        <text x="50" y="47" textAnchor="middle" fontSize="15" fontWeight="bold" fill={fillColor}>{rate}%</text>
        <text x="50" y="56" textAnchor="middle" fontSize="7" fill="#94a3b8">目標 {goal}%</text>
      </svg>
      <div className="mt-1">
        {editing ? (
          <div className="flex items-center gap-1">
            <input autoFocus value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveGoal(); if (e.key === 'Escape') setEditing(false) }}
              placeholder="1-100" className="border rounded px-2 py-0.5 text-xs w-20 text-center" />
            <button onClick={saveGoal} className="px-2 py-0.5 rounded bg-blue-600 text-white text-xs">設定</button>
            <button onClick={() => setEditing(false)} className="px-1 py-0.5 text-xs text-slate-400">✕</button>
          </div>
        ) : (
          <button onClick={() => { setInput(String(goal)); setEditing(true) }}
            className="text-xs text-slate-400 hover:text-slate-600 underline">目標を変更</button>
        )}
      </div>
    </div>
  )
}

// ─── ヒートマップ ────────────────────────────────────────────────
type HeatmapDay = { call_date: string; call_count: number }
function Heatmap({ days }: { days: HeatmapDay[] }) {
  const countMap = new Map(days.map(d => [d.call_date, d.call_count]))
  const max      = Math.max(...days.map(d => d.call_count), 1)

  const today   = new Date()
  const allDays = Array.from({ length: 365 }, (_, i) => {
    const d = new Date(today); d.setDate(today.getDate() - (364 - i))
    const s = localDate(d)
    return { date: s, count: countMap.get(s) ?? 0 }
  })

  const firstDow = new Date(allDays[0].date + 'T12:00:00Z').getDay()
  const pad      = firstDow === 0 ? 6 : firstDow - 1
  const padded   = [...Array(pad).fill(null), ...allDays] as ({ date: string; count: number } | null)[]
  const totalCols = Math.ceil(padded.length / 7)

  function color(n: number) {
    if (n === 0) return '#f1f5f9'
    const r = n / max
    if (r < 0.2) return '#bbf7d0'; if (r < 0.4) return '#86efac'
    if (r < 0.6) return '#4ade80'; if (r < 0.8) return '#22c55e'; return '#16a34a'
  }

  const monthLabels: { col: number; label: string }[] = []
  let lastM = ''
  padded.forEach((d, i) => {
    if (!d) return
    const m = d.date.slice(0, 7)
    if (m !== lastM) { monthLabels.push({ col: Math.floor(i / 7), label: d.date.slice(5, 7) + '月' }); lastM = m }
  })

  return (
    <div className="overflow-x-auto">
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${totalCols}, 14px)`, gap: '2px', marginBottom: 4, marginLeft: 28 }}>
        {Array.from({ length: totalCols }, (_, col) => (
          <div key={col} style={{ fontSize: 9 }} className="text-slate-400">{monthLabels.find(m => m.col === col)?.label ?? ''}</div>
        ))}
      </div>
      <div className="flex gap-1">
        <div style={{ display: 'grid', gridTemplateRows: 'repeat(7, 14px)', gap: '2px' }}>
          {['月','','水','','金','','日'].map((l, i) => (
            <div key={i} style={{ fontSize: 9, width: 20, height: 14, lineHeight: '14px', textAlign: 'right', paddingRight: 4 }} className="text-slate-400">{l}</div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateRows: 'repeat(7, 14px)', gridAutoFlow: 'column', gap: '2px' }}>
          {padded.map((d, i) =>
            d ? <div key={i} title={`${d.date}: ${d.count}件`} style={{ width: 14, height: 14, background: color(d.count), borderRadius: 2 }} />
              : <div key={i} style={{ width: 14, height: 14 }} />
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 mt-2 justify-end">
        <span className="text-xs text-slate-400">少</span>
        {['#f1f5f9','#bbf7d0','#86efac','#4ade80','#22c55e','#16a34a'].map(c => (
          <div key={c} style={{ width: 12, height: 12, background: c, borderRadius: 2 }} />
        ))}
        <span className="text-xs text-slate-400">多</span>
      </div>
    </div>
  )
}

// ─── メインコンポーネント ─────────────────────────────────────────
export default function DashboardClient({
  thisMonth, lastMonth, monthly, byLine, totalCount,
  thisWeek, lastWeek, dailyRows, sameDayLM,
}: {
  thisMonth: Call[]; lastMonth: { status: string; line_name?: string }[]
  monthly: Monthly[]; byLine: Call[]; totalCount: number
  thisWeek: { status: string; line_name?: string }[]
  lastWeek: { status: string; line_name?: string }[]
  dailyRows: DailyRow[]
  sameDayLM: { status: string; line_name?: string }[]
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  function toggleAll() {
    setSelected(prev => prev.size === 0 ? new Set(BRAND_IDS) : new Set())
  }
  function toggleBrand(id: string) {
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  const isAll       = selected.size === 0
  const isAllBrands = selected.size === BRAND_IDS.length

  const activeLines = useMemo(() =>
    selected.size === 0 ? null
      : [...selected].flatMap(id => BRANDS.find(b => b.id === id)?.lines ?? [])
  , [selected])

  function fl<T extends { line_name?: string | null }>(arr: T[]): T[] {
    return activeLines ? arr.filter(r => r.line_name && activeLines.includes(r.line_name)) : arr
  }

  const fThisMonth  = useMemo(() => fl(thisMonth),  [thisMonth,  activeLines]) // eslint-disable-line
  const fLastMonth  = useMemo(() => fl(lastMonth),  [lastMonth,  activeLines]) // eslint-disable-line
  const fThisWeek   = useMemo(() => fl(thisWeek),   [thisWeek,   activeLines]) // eslint-disable-line
  const fLastWeek   = useMemo(() => fl(lastWeek),   [lastWeek,   activeLines]) // eslint-disable-line
  const fByLine     = useMemo(() => fl(byLine),     [byLine,     activeLines]) // eslint-disable-line
  const fSameDayLM  = useMemo(() => fl(sameDayLM),  [sameDayLM,  activeLines]) // eslint-disable-line
  const fMonthly    = useMemo(() => activeLines ? monthly.filter(r => activeLines.includes(r.line_name)) : monthly, [monthly, activeLines])
  const fDailyRows  = useMemo(() => activeLines ? dailyRows.filter(r => activeLines.includes(r.line_name)) : dailyRows, [dailyRows, activeLines])

  const heatmap = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of fDailyRows) {
      const k = String(r.call_date).slice(0, 10)
      m.set(k, (m.get(k) ?? 0) + r.call_count)
    }
    return Array.from(m, ([call_date, call_count]) => ({ call_date, call_count }))
  }, [fDailyRows])

  const weeklySummary = useMemo(() => {
    const dayMap = new Map<string, { call_count: number; answered: number; no_answer: number }>()
    for (const r of fDailyRows) {
      const k = String(r.call_date).slice(0, 10)
      const e = dayMap.get(k) ?? { call_count: 0, answered: 0, no_answer: 0 }
      dayMap.set(k, { call_count: e.call_count + r.call_count, answered: e.answered + r.answered, no_answer: e.no_answer + r.no_answer })
    }
    const wm = new Map<string, { total: number; answered: number; no_answer: number }>()
    for (const [ds, v] of dayMap) {
      const d = new Date(ds + 'T12:00:00Z'), dow = d.getDay()
      const mon = new Date(d); mon.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1))
      const wk = localDate(mon)
      const e = wm.get(wk) ?? { total: 0, answered: 0, no_answer: 0 }
      wm.set(wk, { total: e.total + v.call_count, answered: e.answered + v.answered, no_answer: e.no_answer + v.no_answer })
    }
    return Array.from(wm, ([week, v]) => ({ week, ...v, rate: v.total ? Math.round(v.answered / v.total * 100) : 0 }))
      .sort((a, b) => b.week.localeCompare(a.week)).slice(0, 8).reverse()
  }, [fDailyRows])

  const cur      = kpi(fThisMonth), prv = kpi(fLastMonth)
  const curW     = kpi(fThisWeek),  prvW = kpi(fLastWeek)
  const sdlm     = kpi(fSameDayLM)

  const chartData = useMemo(() => {
    const acc: Record<string, Record<string, number | string>> = {}
    for (const r of fMonthly) {
      const m = r.month.slice(0, 7)
      if (!acc[m]) acc[m] = { month: m }
      acc[m][r.line_name] = ((acc[m][r.line_name] as number) || 0) + r.call_count
    }
    return Object.values(acc).slice(-12)
  }, [fMonthly])
  const topLines = useMemo(() => Array.from(new Set(fMonthly.map(r => r.line_name))).slice(0, 8), [fMonthly])

  const lineArr = useMemo(() => {
    const m: Record<string, { total: number; answered: number }> = {}
    for (const r of fByLine) {
      if (!r.line_name) continue
      if (!m[r.line_name]) m[r.line_name] = { total: 0, answered: 0 }
      m[r.line_name].total++
      if (r.status === 'ANSWERED') m[r.line_name].answered++
    }
    return Object.entries(m)
      .map(([name, v]) => ({ name, ...v, missed: v.total - v.answered, rate: Math.round(v.answered / v.total * 100) }))
      .sort((a, b) => b.total - a.total)
  }, [fByLine])

  const kpiItems = [
    { label: '総着信',  value: cur.total,   prev: prv.total,   sdlm: sdlm.total,   week: curW.total,   weekPrev: prvW.total,   unit: '件' },
    { label: '応答',   value: cur.answered, prev: prv.answered, sdlm: sdlm.answered, week: curW.answered, weekPrev: prvW.answered, unit: '件' },
    { label: '不在',   value: cur.missed,   prev: prv.missed,   sdlm: sdlm.missed,   week: curW.missed,   weekPrev: prvW.missed,   unit: '件', rev: true },
    { label: '応答率', value: cur.rate,     prev: prv.rate,     sdlm: sdlm.rate,     week: curW.rate,     weekPrev: prvW.rate,     unit: '%'  },
  ]

  return (
    <div className="max-w-6xl mx-auto space-y-6">

      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">ダッシュボード</h1>
        <span className="text-sm text-slate-500">DB登録件数 <span className="font-semibold text-slate-700">{totalCount.toLocaleString()} 件</span></span>
      </div>

      {/* 今日のリアルタイム + ゲージ */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <TodayStats />
        </div>
        <GoalGauge rate={cur.rate} />
      </div>

      {/* ブランドフィルター */}
      <div className="bg-white rounded-xl shadow p-3 flex flex-wrap gap-2 items-center">
        <span className="text-xs text-slate-400 mr-1">ブランド</span>
        <button
          onClick={toggleAll}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${isAll || isAllBrands ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
        >
          全体
        </button>
        <div className="w-px h-5 bg-slate-200 mx-1" />
        {BRANDS.map(brand => (
          <button
            key={brand.id}
            onClick={() => toggleBrand(brand.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${selected.has(brand.id) ? brand.active : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
          >
            {brand.label}
          </button>
        ))}
        {!isAll && (
          <button onClick={() => setSelected(new Set())} className="ml-auto text-xs text-slate-400 hover:text-slate-600">✕ リセット</button>
        )}
      </div>

      {/* KPI カード */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpiItems.map(k => (
          <div key={k.label} className="bg-white rounded-xl shadow p-4">
            <div className="text-xs text-slate-500 mb-1">{k.label}（今月）</div>
            <div className="text-2xl font-bold text-slate-800">{k.value}<span className="text-sm font-normal ml-1">{k.unit}</span></div>
            <div className="text-xs text-slate-400 mt-1">先月比 <Delta cur={k.value} prv={k.prev} reverse={k.rev} /></div>
            <div className="text-xs text-slate-400">先月同日 <span className="text-slate-600 font-medium">{k.sdlm}{k.unit}</span> <Delta cur={k.value} prv={k.sdlm} reverse={k.rev} /></div>
            <div className="mt-2 pt-2 border-t border-slate-100 text-xs text-slate-500 flex items-center justify-between">
              <span>今週 <span className="font-semibold text-slate-700">{k.week}{k.unit}</span></span>
              <Delta cur={k.week} prv={k.weekPrev} reverse={k.rev} />
            </div>
          </div>
        ))}
      </div>

      {/* ヒートマップ */}
      <div className="bg-white rounded-xl shadow p-4">
        <h2 className="text-sm font-bold text-slate-700 mb-4">年間カレンダーヒートマップ（過去365日）</h2>
        <Heatmap days={heatmap} />
      </div>

      {/* 週次サマリー */}
      <div className="bg-white rounded-xl shadow p-4">
        <h2 className="text-sm font-bold text-slate-700 mb-3">週次サマリー（直近8週）</h2>
        <table className="w-full text-sm">
          <thead><tr className="text-xs text-slate-500 border-b">
            <th className="text-left py-2 pr-4">週（月曜日）</th>
            <th className="text-right py-2 pr-4">総着信</th>
            <th className="text-right py-2 pr-4">応答</th>
            <th className="text-right py-2 pr-4">不在</th>
            <th className="text-right py-2">応答率</th>
          </tr></thead>
          <tbody>
            {weeklySummary.map(w => (
              <tr key={w.week} className="border-b last:border-0 hover:bg-slate-50">
                <td className="py-2 pr-4 text-slate-600 font-mono text-xs">{w.week}</td>
                <td className="text-right py-2 pr-4">{w.total.toLocaleString()}</td>
                <td className="text-right py-2 pr-4 text-green-600">{w.answered.toLocaleString()}</td>
                <td className="text-right py-2 pr-4 text-red-500">{w.no_answer.toLocaleString()}</td>
                <td className="text-right py-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold ${w.rate>=80?'bg-green-100 text-green-700':w.rate>=50?'bg-yellow-100 text-yellow-700':'bg-red-100 text-red-700'}`}>{w.rate}%</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 月別チャート */}
      <div className="bg-white rounded-xl shadow p-4">
        <h2 className="text-sm font-bold text-slate-700 mb-3">月別着信数（回線別）</h2>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData}>
            <XAxis dataKey="month" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip />
            {topLines.map(line => <Bar key={line} dataKey={line} stackId="a" fill={LINE_COLORS[line] || '#94a3b8'} name={line} />)}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* 回線別サマリー */}
      <div className="bg-white rounded-xl shadow p-4">
        <h2 className="text-sm font-bold text-slate-700 mb-3">回線別サマリー（今月）</h2>
        {lineArr.length === 0
          ? <p className="text-sm text-slate-400 py-4 text-center">データなし</p>
          : (
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-slate-500 border-b">
              <th className="text-left py-2 pr-4">回線</th>
              <th className="text-right py-2 pr-4">総着信</th>
              <th className="text-right py-2 pr-4">応答</th>
              <th className="text-right py-2 pr-4">不在</th>
              <th className="text-right py-2">応答率</th>
            </tr></thead>
            <tbody>
              {lineArr.map(l => (
                <tr key={l.name} className={`border-b last:border-0 transition-colors ${l.rate<50?'bg-red-50 hover:bg-red-100':l.rate<70?'bg-yellow-50 hover:bg-yellow-100':'hover:bg-slate-50'}`}>
                  <td className="py-2 pr-4 font-medium">
                    <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ background: LINE_COLORS[l.name] || '#94a3b8' }} />
                    {l.name}
                    {l.rate < 50 && <span className="ml-2 text-xs font-normal text-red-500">⚠ 不在多</span>}
                  </td>
                  <td className="text-right py-2 pr-4">{l.total}</td>
                  <td className="text-right py-2 pr-4 text-green-600">{l.answered}</td>
                  <td className="text-right py-2 pr-4 text-red-500">{l.missed}</td>
                  <td className="text-right py-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${l.rate>=80?'bg-green-100 text-green-700':l.rate>=50?'bg-yellow-100 text-yellow-700':'bg-red-100 text-red-700'}`}>{l.rate}%</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
