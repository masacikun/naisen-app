'use client'
import { useRouter, usePathname } from 'next/navigation'

type Row = {
  id: number; started_at: string; caller: string; caller_name: string
  line_name: string; has_callback: boolean
}

function fmtDate(s: string) {
  const d = new Date(new Date(s).getTime() + 9 * 60 * 60 * 1000)
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
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
        <h1 className="text-xl font-bold text-gray-800 dark:text-gray-200">不在着信リスト</h1>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          未折返し <span className="font-semibold text-red-600">{pending.length}件</span>
          ／折返済 <span className="font-semibold text-green-600">{calledBack.length}件</span>
        </span>
      </div>

      {/* フィルター */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-3 flex flex-wrap gap-2 items-center">
        <select value={days} onChange={e => nav({ days: e.target.value, line: lineFilter })}
          className="border dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 rounded px-3 py-1.5 text-sm">
          <option value="3">直近3日</option>
          <option value="7">直近7日</option>
          <option value="14">直近14日</option>
          <option value="30">直近30日</option>
        </select>
        <select value={lineFilter} onChange={e => nav({ days: String(days), line: e.target.value })}
          className="border dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 rounded px-3 py-1.5 text-sm">
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
    <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 text-center text-sm text-gray-400 dark:text-gray-500">{title}：なし</div>
  )
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className={`px-4 py-2 text-xs font-bold ${color === 'red' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
        {title}（{rows.length}件）
      </div>
      <table className="w-full text-sm">
        <thead><tr className="text-xs text-gray-500 dark:text-gray-400 border-b bg-gray-50 dark:bg-gray-800">
          <th className="text-left px-4 py-2">日時</th>
          <th className="text-left px-4 py-2">発信元</th>
          <th className="text-left px-4 py-2">回線</th>
          <th className="text-center px-4 py-2">折返</th>
        </tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} className="border-b last:border-0 hover:bg-gray-50 dark:bg-gray-800">
              <td className="px-4 py-2 text-gray-600 dark:text-gray-300 whitespace-nowrap">{fmtDate(r.started_at)}</td>
              <td className="px-4 py-2">
                {r.caller_name && <div className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">{r.caller_name}</div>}
                <span className="font-mono text-xs text-indigo-600 dark:text-indigo-400">{r.caller}</span>
              </td>
              <td className="px-4 py-2 font-medium text-gray-700 dark:text-gray-300">{r.line_name || '-'}</td>
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
