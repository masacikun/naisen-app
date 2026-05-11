'use client'
import { useRef, useState, useCallback } from 'react'

type FileResult = { file: string; count?: number; error?: string; status: 'ok' | 'error' }
type FileEntry = { file: File; status: 'pending' | 'uploading' | 'ok' | 'error'; count?: number; error?: string }

export default function UploadClient() {
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const addFiles = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files).filter(f => f.name.match(/^cdr.*\.csv$/i))
    if (!arr.length) return
    setEntries(prev => {
      const existing = new Set(prev.map(e => e.file.name))
      const next = arr.filter(f => !existing.has(f.name)).map(f => ({ file: f, status: 'pending' as const }))
      return [...prev, ...next]
    })
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    addFiles(e.dataTransfer.files)
  }, [addFiles])

  const onInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(e.target.files)
    e.target.value = ''
  }, [addFiles])

  const upload = async () => {
    const pending = entries.filter(e => e.status === 'pending')
    if (!pending.length || uploading) return
    setUploading(true)

    for (const entry of pending) {
      setEntries(prev => prev.map(e => e.file.name === entry.file.name ? { ...e, status: 'uploading' } : e))
      try {
        const fd = new FormData()
        fd.append('files', entry.file)
        const res = await fetch('/api/upload-cdr', { method: 'POST', body: fd })
        const json = await res.json()
        const result: FileResult = json.results?.[0] ?? { file: entry.file.name, status: 'error', error: 'Unknown error' }
        setEntries(prev => prev.map(e =>
          e.file.name === entry.file.name
            ? { ...e, status: result.status, count: result.count, error: result.error }
            : e
        ))
      } catch (err) {
        setEntries(prev => prev.map(e =>
          e.file.name === entry.file.name ? { ...e, status: 'error', error: String(err) } : e
        ))
      }
    }
    setUploading(false)
  }

  const clear = () => setEntries(prev => prev.filter(e => e.status === 'pending'))
  const totalImported = entries.filter(e => e.status === 'ok').reduce((s, e) => s + (e.count ?? 0), 0)
  const pendingCount = entries.filter(e => e.status === 'pending').length

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-xl font-bold text-slate-800">CDR CSVアップロード</h1>

      <div
        onDrop={onDrop}
        onDragOver={e => e.preventDefault()}
        onClick={() => inputRef.current?.click()}
        className="border-2 border-dashed border-slate-300 rounded-xl p-10 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
      >
        <div className="text-4xl mb-3">📂</div>
        <p className="text-slate-600 font-medium">cdr*.csv をここにドロップ</p>
        <p className="text-slate-400 text-sm mt-1">またはクリックしてファイルを選択</p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          multiple
          className="hidden"
          onChange={onInputChange}
        />
      </div>

      {entries.length > 0 && (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b bg-slate-50">
            <span className="text-sm font-semibold text-slate-700">{entries.length} ファイル</span>
            <button onClick={clear} className="text-xs text-slate-400 hover:text-red-500 transition-colors">
              完了済みを除去
            </button>
          </div>
          <ul className="divide-y">
            {entries.map(e => (
              <li key={e.file.name} className="flex items-center gap-3 px-4 py-3">
                <StatusIcon status={e.status} />
                <span className="flex-1 text-sm text-slate-700 truncate">{e.file.name}</span>
                <span className="text-xs text-slate-400 shrink-0">
                  {(e.file.size / 1024).toFixed(0)} KB
                </span>
                {e.status === 'ok' && (
                  <span className="text-xs font-semibold text-green-600 shrink-0">{e.count?.toLocaleString()} 件</span>
                )}
                {e.status === 'error' && (
                  <span className="text-xs text-red-500 shrink-0 max-w-[200px] truncate" title={e.error}>エラー</span>
                )}
              </li>
            ))}
          </ul>
          <div className="px-4 py-3 border-t bg-slate-50 flex items-center justify-between">
            {totalImported > 0 && (
              <span className="text-sm text-green-600 font-semibold">合計 {totalImported.toLocaleString()} 件インポート済み</span>
            )}
            <div className="ml-auto flex gap-2">
              <button
                onClick={upload}
                disabled={uploading || pendingCount === 0}
                className="px-5 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {uploading ? 'インポート中…' : `インポート開始 (${pendingCount}件)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StatusIcon({ status }: { status: FileEntry['status'] }) {
  if (status === 'pending')   return <span className="w-5 h-5 rounded-full border-2 border-slate-300 shrink-0" />
  if (status === 'uploading') return <span className="w-5 h-5 rounded-full border-2 border-blue-400 border-t-transparent animate-spin shrink-0" />
  if (status === 'ok')        return <span className="w-5 h-5 text-green-500 shrink-0 text-base leading-none">✓</span>
  return                             <span className="w-5 h-5 text-red-500 shrink-0 text-base leading-none">✗</span>
}
