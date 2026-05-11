'use client'
import { useRouter, usePathname } from 'next/navigation'

type Row = {
  id: number; started_at: string; caller: string; caller_name: string
  line_name: string; has_callback: boolean
}

function fmtDate(s: string) {
  const d = new Date(s)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function MissedClient({
  rows, lines, days, lineFilter,
}: {
  rows: Row[]; lines: string[]; days: number; lineFilter: string
}) {
  const router = useRouter(), pathname = usePathname()

  function nav(params: Record<string, string>) {
    const sp = new URLSearchParams(params)
    router.push(`${pathname}?${sp.toString()}`)
  }

  const filtered = lineFilter ? rows.filter(r => r.line_name === lineFilter) : rows
  const pending  = filtered.filter(r => !r.has_callback)
  const calledBack = filtered.filter(r => r.has_callback)

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">不在着信リスト</h1>
        <span className="text-sm text-slate-500">
          未折返し <span className="font-semibold text-red-600">{pending.length}件</span>
          ／折返済 <span className="font-semibold text-green-600">{calledBack.length}件</span>
        </span>
      </div>

      {/* フィルター */}
      <div className="bg-white rounded-xl shadow p-3 flex flex-wrap gap-2 items-center">
        <select value={days} onChange={e => nav({ days: e.target.value, line: lineFilter })}
          className="border rounded px-3 py-1.5 text-sm">
          <option value="3">直近3日</option>
          <option value="7">直近7日</option>
          <option value="14">直近14日</option>
          <option value="30">直近30日</option>
        </select>
        <select value={lineFilter} onChange={e => nav({ days: String(days), line: e.target.value })}
          className="border rounded px-3 py-1.5 text-sm">
          <option value="">全回線</option>
          {lines.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>

      {/* 未折返し */}
      <Section title="未折返し（24時間以内のコールバックなし）" color="red" rows={pending} />

      {/* 折返済み */}
      {calledBack.length > 0 && (
        <Section title="折返済み" color="green" rows={calledBack} />
      )}
    </div>
  )
}

function Section({ title, color, rows }: { title: string; color: 'red' | 'green'; rows: Row[] }) {
  if (rows.length === 0) return (
    <div className="bg-white rounded-xl shadow p-6 text-center text-sm text-slate-400">{title}：なし</div>
  )
  return (
    <div className="bg-white rounded-xl shadow overflow-hidden">
      <div className={`px-4 py-2 text-xs font-bold ${color === 'red' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
        {title}（{rows.length}件）
      </div>
      <table className="w-full text-sm">
        <thead><tr className="text-xs text-slate-500 border-b bg-slate-50">
          <th className="text-left px-4 py-2">日時</th>
          <th className="text-left px-4 py-2">発信元</th>
          <th className="text-left px-4 py-2">回線</th>
          <th className="text-center px-4 py-2">折返</th>
        </tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} className="border-b last:border-0 hover:bg-slate-50">
              <td className="px-4 py-2 text-slate-600 whitespace-nowrap">{fmtDate(r.started_at)}</td>
              <td className="px-4 py-2">
                {r.caller_name && <div className="text-xs text-slate-500 mb-0.5">{r.caller_name}</div>}
                <span className="font-mono text-xs text-blue-600">{r.caller}</span>
              </td>
              <td className="px-4 py-2 font-medium text-slate-700">{r.line_name || '-'}</td>
              <td className="px-4 py-2 text-center">
                {r.has_callback
                  ? <span className="text-green-600 text-sm">✓</span>
                  : <span className="text-red-400 text-xs">未</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
