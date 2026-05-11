'use client'
import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, Legend, PieChart, Pie, Cell } from 'recharts'

type Hourly        = { hour: number; line_name: string; call_count: number; answered: number }
type Monthly       = { month: string; line_name: string; call_count: number; total_sec: number; status: string }
type DowData       = { label: string; total: number; answered: number; no_answer: number }
type TopCaller     = { caller: string; call_count: number; answered: number; no_answer: number; last_called_at: string }
type AvgDuration   = { line_name: string; answered_count: number; avg_sec: number; max_sec: number }
type DurationDist  = { bucket: string; sort_order: number; call_count: number }
type RepeatAnalysis = { caller_type: string; caller_count: number; call_count: number }

const LINE_COLORS: Record<string, string> = {
  'gates':'#3b82f6','SmileFood':'#10b981','CoSmile':'#f59e0b','SmileEstate':'#8b5cf6',
  'GACHA':'#ef4444','tenjin':'#06b6d4','1_gates':'#84cc16','水炊き・もつ鍋':'#f97316',
  'クリマバイト':'#ec4899','Central':'#6366f1',
}

const PIE_COLORS = ['#3b82f6', '#f59e0b']

function fmtSec(s: number) {
  if (!s) return '-'
  const m = Math.floor(s / 60)
  return m ? `${m}分${s % 60 ? s % 60 + '秒' : ''}` : `${s}秒`
}

