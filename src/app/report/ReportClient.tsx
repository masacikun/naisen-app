'use client'
import { useRouter, usePathname } from 'next/navigation'
import { useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

type Call = { status: string; duration_sec?: number; line_name?: string; caller?: string; started_at: string }
type DailyRow = { call_date: string; call_count: number; answered: number; no_answer: number }

function fmtSec(s: number) {
  if (!s) return '-'
  const m = Math.floor(s / 60)
  return m ? `${m}分${s % 60 ? s % 60 + '秒' : ''}` : `${s}秒`
}

export default function ReportClient({
  month, calls, dailyRows,
}: {
  month: string; calls: Call[]; dailyRows: DailyRow[]
}) {
  const router = useRouter(), pathname = usePathname()
  const [lineFilter, setLineFilter] = useState('')

  // 回線一覧
  const lines = useMemo(() => Array.from(new Set(calls.map(c => c.line_name).filter(Boolean))).sort() as string[], [calls])

  // 回線フィルター適用
  const fCalls = useMemo(() => lineFilter ? calls.filter(c => c.line_name === lineFilter) : calls, [calls, lineFilter])

  // KPI
  const total    = fCalls.length
  const answered = fCalls.filter(c => c.status === 'ANSWERED').length
  const missed   = fCalls.filter(c => c.status === 'NO ANSWER').length
  const rate     = total ? Math.round(answered / total * 100) : 0
  const avgSec   = answered
    ? Math.round(fCalls.filter(c => c.status === 'ANSWERED' && c.duration_sec).reduce((s, c) => s + (c.duration_sec ?? 0), 0) / answered)
    : 0

  // 回線別
  const lineData = useMemo(() => {
    const m: Record<string, { total: number; answered: number; missed: number; sec: number }> = {}
    for (const c of fCalls) {
      const l = c.line_name || '不明'
      if (!m[l]) m[l] = { total: 0, answered: 0, missed: 0, sec: 0 }
      m[l].total++
      if (c.status === 'ANSWERED') { m[l].answered++; m[l].sec += c.duration_sec ?? 0 }
      if (c.status === 'NO ANSWER') m[l].missed++
    }
    return Object.entries(m)
      .map(([name, v]) => ({ name, ...v, rate: Math.round(v.answered / v.total * 100), avg: v.answered ? Math.round(v.sec / v.answered) : 0 }))
      .sort((a, b) => b.total - a.total)
  }, [fCalls])

  // 日次グラフ（dailyRows 集計）
  const dailyChart = useMemo(() => {
    const m = new Map<string, { answered: number; no_answer: number }>()
    for (const r of dailyRows) {
      const k = String(r.call_date).slice(0, 10)
      const e = m.get(k) ?? { answered: 0, no_answer: 0 }
      m.set(k, { answered: e.answered + r.answered, no_answer: e.no_answer + r.no_answer })
    }
    return Array.from(m, ([date, v]) => ({ date: date.slice(5), ...v })).sort((a, b) => a.date.localeCompare(b.date))
  }, [dailyRows])

  // TOP着信番号
  const topCallers = useMemo(() => {
    const m: Record<string, { total: number; answered: number }> = {}
    for (const c of fCalls) {
      if (!c.caller) continue
      if (!m[c.caller]) m[c.caller] = { total: 0, answered: 0 }
      m[c.caller].total++
      if (c.status === 'ANSWERED') m[c.caller].answered++
    }
    return Object.entries(m)
      .map(([caller, v]) => ({ caller, ...v }))
      .sort((a, b) => b.total - a.total).slice(0, 10)
  }, [fCalls])

  // 月選択（前後6ヶ月）
  const [y, mo] = month.split('-').map(Number)
  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(y, mo - 1 - 5 + i, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })

  return (
    <div className="max-w-5xl mx-auto space-y-6 report-root">
      {/* コントロールバー（印刷時非表示） */}
      <div className="flex items-center justify-between no-print">
        <h1 className="text-xl font-bold text-slate-800">月次レポート</h1>
        <div className="flex items-center gap-3">
          <select value={month} onChange={e => router.push(`${pathname}?month=${e.target.value}`)}
            className="border rounded px-3 py-1.5 text-sm">
            {monthOptions.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={lineFilter} onChange={e => setLineFilter(e.target.value)}
            className="border rounded px-3 py-1.5 text-sm">
            <option value="">全回線</option>
            {lines.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <button onClick={() => window.print()}
            className="px-4 py-1.5 rounded bg-slate-700 text-white text-sm hover:bg-slate-800">
            印刷 / PDF
          </button>
        </div>
      </div>

      {/* レポートヘッダー */}
      <div className="print-only hidden text-center mb-4">
        <h1 className="text-2xl font-bold">月次通話レポート　{month.replace('-', '年')}月</h1>
        <p className="text-sm text-slate-500 mt-1">出力日: {new Date().toLocaleDateString('ja-JP')}</p>
      </div>

      {/* KPI サマリー */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: '総着信', value: total.toLocaleString(), unit: '件' },
          { label: '応答', value: answered.toLocaleString(), unit: '件', cls: 'text-green-600' },
          { label: '不在', value: missed.toLocaleString(), unit: '件', cls: 'text-red-500' },
          { label: '応答率', value: rate, unit: '%', cls: rate >= 80 ? 'text-green-600' : rate >= 50 ? 'text-amber-500' : 'text-red-500' },
          { label: '平均通話時間', value: fmtSec(avgSec), unit: '' },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl shadow p-4 text-center">
            <div className="text-xs text-slate-500 mb-1">{k.label}</div>
            <div className={`text-2xl font-bold ${k.cls ?? 'text-slate-800'}`}>{k.value}<span className="text-sm font-normal ml-0.5">{k.unit}</span></div>
          </div>
        ))}
      </div>

      {/* 日次トレンド */}
      {dailyChart.length > 0 && (
        <div className="bg-white rounded-xl shadow p-4">
          <h2 className="text-sm font-bold text-slate-700 mb-3">日次着信推移</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={dailyChart}>
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="answered" stackId="a" fill="#3b82f6" name="応答" />
              <Bar dataKey="no_answer" stackId="a" fill="#f87171" name="不在" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 回線別サマリー */}
      <div className="bg-white rounded-xl shadow p-4">
        <h2 className="text-sm font-bold text-slate-700 mb-3">回線別サマリー</h2>
        <table className="w-full text-sm">
          <thead><tr className="text-xs text-slate-500 border-b">
            <th className="text-left py-2 pr-4">回線</th>
            <th className="text-right py-2 pr-4">総着信</th>
            <th className="text-right py-2 pr-4">応答</th>
            <th className="text-right py-2 pr-4">不在</th>
            <th className="text-right py-2 pr-4">応答率</th>
            <th className="text-right py-2">平均通話</th>
          </tr></thead>
          <tbody>
            {lineData.map(l => (
              <tr key={l.name} className="border-b last:border-0 hover:bg-slate-50">
                <td className="py-2 pr-4 font-medium text-slate-700">{l.name}</td>
                <td className="text-right py-2 pr-4">{l.total.toLocaleString()}</td>
                <td className="text-right py-2 pr-4 text-green-600">{l.answered.toLocaleString()}</td>
                <td className="text-right py-2 pr-4 text-red-500">{l.missed.toLocaleString()}</td>
                <td className="text-right py-2 pr-4">
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold ${l.rate>=80?'bg-green-100 text-green-700':l.rate>=50?'bg-yellow-100 text-yellow-700':'bg-red-100 text-red-700'}`}>{l.rate}%</span>
                </td>
                <td className="text-right py-2 text-slate-500 text-xs">{fmtSec(l.avg)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* TOP着信番号 */}
      {topCallers.length > 0 && (
        <div className="bg-white rounded-xl shadow p-4">
          <h2 className="text-sm font-bold text-slate-700 mb-3">着信頻度 TOP10</h2>
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-slate-500 border-b">
              <th className="text-left py-2 w-8">#</th>
              <th className="text-left py-2 pr-4">電話番号</th>
              <th className="text-right py-2 pr-4">着信数</th>
              <th className="text-right py-2">応答</th>
            </tr></thead>
            <tbody>
              {topCallers.map((c, i) => (
                <tr key={c.caller} className="border-b last:border-0 hover:bg-slate-50">
                  <td className={`py-2 font-bold text-xs ${i < 3 ? 'text-amber-500' : 'text-slate-400'}`}>{i + 1}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{c.caller}</td>
                  <td className="text-right py-2 pr-4 font-semibold">{c.total}</td>
                  <td className="text-right py-2 text-green-600">{c.answered}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          body { background: white; }
          .report-root { max-width: 100%; padding: 0; }
        }
      `}</style>
    </div>
  )
}
