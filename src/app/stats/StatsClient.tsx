'use client'
import { useMemo, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, PieChart, Pie, Cell,
} from 'recharts'
import { BRANDS, BRAND_IDS, getActiveLines, isInternalCaller } from '@/lib/brands'

// ─── 型定義 ───────────────────────────────────────────────────────
type Hourly   = { hour: number; line_name: string; call_count: number; answered: number }
// monthly は aggregateCalls で生成: answered / no_answer を直接持つ
type Monthly  = { month: string; line_name: string; call_count: number; answered: number; no_answer: number }
type DailyRow = { call_date: string; line_name: string; call_count: number; answered: number; no_answer: number }
type TopCaller   = { caller: string; line_name: string; call_count: number; answered: number; no_answer: number; last_called_at: string }
type AvgDuration = { line_name: string; answered_count: number; avg_sec: number }
type DurationDist  = { bucket: string; sort_order: number; call_count: number }
type RepeatAnalysis = { caller_type: string; caller_count: number; call_count: number }
type IvrRoute = { ivr_route: string; line_name: string; call_count: number; answered: number; no_answer: number; answer_rate: number }

const LINE_COLORS: Record<string, string> = {
  'gates':'#3b82f6','SmileFood':'#10b981','CoSmile':'#f59e0b','SmileEstate':'#8b5cf6',
  'GACHA':'#ef4444','tenjin':'#06b6d4','1_gates':'#84cc16','水炊き・もつ鍋':'#f97316',
  'クリマバイト':'#ec4899','Central':'#6366f1','西新':'#0ea5e9',
}
const PIE_COLORS = ['#3b82f6', '#f59e0b']
const PERIOD_OPTIONS = [
  { value: 'this_month', label: '今月'   },
  { value: 'last_month', label: '先月'   },
  { value: '3m',         label: '3ヶ月'  },
  { value: '6m',         label: '6ヶ月'  },
  { value: '1y',         label: '1年'    },
  { value: 'all',        label: '全期間' },
  { value: 'custom',     label: 'カスタム'},
]

function fmtSec(s: number) {
  if (!s) return '-'
  const m = Math.floor(s / 60)
  return m ? `${m}分${s % 60 ? s % 60 + '秒' : ''}` : `${s}秒`
}