// 時間帯×回線ヒートマップ
function HourLineHeatmap({ hourly }: { hourly: Hourly[] }) {
  const lines = useMemo(() => Array.from(new Set(hourly.map(r => r.line_name))).sort(), [hourly])
  const maxCount = useMemo(() => Math.max(...hourly.map(r => r.call_count), 1), [hourly])

  function cellColor(n: number) {
    if (n === 0) return '#f8fafc'
    const r = n / maxCount
    if (r < 0.2) return '#dbeafe'; if (r < 0.4) return '#93c5fd'
    if (r < 0.6) return '#60a5fa'; if (r < 0.8) return '#3b82f6'; return '#1d4ed8'
  }

  const dataMap = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of hourly) m.set(`${r.hour}|${r.line_name}`, r.call_count)
    return m
  }, [hourly])

  if (lines.length === 0) return null

  return (
    <div className="overflow-x-auto">
      <table className="text-xs border-collapse w-full">
        <thead>
          <tr>
            <th className="text-left px-2 py-1 text-slate-400 font-normal w-24">回線 ＼ 時間</th>
            {Array.from({ length: 24 }, (_, h) => (
              <th key={h} className="px-1 py-1 text-slate-400 font-normal text-center w-8">{h}</th>
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
        <span className="text-xs text-slate-400">少</span>
        {['#f8fafc','#dbeafe','#93c5fd','#60a5fa','#3b82f6','#1d4ed8'].map(c => (
          <div key={c} style={{ width: 12, height: 12, background: c, borderRadius: 2 }} />
        ))}
        <span className="text-xs text-slate-400">多</span>
      </div>
    </div>
  )
}

export default function StatsClient({
  hourly, monthly, dowData, topCallers, avgDuration, durationDist, repeatAnalysis,
}: {
  hourly: Hourly[]; monthly: Monthly[]; dowData: DowData[]
  topCallers: TopCaller[]; avgDuration: AvgDuration[]
  durationDist: DurationDist[]; repeatAnalysis: RepeatAnalysis[]
}) {
  // 時間帯別
  const hourlyTotal = Array.from({ length: 24 }, (_, h) => {
    const rows = hourly.filter(r => r.hour === h)
    const total = rows.reduce((s, r) => s + r.call_count, 0)
    const answered = rows.reduce((s, r) => s + r.answered, 0)
    return { hour: `${h}時`, total, answered, missed: total - answered }
  })
  const missedRanking = [...hourlyTotal].sort((a, b) => b.missed - a.missed).slice(0, 10)

  // 月別トレンド
  const answeredMonthly = monthly.filter(r => r.status === 'ANSWERED')
  const months = Array.from(new Set(answeredMonthly.map(r => r.month.slice(0, 7)))).sort()
  const lines  = Array.from(new Set(answeredMonthly.map(r => r.line_name)))
  const trendData = months.slice(-12).map(m => {
    const row: Record<string, string | number> = { month: m }
    lines.forEach(l => { row[l] = answeredMonthly.find(r => r.month.slice(0, 7) === m && r.line_name === l)?.call_count || 0 })
    return row
  })

  // 応答率
  const rateMap: Record<string, { total: number; answered: number }> = {}
  monthly.forEach(r => {
    if (!rateMap[r.line_name]) rateMap[r.line_name] = { total: 0, answered: 0 }
    rateMap[r.line_name].total += r.call_count
    if (r.status === 'ANSWERED') rateMap[r.line_name].answered += r.call_count
  })
  const rateData = Object.entries(rateMap)
    .map(([name, v]) => ({ name, rate: Math.round(v.answered / v.total * 100), total: v.total }))
    .sort((a, b) => b.total - a.total).slice(0, 10)

  // 平均通話時間
  const maxAvg = Math.max(...avgDuration.map(r => Number(r.avg_sec) || 0), 1)

  // 通話時間分布
  const sortedDist = [...durationDist].sort((a, b) => a.sort_order - b.sort_order)

  // リピーター分析
  const repeaterRow    = repeatAnalysis.find(r => r.caller_type === 'リピーター')
  const firstTimeRow   = repeatAnalysis.find(r => r.caller_type === '初回')
  const totalCallers   = repeatAnalysis.reduce((s, r) => s + Number(r.caller_count), 0)
  const totalCallCount = repeatAnalysis.reduce((s, r) => s + Number(r.call_count), 0)

  const callerPieData = repeatAnalysis.map(r => ({ name: r.caller_type, value: Number(r.caller_count) }))
  const callPieData   = repeatAnalysis.map(r => ({ name: r.caller_type, value: Number(r.call_count) }))

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <h1 className="text-xl font-bold text-slate-800">分析</h1>

      {/* 曜日別 + 不在時間帯ランキング */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow p-4">
          <h2 className="text-sm font-bold text-slate-700 mb-3">曜日別着信数（過去1年）</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={dowData}>
              <XAxis dataKey="label" tick={{ fontSize: 13 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="answered" stackId="a" fill="#3b82f6" name="応答" />
              <Bar dataKey="no_answer" stackId="a" fill="#f87171" name="不在" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl shadow p-4">
          <h2 className="text-sm font-bold text-slate-700 mb-3">不在着信の多い時間帯（TOP10）</h2>
          <div className="space-y-2">
            {missedRanking.map((r, i) => (
              <div key={r.hour} className="flex items-center gap-2">
                <span className={`w-5 text-xs font-bold text-center shrink-0 ${i < 3 ? 'text-red-500' : 'text-slate-400'}`}>{i + 1}</span>
                <span className="w-10 text-sm text-slate-600 shrink-0">{r.hour}</span>
                <div className="flex-1 bg-slate-100 rounded-full h-4 overflow-hidden">
                  <div className="h-full bg-red-400 rounded-full" style={{ width: `${Math.round(r.missed / (missedRanking[0].missed || 1) * 100)}%` }} />
                </div>
                <span className="text-xs text-slate-500 w-14 text-right shrink-0">{r.missed.toLocaleString()}件</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* リピーター分析 */}
      {repeatAnalysis.length > 0 && (
        <div className="bg-white rounded-xl shadow p-4">
          <h2 className="text-sm font-bold text-slate-700 mb-4">リピーター分析（全期間）</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
            {/* 数値サマリー */}
            <div className="space-y-3">
              {repeatAnalysis.map(r => (
                <div key={r.caller_type} className="flex items-start gap-3">
                  <div className={`w-3 h-3 rounded-full mt-1 shrink-0 ${r.caller_type === 'リピーター' ? 'bg-amber-400' : 'bg-blue-400'}`} />
                  <div>
                    <div className="text-sm font-semibold text-slate-700">{r.caller_type}</div>
                    <div className="text-xs text-slate-400">
                      {Number(r.caller_count).toLocaleString()} 番号 ·{' '}
                      {Number(r.call_count).toLocaleString()} 着信
                      {totalCallers > 0 && (
                        <span className="ml-1 text-slate-500 font-medium">
                          （{Math.round(Number(r.caller_count) / totalCallers * 100)}%）
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {repeaterRow && firstTimeRow && (
                <div className="text-xs text-slate-400 pt-2 border-t">
                  リピーター1人あたり平均{' '}
                  <span className="font-semibold text-slate-600">
                    {(Number(repeaterRow.call_count) / Number(repeaterRow.caller_count)).toFixed(1)}回
                  </span>{' '}着信
                </div>
              )}
            </div>
            {/* 発信元番号の比率 */}
            <div className="flex flex-col items-center">
              <div className="text-xs text-slate-500 mb-2">発信元番号の比率</div>
              <PieChart width={160} height={160}>
                <Pie data={callerPieData} cx={80} cy={80} innerRadius={40} outerRadius={70} dataKey="value" label={(props) => `${props.name ?? ''} ${(((props.percent) ?? 0) * 100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                  {callerPieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </div>
            {/* 着信件数の比率 */}
            <div className="flex flex-col items-center">
              <div className="text-xs text-slate-500 mb-2">着信件数の比率</div>
              <PieChart width={160} height={160}>
                <Pie data={callPieData} cx={80} cy={80} innerRadius={40} outerRadius={70} dataKey="value" label={(props) => `${props.name ?? ''} ${(((props.percent) ?? 0) * 100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                  {callPieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </div>
          </div>
        </div>
      )}

      {/* 通話時間の分布 */}
      {sortedDist.length > 0 && (
        <div className="bg-white rounded-xl shadow p-4">
          <h2 className="text-sm font-bold text-slate-700 mb-3">通話時間の分布（応答のみ）</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={sortedDist}>
              <XAxis dataKey="bucket" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="call_count" fill="#3b82f6" name="件数" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* TOP10 callers */}
      {topCallers.length > 0 && (
        <div className="bg-white rounded-xl shadow p-4">
          <h2 className="text-sm font-bold text-slate-700 mb-3">着信頻度ランキング TOP10（よくかけてくる番号）</h2>
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-slate-500 border-b">
              <th className="text-left py-2 w-8">#</th>
              <th className="text-left py-2 pr-4">電話番号</th>
              <th className="text-right py-2 pr-4">着信数</th>
              <th className="text-right py-2 pr-4">応答</th>
              <th className="text-right py-2 pr-4">不在</th>
              <th className="text-right py-2">最終着信</th>
            </tr></thead>
            <tbody>
              {topCallers.map((c, i) => (
                <tr key={c.caller} className="border-b last:border-0 hover:bg-slate-50">
                  <td className={`py-2 font-bold text-xs ${i < 3 ? 'text-amber-500' : 'text-slate-400'}`}>{i + 1}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{c.caller}</td>
                  <td className="text-right py-2 pr-4 font-semibold">{Number(c.call_count).toLocaleString()}</td>
                  <td className="text-right py-2 pr-4 text-green-600">{Number(c.answered).toLocaleString()}</td>
                  <td className="text-right py-2 pr-4 text-red-500">{Number(c.no_answer).toLocaleString()}</td>
                  <td className="text-right py-2 text-xs text-slate-400">
                    {c.last_called_at ? new Date(c.last_called_at).toLocaleDateString('ja-JP') : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 平均通話時間 */}
      {avgDuration.filter(r => r.avg_sec).length > 0 && (
        <div className="bg-white rounded-xl shadow p-4">
          <h2 className="text-sm font-bold text-slate-700 mb-3">平均通話時間 回線別（応答のみ）</h2>
          <div className="space-y-2">
            {avgDuration.filter(r => r.avg_sec).map(r => {
              const avg = Number(r.avg_sec)
              return (
                <div key={r.line_name} className="flex items-center gap-3">
                  <div className="w-28 text-sm text-right text-slate-600 shrink-0">{r.line_name}</div>
                  <div className="flex-1 bg-slate-100 rounded-full h-6 overflow-hidden">
                    <div className="h-full bg-blue-400 rounded-full flex items-center justify-end pr-2"
                      style={{ width: `${Math.max(Math.round(avg / maxAvg * 100), 8)}%` }}>
                      <span className="text-xs font-semibold text-white">{fmtSec(avg)}</span>
                    </div>
                  </div>
                  <div className="text-xs text-slate-400 w-16 text-right shrink-0">{Number(r.answered_count).toLocaleString()}件</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 時間帯×回線 ヒートマップ */}
      {hourly.length > 0 && (
        <div className="bg-white rounded-xl shadow p-4">
          <h2 className="text-sm font-bold text-slate-700 mb-3">時間帯×回線 ヒートマップ（全期間）</h2>
          <HourLineHeatmap hourly={hourly} />
        </div>
      )}

      {/* 時間帯別全体 */}
      <div className="bg-white rounded-xl shadow p-4">
        <h2 className="text-sm font-bold text-slate-700 mb-3">時間帯別着信数（全期間）</h2>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={hourlyTotal}>
            <XAxis dataKey="hour" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} /><Tooltip />
            <Bar dataKey="answered" stackId="a" fill="#3b82f6" name="応答" />
            <Bar dataKey="missed"   stackId="a" fill="#f87171" name="不在" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* 月別トレンド */}
      <div className="bg-white rounded-xl shadow p-4">
        <h2 className="text-sm font-bold text-slate-700 mb-3">月別応答数推移（直近12ヶ月・回線別）</h2>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={trendData}>
            <XAxis dataKey="month" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} /><Tooltip /><Legend />
            {lines.map(l => <Line key={l} type="monotone" dataKey={l} stroke={LINE_COLORS[l] || '#94a3b8'} dot={false} strokeWidth={2} />)}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* 応答率 */}
      <div className="bg-white rounded-xl shadow p-4">
        <h2 className="text-sm font-bold text-slate-700 mb-3">回線別応答率（全期間）</h2>
        <div className="space-y-2">
          {rateData.map(r => (
            <div key={r.name} className="flex items-center gap-3">
              <div className="w-28 text-sm text-right text-slate-600">{r.name}</div>
              <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden">
                <div className={`h-full rounded-full flex items-center justify-end pr-2 text-xs font-semibold text-white ${r.rate >= 80 ? 'bg-green-500' : r.rate >= 50 ? 'bg-yellow-400' : 'bg-red-400'}`}
                  style={{ width: `${r.rate}%` }}>{r.rate}%</div>
              </div>
              <div className="text-xs text-slate-400 w-16">{r.total.toLocaleString()}件</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
