'use client'
import { useState } from 'react'
import Link from 'next/link'

export type BookOption = { key: string; name: string; sort: number }
export type IdentityBookRow = { identity: string; book_key: string }

// 内線（SIPユーザー名）ごとに配る電話帳を on/off。DP750 / Groundwire 共通・機種/OS 非依存。
// 未設定の内線は配信時に「共通(all)」へフォールバック（サーバー側 phonebook-feed と同じ規則）。
export default function DevicesClient({
  initialBooks, initialRows, isAdmin,
}: {
  initialBooks: BookOption[]; initialRows: IdentityBookRow[]; isAdmin: boolean
}) {
  const [rows, setRows] = useState<IdentityBookRow[]>(initialRows)
  const [newIdentity, setNewIdentity] = useState('')
  const [saving, setSaving] = useState<string | null>(null)
  const [removingIdentity, setRemovingIdentity] = useState<string | null>(null)
  const [error, setError] = useState('')

  const identities = [...new Set(rows.map(r => r.identity))].sort()
  const booksOf = (identity: string) => rows.filter(r => r.identity === identity).map(r => r.book_key)

  async function reload() {
    const res = await fetch('/n/api/phonebook/identity-books')
    if (res.ok) setRows(await res.json())
  }

  async function saveIdentity(identity: string, bookKeys: string[]) {
    setSaving(identity)
    setError('')
    try {
      const res = await fetch('/n/api/phonebook/identity-books', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity, book_keys: bookKeys }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => null)
        setError(res.status === 403 ? '変更は管理者のみ可能です' : (j?.error ?? `エラー (${res.status})`))
        return
      }
      await reload()
    } finally { setSaving(null) }
  }

  function toggle(identity: string, bookKey: string) {
    const cur = booksOf(identity)
    const next = cur.includes(bookKey) ? cur.filter(k => k !== bookKey) : [...cur, bookKey]
    // 最後の1件は外せない（サーバー側でも空→all へ戻る）
    saveIdentity(identity, next.length > 0 ? next : ['all'])
  }

  async function addIdentity() {
    const identity = newIdentity.trim()
    if (!identity) return
    if (!/^[0-9A-Za-z_-]{1,32}$/.test(identity)) {
      setError('内線番号（SIPユーザー名）は英数字で入力してください')
      return
    }
    await saveIdentity(identity, ['all'])
    setNewIdentity('')
  }

  async function removeIdentity(identity: string) {
    setSaving(identity)
    setError('')
    try {
      const res = await fetch(`/n/api/phonebook/identity-books?identity=${encodeURIComponent(identity)}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        setError(res.status === 403 ? '変更は管理者のみ可能です' : `削除エラー (${res.status})`)
        return
      }
      setRemovingIdentity(null)
      await reload()
    } finally { setSaving(null) }
  }

  const input = 'border dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 rounded px-3 py-1.5 text-sm'

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800 dark:text-gray-200">端末電話帳</h1>
        <Link href="/phonebook"
          className="px-3 py-1.5 rounded border text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
          ← 連絡先
        </Link>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 space-y-1 text-xs text-gray-500 dark:text-gray-400">
        <p>内線番号（=SIPユーザー名）ごとに、端末へ配る電話帳を選びます。DP750 / Groundwire 共通・機種やOSに依存しません。</p>
        <p>ここに<b>載っていない内線は「共通」電話帳</b>が配信されます（既定）。割り当てを変えると端末の次回ポーリング（3〜5分）で反映されます。</p>
      </div>

      {!isAdmin && (
        <div className="text-xs text-gray-400 dark:text-gray-500">閲覧のみ（変更は管理者のみ）</div>
      )}
      {error && <div className="text-xs text-red-600">{error}</div>}

      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 dark:text-gray-400 border-b bg-gray-50 dark:bg-gray-800">
              <th className="text-left px-4 py-2">内線番号</th>
              <th className="text-left px-4 py-2">配信する電話帳</th>
              {isAdmin && <th className="text-center px-4 py-2">操作</th>}
            </tr>
          </thead>
          <tbody>
            {identities.length === 0 ? (
              <tr>
                <td colSpan={isAdmin ? 3 : 2} className="text-center py-12 text-gray-400 dark:text-gray-500 text-sm">
                  個別設定はありません（全内線に「共通」電話帳を配信中）
                </td>
              </tr>
            ) : identities.map(identity => {
              const selected = booksOf(identity)
              return (
                <tr key={identity} className="border-b last:border-0">
                  <td className="px-4 py-2 font-mono text-indigo-600 dark:text-indigo-400">{identity}</td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-1.5">
                      {initialBooks.map(b => (
                        <button key={b.key}
                          disabled={!isAdmin || saving === identity}
                          onClick={() => toggle(identity, b.key)}
                          className={`px-2.5 py-1 rounded-full border text-xs font-medium transition-colors disabled:opacity-60 ${
                            selected.includes(b.key)
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 border-slate-300 dark:border-gray-600'
                          }`}>
                          {b.name}
                        </button>
                      ))}
                      {saving === identity && <span className="text-xs text-gray-400">保存中…</span>}
                    </div>
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-2 text-center whitespace-nowrap">
                      {removingIdentity === identity ? (
                        <>
                          <button onClick={() => removeIdentity(identity)} disabled={saving === identity}
                            className="px-2 py-0.5 rounded bg-red-600 text-white text-xs mr-1">既定に戻す</button>
                          <button onClick={() => setRemovingIdentity(null)}
                            className="px-2 py-0.5 rounded border text-xs text-gray-500 dark:text-gray-400">✕</button>
                        </>
                      ) : (
                        <button onClick={() => setRemovingIdentity(identity)}
                          className="px-2 py-0.5 rounded border text-xs text-gray-500 dark:text-gray-400"
                          title="個別設定を削除して既定（共通）に戻す">既定に戻す</button>
                      )}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {isAdmin && (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-2">
          <input placeholder="内線番号（例: 8001）" value={newIdentity}
            onChange={e => setNewIdentity(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addIdentity() }}
            className={`${input} w-48 font-mono`} />
          <button onClick={addIdentity} disabled={!newIdentity.trim() || saving !== null}
            className="px-3 py-1.5 rounded bg-indigo-600 text-white text-sm disabled:opacity-40">
            ＋ 内線を追加
          </button>
          <span className="text-xs text-gray-400 dark:text-gray-500">追加時は「共通」で開始（後からチップで変更）</span>
        </div>
      )}
    </div>
  )
}
