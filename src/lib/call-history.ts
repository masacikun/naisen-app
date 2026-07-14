// 最終着信・履歴オンデマンド（Slice 3）。
// 対象は着信のみ = naisen_calls.caller とエントリの正規化番号の完全一致。
// naisen_calls は read-only・DDL なし（既存 idx_naisen_calls_caller を利用）。
// 旧データの先頭0欠落分（約5,900件）は一致しない（既決「そのまま」どおり）。
export interface CallerTimeRow {
  caller: string
  started_at: string
}

/** caller ごとの最新 started_at に縮約（純関数） */
export function latestByCaller(rows: CallerTimeRow[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const r of rows) {
    if (!r.caller || !r.started_at) continue
    const cur = map.get(r.caller)
    if (!cur || r.started_at > cur) map.set(r.caller, r.started_at)
  }
  return map
}

/** エントリの複数番号を最終着信1値（最大）へ集約（純関数）。該当なしは null */
export function entryLastCall(
  numbers: { phone_normalized: string | null }[],
  byCaller: Map<string, string>,
): string | null {
  let last: string | null = null
  for (const n of numbers) {
    if (!n.phone_normalized) continue
    const t = byCaller.get(n.phone_normalized)
    if (t && (!last || t > last)) last = t
  }
  return last
}

