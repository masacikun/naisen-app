// FreePBX 同期フィードの整形（純関数・DB非依存・テスト対象）。
// 契約は docs/freepbx-sync.md（v1）を正とする。

export interface FeedEntry {
  id: number
  name: string
  name_kana: string | null
  group_name: string | null
  memo: string | null
  blocked: boolean
  phonebook_numbers: { phone_raw: string; phone_normalized: string | null; label: string | null }[]
}

export interface ContactItem {
  id: number
  name: string
  name_kana: string | null
  group_name: string | null
  numbers: { normalized: string | null; raw: string; label: string | null }[]
}

export interface BlacklistItem {
  number: string
  label: string
}

/** contacts フィード: blocked=false の連絡先（番号0件も含める。normalized:null も raw 付きで配信し、扱いは puller の判断） */
export function buildContactItems(entries: FeedEntry[]): ContactItem[] {
  return entries
    .filter(e => !e.blocked)
    .map(e => ({
      id: e.id,
      name: e.name,
      name_kana: e.name_kana,
      group_name: e.group_name,
      numbers: e.phonebook_numbers.map(n => ({
        normalized: n.phone_normalized,
        raw: n.phone_raw,
        label: n.label,
      })),
    }))
}

/** blacklist フィード: blocked=true を番号単位に展開。normalized=null は除外・重複番号は先勝ちで dedup */
export function buildBlacklistItems(entries: FeedEntry[]): BlacklistItem[] {
  const seen = new Set<string>()
  const items: BlacklistItem[] = []
  for (const e of entries) {
    if (!e.blocked) continue
    const label = e.memo ? `${e.name}（${e.memo}）` : e.name
    for (const n of e.phonebook_numbers) {
      if (!n.phone_normalized || seen.has(n.phone_normalized)) continue
      seen.add(n.phone_normalized)
      items.push({ number: n.phone_normalized, label })
    }
  }
  return items
}
