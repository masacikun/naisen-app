export type Brand = { id: string; label: string; lines: string[]; active: string }

export const BRANDS: Brand[] = [
  { id: '水炊き',      label: '水炊き・もつ鍋', lines: ['水炊き・もつ鍋'],                            active: 'bg-orange-500 text-white' },
  { id: 'gates',       label: 'gates',           lines: ['gates', '1_gates', '西新'],                  active: 'bg-blue-600 text-white'   },
  { id: 'SmileFood',   label: 'SmileFood',        lines: ['SmileFood'],                                  active: 'bg-emerald-600 text-white' },
  { id: 'CoSmile',     label: 'CoSmile',          lines: ['CoSmile'],                                    active: 'bg-amber-500 text-white'  },
  { id: 'SmileEstate', label: 'SmileEstate',      lines: ['SmileEstate'],                                active: 'bg-violet-600 text-white' },
  { id: 'GACHA',       label: 'GACHA',            lines: ['GACHA'],                                      active: 'bg-red-600 text-white'    },
  { id: 'クリマ',      label: 'クリマバイト',     lines: ['クリマバイト', 'スタッフ中洲', '求人中洲'],  active: 'bg-pink-600 text-white'   },
]

export const BRAND_IDS = BRANDS.map(b => b.id)

export function getActiveLines(selected: Set<string>): string[] | null {
  if (selected.size === 0) return null
  return [...selected].flatMap(id => BRANDS.find(b => b.id === id)?.lines ?? [])
}

// 内線番号の判定: 日本の外線番号は0始まり10〜11桁, 内線は短い番号
export function isInternalCaller(caller?: string | null): boolean {
  if (!caller) return false
  return caller.length < 10 && !caller.startsWith('0')
}
