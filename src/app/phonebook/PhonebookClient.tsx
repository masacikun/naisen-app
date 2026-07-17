'use client'
import { Fragment, useState } from 'react'
import Link from 'next/link'
import { normalizePhone, splitPhones } from '@/lib/phone'
import { filterByView, blockedTogglePatch, type PhonebookView } from '@/lib/phonebook-view'

export type PhoneNumber = {
  id: number
  phone_raw: string
  phone_normalized: string | null
  label: string | null
  kind: string
}
export type Entry = {
  id: number
  name: string
  name_kana: string | null
  furigana: string | null
  furigana_verified: boolean
  category_key: string
  active: boolean
  group_name: string | null
  memo: string | null
  partner_id: number | null
  blocked: boolean
  updated_at: string
  last_called_at: string | null
  phonebook_numbers: PhoneNumber[]
  phonebook_entry_books: { book_key: string }[]
}
export type PartnerOption = { partner_no: number; partner_name: string; phone?: string | null }
export type CategoryOption = { key: string; name: string; sort: number; is_system: boolean }
export type BookOption = { key: string; name: string; sort: number }

type NumberForm = { raw: string; label: string; kind: string }
type View = PhonebookView
type HistoryRow = {
  started_at: string; caller: string; line_name: string | null
  status: string; duration_sec: number; recording_file: string | null
}
type HistoryData = { total: number; page: number; pageSize: number; rows: HistoryRow[] }

const emptyForm = {
  name: '', furigana: '', category_key: 'unclassified',
  group_name: '', memo: '', partner_id: '' as string,
  blocked: false,
  book_keys: ['all'] as string[],
  numbers: [{ raw: '', label: '', kind: 'external' }] as NumberForm[],
}

const VIEWS: { key: View; label: string }[] = [
  { key: 'normal',  label: '連絡先' },
  { key: 'blocked', label: 'ブラックリスト' },
  { key: 'all',     label: 'すべて' },
]

const KIND_OPTIONS = [
  { key: 'external',    label: '外部' },
  { key: 'extension',   label: '内線' },
  { key: 'company_050', label: '外線050' },
  { key: 'mobile',      label: '携帯' },
  { key: 'ap',          label: 'AP' },
]
const KIND_BADGE: Record<string, string> = {
  extension:   'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  company_050: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  mobile:      'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  ap:          'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
}
const KIND_LABEL: Record<string, string> = {
  extension: '内線', company_050: '外線', mobile: '携帯', ap: 'AP',
}

const STATUS_STYLE: Record<string, string> = {
  'ANSWERED':  'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
  'NO ANSWER': 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400',
  'BUSY':      'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400',
  'FAILED':    'bg-gray-100 dark:bg-gray-800 text-slate-500',
}
const STATUS_LABEL: Record<string, string> = {
  'ANSWERED': '応答', 'NO ANSWER': '不在', 'BUSY': '話中', 'FAILED': 'FAILED',
}

