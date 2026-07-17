'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  FAX_STATUSES, FAX_STATUS_LABELS, FAX_CATEGORIES, FAX_CATEGORY_LABELS,
  type FaxStatus, type FaxCategory,
} from '@/lib/fax'

export type FaxDetail = {
  id: string
  received_at: string
  from_number: string | null
  pages: number | null
  pdf_filename: string | null
  status: FaxStatus
  category: FaxCategory | null
  memo: string | null
  drive_url: string | null
  pbx_uniqueid: string | null
  deleted_at: string | null
}

function fmtDate(s: string) {
  const d = new Date(new Date(s).getTime() + 9 * 60 * 60 * 1000)
  return `${d.getUTCFullYear()}/${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

// 完全削除までの残り日数（削除日から30日）
function daysLeft(deletedAt: string) {
  const purgeAt = new Date(deletedAt).getTime() + 30 * 24 * 60 * 60 * 1000
  return Math.max(0, Math.ceil((purgeAt - Date.now()) / (24 * 60 * 60 * 1000)))
}

export default function FaxDetailClient({ fax, canEdit }: { fax: FaxDetail; canEdit: boolean }) {
  const router = useRouter()
  const [memo, setMemo] = useState(fax.memo ?? '')
  const [busy, setBusy] = useState(false)
  const deleted = !!fax.deleted_at

  async function call(path: string, method: string, body: object, after?: () => void) {
    setBusy(true)
    try {
      const res = await fetch(`/n/api/fax/${fax.id}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) alert(`更新に失敗しました (${res.status})`)
      else if (after) after()
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  function del() {
    if (!confirm('このFAXを削除しますか？\n削除済みから30日間は復元できます。30日を過ぎると完全に削除されます。')) return
    call('/delete', 'POST', {}, () => router.push('/fax'))
  }

  const pdfUrl = `/n/api/fax/${fax.id}/pdf`

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-gray-800 dark:text-gray-200">FAX詳細</h1>
        <Link href="/fax" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">← 一覧へ戻る</Link>
      </div>

      {deleted && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3 text-sm text-red-800 dark:text-red-300 flex items-center justify-between flex-wrap gap-2">
          <span>🗑 このFAXは<b>削除済み</b>です。あと<b>{daysLeft(fax.deleted_at!)}日</b>で完全に削除されます（復元不可になります）。</span>
          {canEdit && (
            <button disabled={busy} onClick={() => call('/restore', 'POST', {})}
              className="px-3 py-1.5 rounded bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50">
              復元する
            </button>
          )}
        </div>
      )}

      <div className="grid md:grid-cols-[1fr_320px] gap-4">
        {/* PDFプレビュー */}
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <iframe src={pdfUrl} title="FAX PDF" className="w-full h-[70vh] min-h-[420px]" />
          <div className="p-2 border-t border-gray-200 dark:border-gray-700 flex gap-3 text-sm">
            <a href={pdfUrl} target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">別タブで開く</a>
            <a href={`${pdfUrl}?dl=1`} className="text-blue-600 dark:text-blue-400 hover:underline">ダウンロード</a>
            {fax.drive_url && (
              <a href={fax.drive_url} target="_blank" rel="noreferrer" className="text-gray-500 dark:text-gray-400 hover:underline">Drive(二重化)</a>
            )}
          </div>
        </div>

        {/* 情報・操作 */}
        <div className="space-y-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">受信日時</span><span className="text-gray-800 dark:text-gray-200">{fmtDate(fax.received_at)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">送信元番号</span><span className="font-mono text-gray-800 dark:text-gray-200">{fax.from_number ?? '不明'}</span></div>
            <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">ページ数</span><span className="text-gray-800 dark:text-gray-200">{fax.pages ?? '-'}</span></div>
            <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">ファイル名</span><span className="text-gray-800 dark:text-gray-200 truncate max-w-[180px]" title={fax.pdf_filename ?? ''}>{fax.pdf_filename ?? '-'}</span></div>
          </div>

          {!deleted && (
            <>
              {/* ステータス */}
              <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
                <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">ステータス</div>
                <div className="flex flex-wrap gap-1.5">
                  {FAX_STATUSES.map(s => (
                    <button key={s} disabled={!canEdit || busy}
                      onClick={() => call('/status', 'POST', { status: s })}
                      className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
                        fax.status === s
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                      } ${!canEdit ? 'opacity-60 cursor-not-allowed' : ''}`}>
                      {FAX_STATUS_LABELS[s]}
                    </button>
                  ))}
                </div>
              </div>

              {/* 仕分け */}
              <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
                <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">仕分け区分</div>
                <div className="flex flex-wrap gap-1.5">
                  {FAX_CATEGORIES.map(c => (
                    <button key={c} disabled={!canEdit || busy}
                      onClick={() => call('/triage', 'POST', { category: fax.category === c ? null : c })}
                      className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
                        fax.category === c
                          ? 'bg-emerald-600 text-white'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                      } ${!canEdit ? 'opacity-60 cursor-not-allowed' : ''}`}>
                      {FAX_CATEGORY_LABELS[c]}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-gray-400">仕分けすると「未仕分け」は自動で「未対応」になります（再クリックで解除）</p>
              </div>

              {/* メモ */}
              <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
                <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">メモ</div>
                <textarea value={memo} onChange={e => setMemo(e.target.value)} rows={3} disabled={!canEdit}
                  className="w-full border dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 rounded px-2 py-1.5 text-sm disabled:opacity-60"
                  placeholder="対応内容など" />
                {canEdit && (
                  <button disabled={busy} onClick={() => call('', 'PATCH', { memo })}
                    className="mt-2 px-4 py-1.5 rounded bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50">
                    メモを保存
                  </button>
                )}
              </div>

              {/* 削除 */}
              {canEdit && (
                <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
                  <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">削除</div>
                  <button disabled={busy} onClick={del}
                    className="px-4 py-1.5 rounded bg-red-600 text-white text-xs font-semibold hover:bg-red-700 disabled:opacity-50">
                    このFAXを削除
                  </button>
                  <p className="mt-2 text-xs text-gray-400">削除済みから30日間は復元可・その後自動で完全削除</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
