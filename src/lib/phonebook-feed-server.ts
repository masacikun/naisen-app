// 電話帳配信フィードの DB アクセス層（純関数側は phonebook-feed.ts）。
// 絞り込みは Acrobits(JSON) / Grandstream(XML) 共通:
//   ?groups=（旧形式・テスト用オーバーライド）＞ ?user=（identity_books→entry_books）＞ 無指定=全件
import { supabaseAdmin } from './supabase-admin'
import {
  resolveBookKeys,
  toFeedEntries,
  type FeedEntry,
  type FeedEntryRow,
} from './phonebook-feed'

const FEED_SELECT =
  'id,name,furigana,blocked,active,updated_at,phonebook_numbers(phone_raw,phone_normalized,label,kind)'

/** 配信キャッシュの Last-Modified（feed_state はトリガで entries/books/掲載/割当の変更時に更新される） */
export async function fetchFeedLastModified(): Promise<Date | null> {
  const { data } = await supabaseAdmin
    .from('phonebook_feed_state')
    .select('updated_at')
    .eq('id', 1)
    .maybeSingle()
  return data?.updated_at ? new Date(data.updated_at) : null
}

export async function fetchFeedEntries(
  user: string | null,
  groups: string[] | null,
): Promise<FeedEntry[]> {
  // 旧形式 ?groups= はテスト用オーバーライド（両方来たら groups 優先）
  if (groups && groups.length > 0) {
    const { data, error } = await supabaseAdmin
      .from('phonebook_entries')
      .select(FEED_SELECT)
      .eq('blocked', false)
      .eq('active', true)
      .in('group_name', groups)
      .order('id')
      .limit(5000)
    if (error) throw new Error(error.message)
    return toFeedEntries((data ?? []) as FeedEntryRow[])
  }

  if (user) {
    const { data: subs, error: subErr } = await supabaseAdmin
      .from('phonebook_identity_books')
      .select('book_key')
      .eq('identity', user)
    if (subErr) throw new Error(subErr.message)
    const books = resolveBookKeys(subs)
    const { data, error } = await supabaseAdmin
      .from('phonebook_entries')
      .select(`${FEED_SELECT},phonebook_entry_books!inner(book_key)`)
      .eq('blocked', false)
      .eq('active', true)
      .in('phonebook_entry_books.book_key', books)
      .order('id')
      .limit(5000)
    if (error) throw new Error(error.message)
    return toFeedEntries((data ?? []) as unknown as FeedEntryRow[])
  }

  // user も groups も無し → 従来どおり全件（既存 GDMS 設定の互換維持）
  const { data, error } = await supabaseAdmin
    .from('phonebook_entries')
    .select(FEED_SELECT)
    .eq('blocked', false)
    .eq('active', true)
    .order('id')
    .limit(5000)
  if (error) throw new Error(error.message)
  return toFeedEntries((data ?? []) as FeedEntryRow[])
}