// ─── 時間帯×回線 ヒートマップ ────────────────────────────────────
function HourLineHeatmap({ hourly }: { hourly: Hourly[] }) {
  const lines    = useMemo(() => Array.from(new Set(hourly.map(r => r.line_name))).filter(Boolean).sort(), [hourly])
  const maxCount = useMemo(() => Math.max(...hourly.map(r => r.call_count), 1), [hourly])
  const dataMap  = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of hourly) if (r.line_name) m.set(`${r.hour}|${r.line_name}`, r.call_count)
    return m
  }, [hourly])

  function cellColor(n: number) {
    if (n === 0) return '#f8fafc'
    const r = n / maxCount
    if (r < 0.2) return '#dbeafe'
    if (r < 0.4) return '#93c5fd'
    if (r < 0.6) return '#60a5fa'
    if (r < 0.8) return '#3b82f6'
    return '#1d4ed8'
  }

  if (lines.length === 0) return null
  return (
    <div className="overflow-x-auto">
      <table className="text-xs border-collapse w-full">
        <thead>
          <tr>
            <th className="text-left px-2 py-1 text-gray-400 dark:text-gray-500 font-normal w-24">回線 ＼ 時間</th>
            {Array.from({ length: 24 }, (_, h) => (
              <th key={h} className="px-1 py-1 text-gray-400 dark:text-gray-500 font-normal text-center w-8">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map(line => (
            <tr key={line}>
              <td className="px-2 py-1 text-slate-600 font-medium whitespace-nowrap">{line}</td>
              {Array.from({ length: 24 }, (_, h) => {
                const n = dataMap.get(`${h}|${line}`) ?? 0
                return (
                  <td key={h} title={`${line} ${h}時: ${n}件`}
                    style={{ background: cellColor(n), width: 28, height: 22 }}
                    className="text-center border border-white/50 rounded">
                    {n > 0 && <span style={{ color: n / maxCount > 0.5 ? '#fff' : '#1e40af', fontSize: 9 }}>{n}</span>}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center gap-1 mt-2 justify-end">
        <span className="text-xs text-gray-400 dark:text-gray-500">少</span>
        {['#f8fafc','#dbeafe','#93c5fd','#60a5fa','#3b82f6','#1d4ed8'].map(c => (
          <div key={c} style={{ width: 12, height: 12, background: c, borderRadius: 2 }} />
        ))}
        <span className="text-xs text-gray-400 dark:text-gray-500">多</span>
      </div>
    </div>
  )
}

// ─── メイン ──────────────────────────────────────────────────────
export default function StatsClient({
  period, periodFrom, periodTo,
  hourly, dailyRows, monthly,
  topCallers, avgDuration, durationDist, repeatAnalysis, ivrRoutes,
}: {
  period: string; periodFrom?: string; periodTo?: string
  hourly: Hourly[]; dailyRows: DailyRow[]; monthly: Monthly[]
  topCallers: TopCaller[]; avgDuration: AvgDuration[]
  durationDist: DurationDist[]; repeatAnalysis: RepeatAnalysis[]
  ivrRoutes: IvrRoute[]
}) {
  const router   = useRouter()
  const pathname = usePathname()

  // ── フィルター状態 ──
  const [selected,    setSelected]    = useState<Set<string>>(new Set())
  const [excludeInt,  setExcludeInt]  = useState(true)
  const [customFrom,  setCustomFrom]  = useState(periodFrom ?? '')
  const [customTo,    setCustomTo]    = useState(periodTo   ?? '')

  const isAll       = selected.size === 0
  const activeLines = useMemo(() => getActiveLines(selected), [selected])

  function toggleBrand(id: string) {
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }
  function toggleAll() {
    setSelected(prev => prev.size === 0 ? new Set(BRAND_IDS) : new Set())
  }
  function navPeriod(p: string, from?: string, to?: string) {
    const params = new URLSearchParams({ period: p })
    if (p === 'custom' && from && to) { params.set('from', from); params.set('to', to) }
    router.push(`${pathname}?${params.toString()}`)
  }

  // ── ブランドフィルタ関数 ──
  function flLine<T extends { line_name?: string | null }>(arr: T[]): T[] {
    if (!activeLines) return arr
    return arr.filter(r => r.line_name && activeLines.includes(r.line_name))
  }

  // ── フィルタ済みデータ ──
  const fHourly    = useMemo(() => flLine(hourly),    [hourly,    activeLines]) // eslint-disable-line
  const fDailyRows = useMemo(() => flLine(dailyRows), [dailyRows, activeLines]) // eslint-disable-line
  const fMonthly   = useMemo(() => flLine(monthly),   [monthly,   activeLines]) // eslint-disable-line
  const fAvgDur    = useMemo(() => flLine(avgDuration), [avgDuration, activeLines]) // eslint-disable-line
  const fIvr       = useMemo(() => flLine(ivrRoutes), [ivrRoutes, activeLines]) // eslint-disable-line
  const fTopCallers = useMemo(() =>
    excludeInt ? topCallers.filter(c => !isInternalCaller(c.caller)) : topCallers
  , [topCallers, excludeInt])

  // ── 曜日別（dailyRows から集計） ──
  const dowData = useMemo(() => {
    const DOW = ['日','月','火','水','木','金','土']
    const map = DOW.map((label, i) => ({ dow: i, label, total: 0, answered: 0, no_answer: 0 }))
    for (const r of fDailyRows) {
      const d = new Date(String(r.call_date).slice(0, 10) + 'T12:00:00Z').getDay()
      map[d].total     += r.call_count
      map[d].answered  += r.answered
      map[d].no_answer += r.no_answer
    }
    return [1,2,3,4,5,6,0].map(i => map[i])
  }, [fDailyRows])

  // ── 時間帯別全体 ──
  const hourlyTotal = useMemo(() => Array.from({ length: 24 }, (_, h) => {
    const rows = fHourly.filter(r => r.hour === h)
    const total    = rows.reduce((s, r) => s + r.call_count, 0)
    const answered = rows.reduce((s, r) => s + r.answered, 0)
    return { hour: `${h}時`, total, answered, missed: total - answered }
  }), [fHourly])

  const missedRanking = useMemo(() =>
    [...hourlyTotal].sort((a, b) => b.missed - a.missed).slice(0, 10)
  , [hourlyTotal])

  // ── 月別トレンド（answered を使う） ──
  const { trendData, trendLines } = useMemo(() => {
    const months = Array.from(new Set(fMonthly.map(r => r.month.slice(0, 7)))).sort()
    const lines  = Array.from(new Set(fMonthly.map(r => r.line_name).filter(Boolean)))
    const data   = months.slice(-12).map(m => {
      const row: Record<string, string | number> = { month: m }
      lines.forEach(l => {
        row[l] = fMonthly.find(r => r.month.slice(0, 7) === m && r.line_name === l)?.answered || 0
      })
      return row
    })
    return { trendData: data, trendLines: lines }
  }, [fMonthly])

  // ── 応答率（monthly から直接集計） ──
  const rateData = useMemo(() => {
    const map: Record<string, { total: number; answered: number }> = {}
    for (const r of fMonthly) {
      if (!r.line_name) continue
      if (!map[r.line_name]) map[r.line_name] = { total: 0, answered: 0 }
      map[r.line_name].total    += r.call_count
      map[r.line_name].answered += r.answered
    }
    return Object.entries(map)
      .map(([name, v]) => ({ name, rate: Math.round(v.answered / v.total * 100), total: v.total }))
      .sort((a, b) => b.total - a.total).slice(0, 10)
  }, [fMonthly])

  // ── IVR 集計 ──
  const ivrSummary = useMemo(() => {
    const map: Record<string, { call_count: number; answered: number; no_answer: number }> = {}
    for (const r of fIvr) {
      if (!r.ivr_route) continue
      if (!map[r.ivr_route]) map[r.ivr_route] = { call_count: 0, answered: 0, no_answer: 0 }
      map[r.ivr_route].call_count += Number(r.call_count)
      map[r.ivr_route].answered   += Number(r.answered)
      map[r.ivr_route].no_answer  += Number(r.no_answer)
    }
    return Object.entries(map)
      .map(([route, v]) => ({ route, ...v, rate: Math.round(v.answered / v.call_count * 100) }))
      .sort((a, b) => b.call_count - a.call_count).slice(0, 20)
  }, [fIvr])

  // ── 平均通話時間 最大値 ──
  const maxAvg = Math.max(...fAvgDur.map(r => r.avg_sec), 1)

  // ── リピーター分析 ──
  const totalCallers  = repeatAnalysis.reduce((s, r) => s + Number(r.caller_count), 0)
  const repeaterRow   = repeatAnalysis.find(r => r.caller_type === 'リピーター')
  const firstTimeRow  = repeatAnalysis.find(r => r.caller_type === '初回')
  const callerPieData = repeatAnalysis.map(r => ({ name: r.caller_type, value: Number(r.caller_count) }))
  const callPieData   = repeatAnalysis.map(r => ({ name: r.caller_type, value: Number(r.call_count) }))

  // ── レンダリング ─────────────────────────────────────────────────
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <h1 className="text-xl font-bold text-gray-800 dark:text-gray-200">分析</h1>

      {/* フィルターパネル */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-3 space-y-2">
        {/* 期間 */}
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-gray-400 dark:text-gray-500 w-12 shrink-0">期間</span>
          {PERIOD_OPTIONS.map(opt => (
            <button key={opt.value} onClick={() => navPeriod(opt.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${period === opt.value ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-slate-200'}`}>
              {opt.label}
            </button>
          ))}
          {period === 'custom' && (
            <div className="flex items-center gap-1 ml-2">
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="border dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 rounded px-2 py-1 text-xs" />
              <span className="text-xs text-gray-400 dark:text-gray-500">〜</span>
              <input type="date" value={customTo}   onChange={e => setCustomTo(e.target.value)}   className="border dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 rounded px-2 py-1 text-xs" />
              <button onClick={() => navPeriod('custom', customFrom, customTo)}
                className="px-2 py-1 rounded bg-indigo-600 text-white text-xs">適用</button>
            </div>
          )}
        </div>

        {/* ブランド */}
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-gray-400 dark:text-gray-500 w-12 shrink-0">ブランド</span>
          <button onClick={toggleAll}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${isAll ? 'bg-slate-700 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-slate-200'}`}>
            全体
          </button>
          <div className="w-px h-5 bg-slate-200" />
          {BRANDS.map(brand => (
            <button key={brand.id} onClick={() => toggleBrand(brand.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${selected.has(brand.id) ? brand.active : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-slate-200'}`}>
              {brand.label}
            </button>
          ))}
          {!isAll && <button onClick={() => setSelected(new Set())} className="text-xs text-gray-400 dark:text-gray-500 hover:text-slate-600">✕</button>}
          <button onClick={() => setExcludeInt(v => !v)}
            className={`ml-auto px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${excludeInt ? 'bg-slate-700 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-slate-200'}`}>
            {excludeInt ? '内線除外中' : '内線含む'}
          </button>
        </div>
      </div>

      {/* 曜日別 + 不在時間帯ランキング */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
          <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">曜日別着信数</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={dowData}>
              <XAxis dataKey="label" tick={{ fontSize: 13 }} /><YAxis tick={{ fontSize: 10 }} /><Tooltip />
              <Bar dataKey="answered"  stackId="a" fill="#3b82f6" name="応答" />
              <Bar dataKey="no_answer" stackId="a" fill="#f87171" name="不在" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
          <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">不在着信の多い時間帯（TOP10）</h2>
          <div className="space-y-2">
            {missedRanking.map((r, i) => (
              <div key={r.hour} className="flex items-center gap-2">
                <span className={`w-5 text-xs font-bold text-center shrink-0 ${i < 3 ? 'text-red-500' : 'text-slate-400'}`}>{i + 1}</span>
                <span className="w-10 text-sm text-slate-600 shrink-0">{r.hour}</span>
                <div className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-full h-4 overflow-hidden">
                  <div className="h-full bg-red-400 rounded-full" style={{ width: `${Math.round(r.missed / (missedRanking[0]?.missed || 1) * 100)}%` }} />
                </div>
                <span className="text-xs text-gray-500 dark:text-gray-400 w-14 text-right shrink-0">{r.missed.toLocaleString()}件</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* リピーター分析（件数は period によって変わる） */}
      {repeatAnalysis.length > 0 && (totalCallers > 0) && (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
          <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-4">リピーター分析</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
            <div className="space-y-3">
              {repeatAnalysis.map(r => (
                <div key={r.caller_type} className="flex items-start gap-3">
                  <div className={`w-3 h-3 rounded-full mt-1 shrink-0 ${r.caller_type === 'リピーター' ? 'bg-amber-400' : 'bg-blue-400'}`} />
                  <div>
                    <div className="text-sm font-semibold text-gray-700 dark:text-gray-300">{r.caller_type}</div>
                    <div className="text-xs text-gray-400 dark:text-gray-500">
                      {Number(r.caller_count).toLocaleString()} 番号 · {Number(r.call_count).toLocaleString()} 着信
                      {totalCallers > 0 && (
                        <span className="ml-1 font-medium text-gray-500 dark:text-gray-400">（{Math.round(Number(r.caller_count) / totalCallers * 100)}%）</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {repeaterRow && firstTimeRow && Number(repeaterRow.caller_count) > 0 && (
                <div className="text-xs text-gray-400 dark:text-gray-500 pt-2 border-t">
                  リピーター1人あたり平均{' '}
                  <span className="font-semibold text-slate-600">
                    {(Number(repeaterRow.call_count) / Number(repeaterRow.caller_count)).toFixed(1)}回
                  </span>{' '}着信
                </div>
              )}
            </div>
            <div className="flex flex-col items-center">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">発信元番号の比率</div>
              <PieChart width={160} height={160}>
                <Pie data={callerPieData} cx={80} cy={80} innerRadius={40} outerRadius={70} dataKey="value"
                  label={p => `${p.name ?? ''} ${(((p.percent) ?? 0) * 100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                  {callerPieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </div>
            <div className="flex flex-col items-center">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">着信件数の比率</div>
              <PieChart width={160} height={160}>
                <Pie data={callPieData} cx={80} cy={80} innerRadius={40} outerRadius={70} dataKey="value"
                  label={p => `${p.name ?? ''} ${(((p.percent) ?? 0) * 100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                  {callPieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </div>
          </div>
        </div>
      )}

      {/* 通話時間の分布 */}
      {durationDist.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
          <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">通話時間の分布（応答のみ）</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={durationDist}>
              <XAxis dataKey="bucket" tick={{ fontSize: 12 }} /><YAxis tick={{ fontSize: 10 }} /><Tooltip />
              <Bar dataKey="call_count" fill="#3b82f6" name="件数" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* TOP10 着信番号 */}
      {fTopCallers.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
          <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">着信頻度ランキング TOP10</h2>
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-gray-500 dark:text-gray-400 border-b">
              <th className="text-left py-2 w-8">#</th>
              <th className="text-left py-2 pr-4">電話番号</th>
              <th className="text-right py-2 pr-4">着信数</th>
              <th className="text-right py-2 pr-4">応答</th>
              <th className="text-right py-2 pr-4">不在</th>
              <th className="text-right py-2">最終着信</th>
            </tr></thead>
            <tbody>
              {fTopCallers.map((c, i) => (
                <tr key={c.caller} className="border-b last:border-0 hover:bg-gray-50 dark:bg-gray-800">
                  <td className={`py-2 font-bold text-xs ${i < 3 ? 'text-amber-500' : 'text-slate-400'}`}>{i + 1}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{c.caller}</td>
                  <td className="text-right py-2 pr-4 font-semibold">{c.call_count.toLocaleString()}</td>
                  <td className="text-right py-2 pr-4 text-green-600">{c.answered.toLocaleString()}</td>
                  <td className="text-right py-2 pr-4 text-red-500">{c.no_answer.toLocaleString()}</td>
                  <td className="text-right py-2 text-xs text-gray-400 dark:text-gray-500">
                    {c.last_called_at ? new Date(c.last_called_at).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' }) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 平均通話時間 */}
      {fAvgDur.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
          <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">平均通話時間 回線別（応答のみ）</h2>
          <div className="space-y-2">
            {fAvgDur.map(r => (
              <div key={r.line_name} className="flex items-center gap-3">
                <div className="w-28 text-sm text-right text-slate-600 shrink-0">{r.line_name || '不明'}</div>
                <div className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-full h-6 overflow-hidden">
                  <div className="h-full bg-blue-400 rounded-full flex items-center justify-end pr-2"
                    style={{ width: `${Math.max(Math.round(r.avg_sec / maxAvg * 100), 8)}%` }}>
                    <span className="text-xs font-semibold text-white">{fmtSec(r.avg_sec)}</span>
                  </div>
                </div>
                <div className="text-xs text-gray-400 dark:text-gray-500 w-16 text-right shrink-0">{r.answered_count.toLocaleString()}件</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 時間帯×回線 ヒートマップ */}
      {fHourly.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
          <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">時間帯×回線 ヒートマップ</h2>
          <HourLineHeatmap hourly={fHourly} />
        </div>
      )}

      {/* 時間帯別全体 */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
        <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">時間帯別着信数</h2>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={hourlyTotal}>
            <XAxis dataKey="hour" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} /><Tooltip />
            <Bar dataKey="answered" stackId="a" fill="#3b82f6" name="応答" />
            <Bar dataKey="missed"   stackId="a" fill="#f87171" name="不在" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* IVR ルート分析 */}
      {ivrSummary.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
          <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">IVRルート別着信数・応答率</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-gray-500 dark:text-gray-400 border-b">
                <th className="text-left py-2 pr-4">IVRルート</th>
                <th className="text-right py-2 pr-4">着信数</th>
                <th className="text-right py-2 pr-4">応答</th>
                <th className="text-right py-2 pr-4">不在</th>
                <th className="text-right py-2 pr-4">応答率</th>
                <th className="py-2">分布</th>
              </tr></thead>
              <tbody>
                {ivrSummary.map(r => (
                  <tr key={r.route} className="border-b last:border-0 hover:bg-gray-50 dark:bg-gray-800">
                    <td className="py-2 pr-4 font-mono text-xs text-slate-600 max-w-48 truncate" title={r.route}>{r.route}</td>
                    <td className="text-right py-2 pr-4 font-semibold">{r.call_count.toLocaleString()}</td>
                    <td className="text-right py-2 pr-4 text-green-600">{r.answered.toLocaleString()}</td>
                    <td className="text-right py-2 pr-4 text-red-500">{r.no_answer.toLocaleString()}</td>
                    <td className="text-right py-2 pr-4">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${r.rate>=80?'bg-green-100 text-green-700':r.rate>=50?'bg-yellow-100 text-yellow-700':'bg-red-100 text-red-700'}`}>{r.rate}%</span>
                    </td>
                    <td className="py-2 w-32">
                      <div className="flex gap-0.5 h-3">
                        <div className="bg-blue-400 rounded-sm" style={{ width: `${Math.round(r.answered  / (ivrSummary[0]?.call_count || 1) * 100)}%` }} />
                        <div className="bg-red-300 rounded-sm"  style={{ width: `${Math.round(r.no_answer / (ivrSummary[0]?.call_count || 1) * 100)}%` }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 月別トレンド */}
      {trendData.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
          <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">月別応答数推移（回線別）</h2>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={trendData}>
              <XAxis dataKey="month" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} /><Tooltip /><Legend />
              {trendLines.map(l => (
                <Line key={l} type="monotone" dataKey={l} stroke={LINE_COLORS[l] || '#94a3b8'} dot={false} strokeWidth={2} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 応答率 */}
      {rateData.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
          <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">回線別応答率</h2>
          <div className="space-y-2">
            {rateData.map(r => (
              <div key={r.name} className="flex items-center gap-3">
                <div className="w-28 text-sm text-right text-slate-600">{r.name}</div>
                <div className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-full h-5 overflow-hidden">
                  <div className={`h-full rounded-full flex items-center justify-end pr-2 text-xs font-semibold text-white ${r.rate>=80?'bg-green-500':r.rate>=50?'bg-yellow-400':'bg-red-400'}`}
                    style={{ width: `${Math.max(r.rate, 4)}%` }}>{r.rate}%</div>
                </div>
                <div className="text-xs text-gray-400 dark:text-gray-500 w-16">{r.total.toLocaleString()}件</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
