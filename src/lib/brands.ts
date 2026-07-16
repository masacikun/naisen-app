export type Brand = { id: string; label: string; lines: string[]; active: string }

// lines には新（TelPro着信名称）旧（旧電話サービス）両方の回線名を含める（過去データも検索可能に）
export const BRANDS: Brand[] = [
  { id: 'gates',       label: '水炊き大和',       lines: ['水炊き大和', 'gates', '1_gates'],                        active: 'bg-blue-600 text-white'   },
  { id: '水炊き',      label: '水炊き・もつ鍋',   lines: ['水炊き・もつ鍋'],                                        active: 'bg-orange-500 text-white' },
  { id: '西新',        label: '西新餃子',         lines: ['西新餃子スタンド大和', '西新'],                          active: 'bg-cyan-600 text-white'   },
  { id: 'GACHA',       label: 'GACHA',            lines: ['GACHA'],                                                  active: 'bg-red-600 text-white'    },
  { id: 'HYD',         label: '博多大和ダイニング', lines: ['博多大和ダイニング'],                                   active: 'bg-indigo-600 text-white' },
  { id: 'SmileFood',   label: 'SmileFood',        lines: ['SmileFood'],                                              active: 'bg-emerald-600 text-white' },
  { id: 'CoSmile',     label: 'CoSmile',          lines: ['CoSmile'],                                                active: 'bg-amber-500 text-white'  },
  { id: 'SmileEstate', label: 'SmileEstate',      lines: ['SmileEstate'],                                            active: 'bg-violet-600 text-white' },
  { id: 'クリマ',      label: '求人',             lines: ['HYD_求人', 'クリマバイト', 'スタッフ中洲', '求人中洲'],  active: 'bg-pink-600 text-white'   },
  { id: '通販',        label: '通販',             lines: ['通販_問い合わせ', 'online_order'],                        active: 'bg-teal-600 text-white'   },
  { id: '直通',        label: '直通',             lines: ['小林 直通', '楠原 直通', '武富 直通', '主計 直通', '鴨川 直通', '田原 直通', 'Central'], active: 'bg-slate-600 text-white' },
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
