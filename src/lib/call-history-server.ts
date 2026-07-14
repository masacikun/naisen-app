// 最終着信の取得（サーバ専用・DB接続あり）。純ロジックは call-history.ts（テスト対象）。
import { supabaseAdmin } from './supabase-admin'
import { latestByCaller, entryLastCall, type CallerTimeRow } from './call-history'

const IN_CHUNK = 100 // .in() の URL 長対策

/** 正規化番号の集合 → caller→最終着信 の Map（チャンク取得・N+1回避） */
export async function fetchLastCallMap(norms: string[]): Promise<Map<string, string>> {
  const uniq = [...new Set(norms.filter(Boolean))]
  const rows: CallerTimeRow[] = []
  for (let i = 0; i < uniq.length; i += IN_CHUNK) {
    const { data } = await supabaseAdmin
      .from('naisen_calls')
      .select('caller,started_at')
      .in('caller', uniq.slice(i, i + IN_CHUNK))
      .order('started_at', { ascending: false })
      .limit(10000)
    rows.push(...((data ?? []) as CallerTimeRow[]))
  }
  return latestByCaller(rows)
}

interface EntryWithNumbers {
  phonebook_numbers: { phone_normalized: string | null }[]
}

/** エントリ配列に last_called_at を付与して返す */
export async function attachLastCalls<T extends EntryWithNumbers>(
  entries: T[],
): Promise<(T & { last_called_at: string | null })[]> {
  const norms = entries.flatMap(e =>
    e.phonebook_numbers.map(n => n.phone_normalized).filter((v): v is string => !!v))
  const byCaller = norms.length > 0 ? await fetchLastCallMap(norms) : new Map<string, string>()
  return entries.map(e => ({ ...e, last_called_at: entryLastCall(e.phonebook_numbers, byCaller) }))
}
