'use client'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  FAX_STATUSES, FAX_STATUS_LABELS, FAX_CATEGORIES, FAX_CATEGORY_LABELS,
  type FaxStatus, type FaxCategory,
} from '@/lib/fax'

export type FaxRow = {
  id: string
  received_at: string
  from_number: string | null
  pages: number | null
  pdf_filename: string | null
  status: FaxStatus
  category: FaxCategory | null
  memo: string | null
  drive_url: string | null
}

function fmtDate(s: string) {
  const d = new Date(new Date(s).getTime() + 9 * 60 * 60 * 1000)
  return `${d.getUTCFullYear()}/${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

const STATUS_BADGE: Record<FaxStatus, string> = {
  untriaged: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  open: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  done: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  dm: 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
}

export default function FaxClient({
  rows, canEdit, filters,
}: {
  rows: FaxRow[]
  canEdit: boolean
  filters: { from: string; to: string; status: string; cat: string; dm: boolean }
}) {
  const router = useRouter(), pathname = usePathname()
  const [busy, setBusy] = useState<string | null>(null)

  function nav(next: Partial<{ from: string; to: string; status: string; cat: string; dm: boolean }>) {
    const f = { ...filters, ...next }
    const sp = new URLSearchParams()
    if (f.from) sp.set('from', f.from)
    if (f.to) sp.set('to', f.to)
    if (f.status) sp.set('status', f.status)
    if (f.cat) sp.set('cat', f.cat)
    if (f.dm) sp.set('dm', '1')
    router.push(sp.size ? `${pathname}?${sp.toString()}` : pathname)
  }

  async function post(id: string, path: string, body: object) {
    setBusy(id)
    try {
      const res = await fetch(`/n/api/fax/${id}${path}`, {
        method: path === '' ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) alert(`更新に失敗しました (${res.status})`)
      router.refresh()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800 dark:text-gray-200">FAX受信管理</h1>
        <span className="text-sm text-gray-500 dark:text-gray-400">{rows.length}件</span>
      </div>

      {/* フィルター */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-3 flex flex-wrap gap-2 items-center">
        <input type="date" value={filters.from} onChange={e => nav({ from: e.target.value })}
          className="border dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 rounded px-2 py-1.5 text-sm" />
        <span className="text-gray-400 text-sm">〜</span>
        <input type="date" value={filters.to} onChange={e => nav({ to: e.target.value })}
          className="border dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 rounded px-2 py-1.5 text-sm" />
        <select value={filters.status} onChange={e => nav({ status: e.target.value })}
          className="border dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 rounded px-3 py-1.5 text-sm">
          <option value="">全ステータス</option>
          {FAX_STATUSES.map(s => <option key={s} value={s}>{FAX_STATUS_LABELS[s]}</option>)}
        </select>
        <select value={filters.cat} onChange={e => nav({ cat: e.target.value })}
          className="border dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 rounded px-3 py-1.5 text-sm">
          <option value="">全区分</option>
          {FAX_CATEGORIES.map(c => <option key={c} value={c}>{FAX_CATEGORY_LABELS[c]}</option>)}
        </select>
        {!filters.status && (
          <label className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300 cursor-pointer">
            <input type="checkbox" checked={filters.dm} onChange={e => nav({ dm: e.target.checked })} />
            DM(不要)も表示
          </label>
        )}
      </div>

      {/* 一覧 */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead>
            <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
              <th className="px-3 py-2">受信日時</th>
              <th className="px-3 py-2">送信元番号</th>
              <th className="px-3 py-2">頁</th>
              <th className="px-3 py-2">PDF</th>
              <th className="px-3 py-2">ステータス</th>
              <th className="px-3 py-2">区分</th>
              <th className="px-3 py-2">メモ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className={`border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 ${busy === r.id ? 'opacity-50' : ''}`}>
                <td className="px-3 py-2 whitespace-nowrap">
                  <Link href={`/fax/${r.id}`} className="text-blue-600 dark:text-blue-400 hover:underline">
                    {fmtDate(r.received_at)}
                  </Link>
                </td>
                <td className="px-3 py-2 whitespace-nowrap font-mono text-gray-800 dark:text-gray-200">{r.from_number ?? '不明'}</td>
                <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{r.pages ?? '-'}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <a href={`/n/api/fax/${r.id}/pdf`} target="_blank" rel="noreferrer"
                    className="text-blue-600 dark:text-blue-400 hover:underline mr-2">表示</a>
                  <a href={`/n/api/fax/${r.id}/pdf?dl=1`} className="text-gray-500 dark:text-gray-400 hover:underline">DL</a>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {canEdit ? (
                    <select value={r.status} disabled={busy === r.id}
                      onChange={e => post(r.id, '/status', { status: e.target.value })}
                      className={`rounded px-2 py-1 text-xs font-semibold border-0 cursor-pointer ${STATUS_BADGE[r.status]}`}>
                      {FAX_STATUSES.map(s => <option key={s} value={s}>{FAX_STATUS_LABELS[s]}</option>)}
                    </select>
                  ) : (
                    <span className={`rounded px-2 py-1 text-xs font-semibold ${STATUS_BADGE[r.status]}`}>{FAX_STATUS_LABELS[r.status]}</span>
                  )}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {canEdit ? (
                    <select value={r.category ?? ''} disabled={busy === r.id}
                      onChange={e => post(r.id, '/triage', { category: e.target.value || null })}
                      className="border dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 rounded px-2 py-1 text-xs">
                      <option value="">未仕分け</option>
                      {FAX_CATEGORIES.map(c => <option key={c} value={c}>{FAX_CATEGORY_LABELS[c]}</option>)}
                    </select>
                  ) : (
                    <span className="text-gray-700 dark:text-gray-300">{r.category ? FAX_CATEGORY_LABELS[r.category] : '未仕分け'}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-gray-500 dark:text-gray-400 max-w-[200px] truncate" title={r.memo ?? ''}>{r.memo ?? ''}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-400">該当するFAXはありません</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
