// 連絡先/ブラックリストのビュー切替と blocked 相互移動（純関数・テスト対象）。
// 連絡先(normal)=blocked:false のみ / blocked=ブラックリストのみ / all=すべて。

export type PhonebookView = 'normal' | 'blocked' | 'all'

export function filterByView<T extends { blocked: boolean }>(
  entries: T[],
  view: PhonebookView,
): T[] {
  if (view === 'all') return entries
  return entries.filter(e => e.blocked === (view === 'blocked'))
}

/**
 * blocked トグルの PUT ボディ。blocked のみを送る（区分・掲載・番号は現状維持）。
 * 解除→連絡先へ戻る（区分は元のまま＝未分類なら未分類）／追加→ブラックリストへ。
 */
export function blockedTogglePatch(entry: { blocked: boolean }): { blocked: boolean } {
  return { blocked: !entry.blocked }
}