function fmtDateTime(s: string | null) {
  if (!s) return ''
  const d = new Date(new Date(s).getTime() + 9 * 60 * 60 * 1000)
  return `${d.getUTCFullYear()}/${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}
function fmtSec(s: number) {
  if (!s) return '-'
  const m = Math.floor(s / 60)
  return m ? `${m}分${s % 60 ? s % 60 + '秒' : ''}` : `${s}秒`
}

export default function PhonebookClient({
  initialEntries, partners, initialCategories, initialBooks, isAdmin, initialQ = '',
}: {
  initialEntries: Entry[]; partners: PartnerOption[]
  initialCategories: CategoryOption[]; initialBooks: BookOption[]
  isAdmin: boolean; initialQ?: string
}) {
  const [entries, setEntries] = useState<Entry[]>(initialEntries)
  const [categories, setCategories] = useState<CategoryOption[]>(initialCategories)
  const [books, setBooks] = useState<BookOption[]>(initialBooks)
  const [view, setView] = useState<View>(initialQ ? 'all' : 'normal')
  const [q, setQ] = useState(initialQ)
  const [categoryFilter, setCategoryFilter] = useState('')
  const [activeOnly, setActiveOnly] = useState(true)
  const [editingId, setEditingId] = useState<number | 'new' | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [furiganaEdited, setFuriganaEdited] = useState(false)
  const [furiganaLoading, setFuriganaLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState<number | null>(null)

  // 区分・電話帳の管理パネル（admin）
  const [managing, setManaging] = useState<'category' | 'book' | null>(null)
  const [newItemName, setNewItemName] = useState('')
  const [deletingKey, setDeletingKey] = useState<string | null>(null)
  const [manageError, setManageError] = useState('')

  // 履歴オンデマンド（開いた時だけ取得）
  const [historyId, setHistoryId] = useState<number | null>(null)
  const [history, setHistory] = useState<HistoryData | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)

  const partnerName = (id: number | null) =>
    id == null ? '' : partners.find(p => p.partner_no === id)?.partner_name ?? `#${id}`
  const categoryName = (key: string) => categories.find(c => c.key === key)?.name ?? key
  const bookName = (key: string) => books.find(b => b.key === key)?.name ?? key

  const blockedCount = entries.filter(e => e.blocked).length
  let viewEntries = filterByView(entries, view)
  if (categoryFilter) viewEntries = viewEntries.filter(e => e.category_key === categoryFilter)
  if (activeOnly) viewEntries = viewEntries.filter(e => e.active)

  const qNorm = q.replace(/[^0-9]/g, '')
  const filtered = q
    ? viewEntries.filter(e =>
        [e.name, e.name_kana, e.furigana, e.group_name, categoryName(e.category_key), partnerName(e.partner_id), e.memo].some(v => v?.includes(q)) ||
        (qNorm.length > 0 && e.phonebook_numbers.some(n =>
          n.phone_normalized?.includes(qNorm) || n.phone_raw.includes(q))))
    : viewEntries

  async function reload() {
    const res = await fetch('/n/api/phonebook')
    if (res.ok) setEntries(await res.json())
  }

  async function openHistory(id: number, page = 1) {
    if (historyId === id && page === history?.page) { setHistoryId(null); setHistory(null); return }
    setHistoryId(id)
    setHistoryLoading(true)
    try {
      const res = await fetch(`/n/api/phonebook/${id}/calls?page=${page}`)
      setHistory(res.ok ? await res.json() : { total: 0, page: 1, pageSize: 50, rows: [] })
    } finally { setHistoryLoading(false) }
  }

  // 名前 blur / paste でふりがなを自動入力（人が直した値は上書きしない）
  async function autoFurigana(name: string) {
    if (!name.trim() || furiganaEdited) return
    setFuriganaLoading(true)
    try {
      const res = await fetch(`/n/api/furigana?name=${encodeURIComponent(name.trim())}`)
      if (!res.ok) return
      const j = await res.json()
      if (j.furigana) {
        setForm(f => (furiganaEdited ? f : { ...f, furigana: j.furigana }))
      }
    } finally { setFuriganaLoading(false) }
  }

  function openNew() {
    setForm({ ...emptyForm, blocked: view === 'blocked' })
    setFuriganaEdited(false)
    setEditingId('new')
    setError('')
  }

  function openEdit(e: Entry) {
    setForm({
      name: e.name,
      furigana: e.furigana ?? e.name_kana ?? '',
      category_key: e.category_key,
      group_name: e.group_name ?? '',
      memo: e.memo ?? '',
      partner_id: e.partner_id != null ? String(e.partner_id) : '',
      blocked: e.blocked,
      book_keys: e.phonebook_entry_books.map(b => b.book_key),
      numbers: e.phonebook_numbers.length > 0
        ? e.phonebook_numbers.map(n => ({ raw: n.phone_raw, label: n.label ?? '', kind: n.kind || 'external' }))
        : [{ raw: '', label: '', kind: 'external' }],
    })
    setFuriganaEdited(!!(e.furigana ?? e.name_kana)) // 既存値は勝手に上書きしない
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
        furigana: form.furigana || null,
        category_key: form.category_key,
        group_name: form.group_name || null,
        memo: form.memo || null,
        partner_id: form.partner_id ? parseInt(form.partner_id) : null,
        blocked: form.blocked,
        book_keys: form.book_keys,
        numbers: form.numbers
          .filter(n => n.raw.trim())
          .map(n => ({ raw: n.raw, label: n.label || null, kind: n.kind })),
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

  // 行単位の blocked トグル（連絡先⇄ブラックリスト相互移動・区分は現状維持）
  async function toggleBlocked(e: Entry) {
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/n/api/phonebook/${e.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(blockedTogglePatch(e)),
      })
      if (!res.ok) {
        setError(res.status === 403 ? '変更は管理者のみ可能です' : `エラー (${res.status})`)
        return
      }
      await reload()
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

  // 区分・電話帳の管理（追加・削除）
  async function addManagedItem() {
    if (!newItemName.trim() || !managing) return
    setManageError('')
    const url = managing === 'category' ? '/n/api/phonebook/categories' : '/n/api/phonebook/books'
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newItemName.trim() }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => null)
      setManageError(j?.error ?? `追加エラー (${res.status})`)
      return
    }
    setNewItemName('')
    await reloadMasters()
  }

  async function removeManagedItem(key: string) {
    if (!managing) return
    setManageError('')
    const url = managing === 'category'
      ? `/n/api/phonebook/categories/${encodeURIComponent(key)}`
      : `/n/api/phonebook/books/${encodeURIComponent(key)}`
    const res = await fetch(url, { method: 'DELETE' })
    if (!res.ok) {
      const j = await res.json().catch(() => null)
      setManageError(j?.error ?? `削除エラー (${res.status})`)
      setDeletingKey(null)
      return
    }
    setDeletingKey(null)
    await Promise.all([reloadMasters(), reload()])
  }

  async function reloadMasters() {
    const [cRes, bRes] = await Promise.all([
      fetch('/n/api/phonebook/categories'),
      fetch('/n/api/phonebook/books'),
    ])
    if (cRes.ok) setCategories(await cRes.json())
    if (bRes.ok) setBooks(await bRes.json())
  }

  function toggleBookKey(key: string) {
    setForm(f => ({
      ...f,
      book_keys: f.book_keys.includes(key)
        ? f.book_keys.filter(k => k !== key)
        : [...f.book_keys, key],
    }))
  }

  const input = 'border dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 rounded px-3 py-1.5 text-sm'
  const nCols = isAdmin ? 8 : 7

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800 dark:text-gray-200">連絡先</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {entries.length - blockedCount} 件＋BL {blockedCount} 件
          </span>
          <Link href="/phonebook/devices"
            className="px-3 py-1.5 rounded border text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
            端末電話帳 →
          </Link>
          {isAdmin && (
            <button onClick={openNew}
              className="px-3 py-1.5 rounded bg-indigo-600 text-white text-sm hover:bg-indigo-700 font-medium">
              ＋ 新規追加
            </button>
          )}
        </div>
      </div>

      {/* ビュー切替＋検索＋フィルタ */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1">
            {VIEWS.map(v => (
              <button key={v.key} onClick={() => setView(v.key)}
                className={`px-3 py-1 rounded text-xs font-medium border transition-colors ${
                  view === v.key
                    ? v.key === 'blocked'
                      ? 'bg-red-600 text-white border-red-600'
                      : 'bg-slate-700 text-white border-slate-700'
                    : 'bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 border-slate-300 dark:border-gray-600 hover:bg-slate-50 dark:hover:bg-gray-700'
                }`}>
                {v.label}
              </button>
            ))}
          </div>
          <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
            className={`${input} py-1 text-xs`}>
            <option value="">区分: すべて</option>
            {categories.map(c => (
              <option key={c.key} value={c.key}>{c.name}</option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 cursor-pointer">
            <input type="checkbox" checked={activeOnly} onChange={e => setActiveOnly(e.target.checked)} className="rounded" />
            在職者のみ
          </label>
          {isAdmin && (
            <div className="ml-auto flex gap-1">
              <button onClick={() => { setManaging(managing === 'category' ? null : 'category'); setManageError(''); setDeletingKey(null) }}
                className={`px-2 py-1 rounded border text-xs ${managing === 'category' ? 'bg-slate-700 text-white border-slate-700' : 'text-gray-500 dark:text-gray-400'}`}>
                区分を管理
              </button>
              <button onClick={() => { setManaging(managing === 'book' ? null : 'book'); setManageError(''); setDeletingKey(null) }}
                className={`px-2 py-1 rounded border text-xs ${managing === 'book' ? 'bg-slate-700 text-white border-slate-700' : 'text-gray-500 dark:text-gray-400'}`}>
                電話帳を管理
              </button>
            </div>
          )}
        </div>
        <input type="text" placeholder="名前・ふりがな・区分・取引先・電話番号で検索..."
          value={q} onChange={e => setQ(e.target.value)}
          className={`${input} w-full`} />
      </div>

      {/* 区分・電話帳の管理パネル（admin） */}
      {isAdmin && managing && (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-amber-300 dark:border-amber-700 p-4 space-y-3">
          <div className="text-sm font-bold text-gray-700 dark:text-gray-300">
            {managing === 'category' ? '区分を管理' : '電話帳を管理'}
            <span className="ml-2 font-normal text-xs text-gray-400 dark:text-gray-500">
              {managing === 'category'
                ? '削除すると所属していた連絡先は「未分類」になります'
                : '削除すると掲載・端末への割り当てから自動で外れます'}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {(managing === 'category' ? categories : books).map(item => {
              const isSystem = managing === 'category'
                ? (item as CategoryOption).is_system
                : item.key === 'all'
              return (
                <span key={item.key}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-full border text-xs text-gray-600 dark:text-gray-300 dark:border-gray-600">
                  {item.name}
                  {isSystem ? (
                    <span className="text-[10px] text-gray-400 dark:text-gray-500">（削除不可）</span>
                  ) : deletingKey === item.key ? (
                    <>
                      <button onClick={() => removeManagedItem(item.key)}
                        className="px-1.5 py-px rounded bg-red-600 text-white text-[10px]">削除する</button>
                      <button onClick={() => setDeletingKey(null)}
                        className="px-1 text-[10px] text-gray-400">✕</button>
                    </>
                  ) : (
                    <button onClick={() => setDeletingKey(item.key)}
                      className="text-gray-400 hover:text-red-600">✕</button>
                  )}
                </span>
              )
            })}
            <span className="inline-flex items-center gap-1">
              <input placeholder={managing === 'category' ? '新しい区分名' : '新しい電話帳名'}
                value={newItemName} onChange={e => setNewItemName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addManagedItem() }}
                className={`${input} py-1 text-xs w-36`} />
              <button onClick={addManagedItem} disabled={!newItemName.trim()}
                className="px-2 py-1 rounded bg-indigo-600 text-white text-xs disabled:opacity-40">追加</button>
            </span>
          </div>
          {manageError && <div className="text-xs text-red-600">{manageError}</div>}
        </div>
      )}

      {/* 追加・編集フォーム（admin のみ） */}
      {isAdmin && editingId !== null && (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-indigo-300 dark:border-indigo-700 p-4 space-y-3">
          <div className="text-sm font-bold text-gray-700 dark:text-gray-300">
            {editingId === 'new' ? '新規追加' : '編集'}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input placeholder="名前（必須）" value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              onBlur={e => autoFurigana(e.target.value)}
              onPaste={e => {
                const pasted = e.clipboardData.getData('text')
                if (pasted.trim()) setTimeout(() => autoFurigana(pasted), 0)
              }}
              className={input} />
            <input placeholder={furiganaLoading ? 'ふりがな生成中…' : 'ふりがな（自動・修正可）'}
              value={form.furigana}
              onChange={e => { setFuriganaEdited(true); setForm({ ...form, furigana: e.target.value }) }}
              className={input} />
            <select value={form.category_key}
              onChange={e => setForm({ ...form, category_key: e.target.value })} className={input}>
              {categories.map(c => (
                <option key={c.key} value={c.key}>{c.name}</option>
              ))}
            </select>
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

          {/* 掲載電話帳（多対多。0件＝どの端末にも配信されない） */}
          <div className="space-y-1">
            <div className="text-xs text-gray-500 dark:text-gray-400">掲載する電話帳（0件＝端末に配信されません）</div>
            <div className="flex flex-wrap gap-1.5">
              {books.map(b => (
                <button key={b.key} onClick={() => toggleBookKey(b.key)}
                  className={`px-2.5 py-1 rounded-full border text-xs font-medium transition-colors ${
                    form.book_keys.includes(b.key)
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 border-slate-300 dark:border-gray-600'
                  }`}>
                  {b.name}
                </button>
              ))}
            </div>
          </div>

          {/* 着信拒否トグル */}
          <label className="flex items-center gap-2 cursor-pointer w-fit">
            <input type="checkbox" checked={form.blocked}
              onChange={e => setForm({ ...form, blocked: e.target.checked })} className="rounded" />
            <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
              form.blocked ? 'bg-red-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
            }`}>
              着信拒否 {form.blocked ? 'ON' : 'OFF'}
            </span>
            <span className="text-xs text-gray-400 dark:text-gray-500">（拒否中は端末電話帳にも配信されません）</span>
          </label>

          {/* 電話番号（複数） */}
          <div className="space-y-1.5">
            <div className="text-xs text-gray-500 dark:text-gray-400">
              電話番号（複数可。保存時に正規化されます。1欄に「/」「、」区切りで複数貼り付けも可。
              種別: 外部=取引先など（表示そのまま） / 内線=SIP内線→「内線)」/ 外線050=社員の050→「外線)」/
              携帯=社員の携帯→「携帯)」/ AP=アルバイトの外線→「AP)」が配信・着信表示に付きます）
            </div>
            {form.numbers.map((n, i) => (
              <div key={i} className="flex gap-2">
                <input placeholder="電話番号" value={n.raw}
                  onChange={e => setForm({
                    ...form,
                    numbers: form.numbers.map((x, j) => j === i ? { ...x, raw: e.target.value } : x),
                  })}
                  className={`${input} flex-1 font-mono`} />
                <select value={n.kind}
                  onChange={e => setForm({
                    ...form,
                    numbers: form.numbers.map((x, j) => j === i ? { ...x, kind: e.target.value } : x),
                  })}
                  className={`${input} w-24`}>
                  {KIND_OPTIONS.map(k => <option key={k.key} value={k.key}>{k.label}</option>)}
                </select>
                <input placeholder="ラベル（携帯/代表 等）" value={n.label}
                  onChange={e => setForm({
                    ...form,
                    numbers: form.numbers.map((x, j) => j === i ? { ...x, label: e.target.value } : x),
                  })}
                  className={`${input} w-40`} />
                <button onClick={() => setForm({ ...form, numbers: form.numbers.filter((_, j) => j !== i) })}
                  disabled={form.numbers.length <= 1}
                  className="px-2 rounded border text-xs text-gray-500 dark:text-gray-400 disabled:opacity-30">✕</button>
              </div>
            ))}
            <button onClick={() => setForm({ ...form, numbers: [...form.numbers, { raw: '', label: '', kind: 'external' }] })}
              className="px-2 py-1 rounded border text-xs text-gray-600 dark:text-gray-300">＋ 番号追加</button>
            {(() => {
              // 案B: 入力番号が取引先マスタと一致したらリンクを提案（自動マージはしない・人間が確定）
              const norms = form.numbers
                .flatMap(n => splitPhones(n.raw))
                .map(sp => sp.normalized)
                .filter((x): x is string => !!x)
              if (norms.length === 0) return null
              const cur = form.partner_id ? parseInt(form.partner_id) : null
              const hits = partners.filter(p => {
                if (!p.phone || p.partner_no === cur) return false
                const pn = normalizePhone(p.phone)
                return !!pn && norms.includes(pn)
              })
              if (hits.length === 0) return null
              return (
                <div className="rounded border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 space-y-1">
                  {hits.map(p => (
                    <div key={p.partner_no} className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-300">
                      <span>取引先「{p.partner_name}」が同じ番号です</span>
                      <button onClick={() => setForm({ ...form, partner_id: String(p.partner_no) })}
                        className="px-2 py-0.5 rounded bg-emerald-600 text-white text-xs">リンクする</button>
                    </div>
                  ))}
                </div>
              )
            })()}
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
              <th className="text-left px-4 py-2">区分</th>
              <th className="text-left px-4 py-2">電話番号</th>
              <th className="text-left px-4 py-2">掲載電話帳</th>
              <th className="text-left px-4 py-2">取引先</th>
              <th className="text-left px-4 py-2">メモ</th>
              <th className="text-left px-4 py-2">最終着信</th>
              {isAdmin && <th className="text-center px-4 py-2">操作</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={nCols} className="text-center py-16 text-gray-400 dark:text-gray-500 text-sm">
                  {entries.length === 0 ? '連絡先は空です' : '該当する連絡先がありません'}
                </td>
              </tr>
            ) : filtered.map(e => (
              <Fragment key={e.id}>
              <tr className="border-b last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/60 align-top">
                <td className="px-4 py-2">
                  <div className="font-medium text-gray-700 dark:text-gray-300">
                    {e.name}
                    {e.blocked && (
                      <span className="ml-1 px-1 py-px rounded text-[10px] font-semibold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                        着信拒否
                      </span>
                    )}
                    {!e.active && (
                      <span className="ml-1 px-1 py-px rounded text-[10px] font-semibold bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                        退職
                      </span>
                    )}
                  </div>
                  {(e.furigana || e.name_kana) && (
                    <div className="text-xs text-gray-400 dark:text-gray-500">{e.furigana ?? e.name_kana}</div>
                  )}
                </td>
                <td className="px-4 py-2 text-xs text-gray-600 dark:text-gray-300">
                  {e.category_key === 'unclassified' ? '—' : categoryName(e.category_key)}
                </td>
                <td className="px-4 py-2">
                  {e.phonebook_numbers.length === 0 ? '—' : e.phonebook_numbers.map(n => (
                    <div key={n.id} className="font-mono text-xs text-indigo-600 dark:text-indigo-400">
                      {KIND_LABEL[n.kind] && (
                        <span className={`mr-1 px-1 py-px rounded font-sans text-[10px] font-semibold ${KIND_BADGE[n.kind]}`}>
                          {KIND_LABEL[n.kind]}
                        </span>
                      )}
                      {n.phone_raw}
                      {n.label && <span className="ml-1 font-sans text-gray-400 dark:text-gray-500">({n.label})</span>}
                    </div>
                  ))}
                </td>
                <td className="px-4 py-2 text-xs">
                  {e.phonebook_entry_books.length === 0 ? (
                    <span className="text-gray-400 dark:text-gray-500">非掲載</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {e.phonebook_entry_books.map(b => (
                        <span key={b.book_key} className="px-1.5 py-px rounded-full border text-[10px] text-gray-500 dark:text-gray-400 dark:border-gray-600">
                          {bookName(b.book_key)}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-4 py-2 text-xs text-gray-600 dark:text-gray-300">{partnerName(e.partner_id) || '—'}</td>
                <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400 max-w-56 truncate">{e.memo || '—'}</td>
                <td className="px-4 py-2 whitespace-nowrap">
                  <div className="text-xs text-gray-600 dark:text-gray-300">{fmtDateTime(e.last_called_at) || '—'}</div>
                  {e.phonebook_numbers.some(n => n.phone_normalized) && (
                    <button onClick={() => openHistory(e.id)}
                      className={`mt-0.5 px-2 py-0.5 rounded border text-[11px] ${
                        historyId === e.id
                          ? 'bg-slate-700 text-white border-slate-700'
                          : 'text-gray-500 dark:text-gray-400'
                      }`}>
                      {historyId === e.id ? '履歴を閉じる' : '履歴'}
                    </button>
                  )}
                </td>
                {isAdmin && (
                  <td className="px-4 py-2 text-center whitespace-nowrap">
                    <button onClick={() => openEdit(e)}
                      className="px-2 py-0.5 rounded border text-xs text-gray-600 dark:text-gray-300 mr-1">編集</button>
                    <button onClick={() => toggleBlocked(e)} disabled={saving}
                      title={e.blocked ? '解除して連絡先へ戻す（区分は維持）' : 'ブラックリストへ移動'}
                      className={`px-2 py-0.5 rounded text-xs mr-1 ${
                        e.blocked
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                          : 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
                      }`}>
                      {e.blocked ? '解除' : 'BLへ'}
                    </button>
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
              {historyId === e.id && (
                <tr key={`h-${e.id}`} className="border-b bg-slate-50 dark:bg-gray-800/60">
                  <td colSpan={nCols} className="px-6 py-3">
                    {historyLoading ? (
                      <div className="text-xs text-gray-400 dark:text-gray-500 py-2">読込中…</div>
                    ) : !history || history.total === 0 ? (
                      <div className="text-xs text-gray-400 dark:text-gray-500 py-2">着信履歴はありません</div>
                    ) : (
                      <div className="space-y-2">
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          着信履歴 {history.total.toLocaleString()} 件
                          （{history.page} / {Math.max(1, Math.ceil(history.total / history.pageSize))} ページ）
                        </div>
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-gray-400 dark:text-gray-500 border-b">
                              <th className="text-left py-1 pr-4">日時</th>
                              <th className="text-left py-1 pr-4">発信元</th>
                              <th className="text-left py-1 pr-4">回線</th>
                              <th className="text-center py-1 pr-4">通話時間</th>
                              <th className="text-center py-1 pr-4">ステータス</th>
                              <th className="text-left py-1">録音</th>
                            </tr>
                          </thead>
                          <tbody>
                            {history.rows.map((r, i) => (
                              <tr key={i} className="border-b last:border-0">
                                <td className="py-1 pr-4 whitespace-nowrap text-gray-600 dark:text-gray-300">{fmtDateTime(r.started_at)}</td>
                                <td className="py-1 pr-4 font-mono text-indigo-600 dark:text-indigo-400">{r.caller}</td>
                                <td className="py-1 pr-4 text-gray-600 dark:text-gray-300">{r.line_name || '—'}</td>
                                <td className="py-1 pr-4 text-center text-gray-600 dark:text-gray-300">{fmtSec(r.duration_sec)}</td>
                                <td className="py-1 pr-4 text-center">
                                  <span className={`px-1.5 py-0.5 rounded font-semibold ${STATUS_STYLE[r.status] || 'bg-gray-100 dark:bg-gray-800 text-slate-500'}`}>
                                    {STATUS_LABEL[r.status] || r.status}
                                  </span>
                                </td>
                                <td className="py-1 text-gray-400 dark:text-gray-500 max-w-48 truncate" title={r.recording_file ?? ''}>
                                  {r.recording_file ? `🎙 ${r.recording_file}` : '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {history.total > history.pageSize && (
                          <div className="flex gap-2 items-center">
                            <button disabled={history.page <= 1 || historyLoading}
                              onClick={() => openHistory(e.id, history.page - 1)}
                              className="px-2 py-0.5 rounded border text-xs disabled:opacity-30">◀ 前へ</button>
                            <button disabled={history.page >= Math.ceil(history.total / history.pageSize) || historyLoading}
                              onClick={() => openHistory(e.id, history.page + 1)}
                              className="px-2 py-0.5 rounded border text-xs disabled:opacity-30">次へ ▶</button>
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
