'use client'
import { useState } from 'react'

export type PhoneNumber = {
  id: number
  phone_raw: string
  phone_normalized: string | null
  label: string | null
}
export type Entry = {
  id: number
  name: string
  name_kana: string | null
  group_name: string | null
  memo: string | null
  partner_id: number | null
  blocked: boolean
  updated_at: string
  phonebook_numbers: PhoneNumber[]
}
export type PartnerOption = { partner_no: number; partner_name: string }

type NumberForm = { raw: string; label: string }
type View = 'normal' | 'blocked' | 'all'

const emptyForm = {
  name: '', name_kana: '', group_name: '', memo: '', partner_id: '' as string,
  blocked: false,
  numbers: [{ raw: '', label: '' }] as NumberForm[],
}

const VIEWS: { key: View; label: string }[] = [
  { key: 'normal',  label: '電話帳' },
  { key: 'blocked', label: '着信拒否' },
  { key: 'all',     label: 'すべて' },
]

export default function PhonebookClient({
  initialEntries, partners, isAdmin,
}: {
  initialEntries: Entry[]; partners: PartnerOption[]; isAdmin: boolean
}) {
  const [entries, setEntries] = useState<Entry[]>(initialEntries)
  const [view, setView] = useState<View>('normal')
  const [q, setQ] = useState('')
  const [editingId, setEditingId] = useState<number | 'new' | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const partnerName = (id: number | null) =>
    id == null ? '' : partners.find(p => p.partner_no === id)?.partner_name ?? `#${id}`

  const blockedCount = entries.filter(e => e.blocked).length
  const viewEntries = view === 'all' ? entries : entries.filter(e => e.blocked === (view === 'blocked'))

  const qNorm = q.replace(/[^0-9]/g, '')
  const filtered = q
    ? viewEntries.filter(e =>
        [e.name, e.name_kana, e.group_name, e.memo, partnerName(e.partner_id)].some(v => v?.includes(q)) ||
        (qNorm.length > 0 && e.phonebook_numbers.some(n =>
          n.phone_normalized?.includes(qNorm) || n.phone_raw.includes(q))))
    : viewEntries

  async function reload() {
    const res = await fetch('/n/api/phonebook')
    if (res.ok) setEntries(await res.json())
  }

  function openNew() {
    setForm({ ...emptyForm, blocked: view === 'blocked' })
    setEditingId('new')
    setError('')
  }

  function openEdit(e: Entry) {
    setForm({
      name: e.name,
      name_kana: e.name_kana ?? '',
      group_name: e.group_name ?? '',
      memo: e.memo ?? '',
      partner_id: e.partner_id != null ? String(e.partner_id) : '',
      blocked: e.blocked,
      numbers: e.phonebook_numbers.length > 0
        ? e.phonebook_numbers.map(n => ({ raw: n.phone_raw, label: n.label ?? '' }))
        : [{ raw: '', label: '' }],
    })
    setEditingId(e.id)
    setError('')
  }

  async function save() {
    if (!form.name.trim()) return
    setSaving(true)
    setError('')
    try {
      const body = {
        name: form.name,
        name_kana: form.name_kana || null,
        group_name: form.group_name || null,
        memo: form.memo || null,
        partner_id: form.partner_id ? parseInt(form.partner_id) : null,
        blocked: form.blocked,
        numbers: form.numbers
          .filter(n => n.raw.trim())
          .map(n => ({ raw: n.raw, label: n.label || null })),
      }
      const isNew = editingId === 'new'
      const res = await fetch(isNew ? '/n/api/phonebook' : `/n/api/phonebook/${editingId}`, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => null)
        setError(res.status === 403 ? '編集は管理者のみ可能です' : (j?.error ?? `エラー (${res.status})`))
        return
      }
      await reload()
      setEditingId(null)
    } finally { setSaving(false) }
  }

  async function remove(id: number) {
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/n/api/phonebook/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        setError(res.status === 403 ? '削除は管理者のみ可能です' : `削除エラー (${res.status})`)
        return
      }
      setDeletingId(null)
      await reload()
    } finally { setSaving(false) }
  }

  const input = 'border dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 rounded px-3 py-1.5 text-sm'

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800 dark:text-gray-200">電話帳</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {entries.length - blockedCount} 件＋拒否 {blockedCount} 件
          </span>
          {isAdmin && (
            <button onClick={openNew}
              className="px-3 py-1.5 rounded bg-indigo-600 text-white text-sm hover:bg-indigo-700 font-medium">
              ＋ 新規追加
            </button>
          )}
        </div>
      </div>

      {/* ビュー切替＋検索 */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-3 space-y-2">
        <div className="flex gap-1">
          {VIEWS.map(v => (
            <button key={v.key} onClick={() => setView(v.key)}
              className={`px-3 py-1 rounded text-xs font-medium border transition-colors ${
                view === v.key
                  ? v.key === 'blocked'
                    ? 'bg-red-600 text-white border-red-600'
                    : 'bg-slate-700 text-white border-slate-700'
                  : 'bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 border-slate-300 dark:border-gray-600 hover:bg-slate-50'
              }`}>
              {v.label}
            </button>
          ))}
        </div>
        <input type="text" placeholder="名前・ヨミ・グループ・電話番号で検索..."
          value={q} onChange={e => setQ(e.target.value)}
          className={`${input} w-full`} />
      </div>

      {/* 追加・編集フォーム（admin のみ） */}
      {isAdmin && editingId !== null && (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-indigo-300 dark:border-indigo-700 p-4 space-y-3">
          <div className="text-sm font-bold text-gray-700 dark:text-gray-300">
            {editingId === 'new' ? '新規追加' : '編集'}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input placeholder="名前（必須）" value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })} className={input} />
            <input placeholder="ヨミ（任意）" value={form.name_kana}
              onChange={e => setForm({ ...form, name_kana: e.target.value })} className={input} />
            <input placeholder="グループ（任意・自由入力）" value={form.group_name}
              onChange={e => setForm({ ...form, group_name: e.target.value })} className={input} />
            <select value={form.partner_id}
              onChange={e => setForm({ ...form, partner_id: e.target.value })} className={input}>
              <option value="">取引先リンクなし</option>
              {partners.map(p => (
                <option key={p.partner_no} value={p.partner_no}>{p.partner_name}</option>
              ))}
            </select>
          </div>
          <input placeholder="メモ（任意）" value={form.memo}
            onChange={e => setForm({ ...form, memo: e.target.value })} className={`${input} w-full`} />

          {/* 着信拒否トグル */}
          <label className="flex items-center gap-2 cursor-pointer w-fit">
            <input type="checkbox" checked={form.blocked}
              onChange={e => setForm({ ...form, blocked: e.target.checked })} className="rounded" />
            <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
              form.blocked ? 'bg-red-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
            }`}>
              着信拒否 {form.blocked ? 'ON' : 'OFF'}
            </span>
            <span className="text-xs text-gray-400 dark:text-gray-500">（FreePBX への拒否反映は Slice 4 で連携）</span>
          </label>

          {/* 電話番号（複数） */}
          <div className="space-y-1.5">
            <div className="text-xs text-gray-500 dark:text-gray-400">
              電話番号（複数可。保存時に正規化されます。1欄に「/」「、」区切りで複数貼り付けも可）
            </div>
            {form.numbers.map((n, i) => (
              <div key={i} className="flex gap-2">
                <input placeholder="電話番号" value={n.raw}
                  onChange={e => setForm({
                    ...form,
                    numbers: form.numbers.map((x, j) => j === i ? { ...x, raw: e.target.value } : x),
                  })}
                  className={`${input} flex-1 font-mono`} />
                <input placeholder="種別（携帯/代表/FAX 等）" value={n.label}
                  onChange={e => setForm({
                    ...form,
                    numbers: form.numbers.map((x, j) => j === i ? { ...x, label: e.target.value } : x),
                  })}
                  className={`${input} w-44`} />
                <button onClick={() => setForm({ ...form, numbers: form.numbers.filter((_, j) => j !== i) })}
                  disabled={form.numbers.length <= 1}
                  className="px-2 rounded border text-xs text-gray-500 dark:text-gray-400 disabled:opacity-30">✕</button>
              </div>
            ))}
            <button onClick={() => setForm({ ...form, numbers: [...form.numbers, { raw: '', label: '' }] })}
              className="px-2 py-1 rounded border text-xs text-gray-600 dark:text-gray-300">＋ 番号追加</button>
          </div>

          {error && <div className="text-xs text-red-600">{error}</div>}
          <div className="flex gap-2">
            <button onClick={save} disabled={saving || !form.name.trim()}
              className="px-4 py-1.5 rounded bg-indigo-600 text-white text-sm disabled:opacity-40">
              {saving ? '…' : '保存'}
            </button>
            <button onClick={() => { setEditingId(null); setError('') }}
              className="px-4 py-1.5 rounded border text-sm text-gray-500 dark:text-gray-400">キャンセル</button>
          </div>
        </div>
      )}

      {!isAdmin && (
        <div className="text-xs text-gray-400 dark:text-gray-500">閲覧のみ（追加・編集・削除は管理者のみ）</div>
      )}
      {error && editingId === null && <div className="text-xs text-red-600">{error}</div>}

      {/* 一覧 */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 dark:text-gray-400 border-b bg-gray-50 dark:bg-gray-800">
              <th className="text-left px-4 py-2">名前</th>
              <th className="text-left px-4 py-2">グループ</th>
              <th className="text-left px-4 py-2">電話番号</th>
              <th className="text-left px-4 py-2">取引先</th>
              <th className="text-left px-4 py-2">メモ</th>
              {isAdmin && <th className="text-center px-4 py-2">操作</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={isAdmin ? 6 : 5} className="text-center py-16 text-gray-400 dark:text-gray-500 text-sm">
                  {entries.length === 0 ? '電話帳は空です' : '該当する連絡先がありません'}
                </td>
              </tr>
            ) : filtered.map(e => (
              <tr key={e.id} className="border-b last:border-0 hover:bg-gray-50 dark:bg-gray-800 align-top">
                <td className="px-4 py-2">
                  <div className="font-medium text-gray-700 dark:text-gray-300">
                    {e.name}
                    {e.blocked && (
                      <span className="ml-1 px-1 py-px rounded text-[10px] font-semibold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                        着信拒否
                      </span>
                    )}
                  </div>
                  {e.name_kana && <div className="text-xs text-gray-400 dark:text-gray-500">{e.name_kana}</div>}
                </td>
                <td className="px-4 py-2 text-xs text-gray-600 dark:text-gray-300">{e.group_name || '—'}</td>
                <td className="px-4 py-2">
                  {e.phonebook_numbers.length === 0 ? '—' : e.phonebook_numbers.map(n => (
                    <div key={n.id} className="font-mono text-xs text-indigo-600 dark:text-indigo-400">
                      {n.phone_raw}
                      {n.label && <span className="ml-1 font-sans text-gray-400 dark:text-gray-500">({n.label})</span>}
                    </div>
                  ))}
                </td>
                <td className="px-4 py-2 text-xs text-gray-600 dark:text-gray-300">{partnerName(e.partner_id) || '—'}</td>
                <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400 max-w-56 truncate">{e.memo || '—'}</td>
                {isAdmin && (
                  <td className="px-4 py-2 text-center whitespace-nowrap">
                    <button onClick={() => openEdit(e)}
                      className="px-2 py-0.5 rounded border text-xs text-gray-600 dark:text-gray-300 mr-1">編集</button>
                    {deletingId === e.id ? (
                      <>
                        <button onClick={() => remove(e.id)} disabled={saving}
                          className="px-2 py-0.5 rounded bg-red-600 text-white text-xs mr-1">本当に削除</button>
                        <button onClick={() => setDeletingId(null)}
                          className="px-2 py-0.5 rounded border text-xs text-gray-500 dark:text-gray-400">✕</button>
                      </>
                    ) : (
                      <button onClick={() => setDeletingId(e.id)}
                        className="px-2 py-0.5 rounded bg-red-100 text-red-600 text-xs">削除</button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
