'use client'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from 'recharts'

type Hourly      = { hour: number; line_name: string; call_count: number; answered: number }
type Monthly     = { month: string; line_name: string; call_count: number; total_sec: number; status: string }
type DowData     = { label: string; total: number; answered: number; no_answer: number }
type TopCaller   = { caller: string; call_count: number; answered: number; no_answer: number; last_called_at: string }
type AvgDuration = { line_name: string; answered_count: number; avg_sec: number; max_sec: number }

const LINE_COLORS: Record<string, string> = {
  'gates':'#3b82f6','SmileFood':'#10b981','CoSmile':'#f59e0b','SmileEstate':'#8b5cf6',
  'GACHA':'#ef4444','tenjin':'#06b6d4','1_gates':'#84cc16','水炊き・もつ鍋':'#f97316',
  'クリマバイト':'#ec4899','Central':'#6366f1',
}

function fmtSec(s: number) {
  if (!s) return '-'
  const m = Math.floor(s / 60)
  return m ? `${m}分${s % 60 ? s % 60 + '秒' : ''}` : `${s}秒`
}

export default function StatsClient({ hourly, monthly, dowData, topCallers, avgDuration }: {
  hourly: Hourly[]; monthly: Monthly[]; dowData: DowData[]
  topCallers: TopCaller[]; avgDuration: AvgDuration[]
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
