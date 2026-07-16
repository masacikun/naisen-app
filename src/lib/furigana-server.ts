// ふりがな（ひらがな）生成: kuroshiro + kuromoji 形態素解析。
// 辞書読込（~15MB・数百ms〜数秒）は初回のみのシングルトン。
// 自動生成は下書き扱い（furigana_verified=false）で、人が確認して verified にする運用。
import path from 'path'
import { kataToHira } from './kana'

interface KuroshiroLike {
  init(analyzer: unknown): Promise<void>
  convert(text: string, options: { to: string; mode: string }): Promise<string>
}

// kuroshiro / analyzer は UMD ビルドのため default の入れ子を吸収する
function unwrapDefault<T>(mod: unknown): T {
  const m = mod as { default?: { default?: unknown } }
  return (m.default?.default ?? m.default ?? mod) as T
}

let kuroshiroPromise: Promise<KuroshiroLike> | null = null

function getKuroshiro(): Promise<KuroshiroLike> {
  if (!kuroshiroPromise) {
    kuroshiroPromise = (async () => {
      const KuroshiroCtor = unwrapDefault<new () => KuroshiroLike>(await import('kuroshiro'))
      const AnalyzerCtor = unwrapDefault<new (opts: { dictPath: string }) => unknown>(
        await import('kuroshiro-analyzer-kuromoji'),
      )
      const kuroshiro = new KuroshiroCtor()
      await kuroshiro.init(
        new AnalyzerCtor({ dictPath: path.join(process.cwd(), 'node_modules/kuromoji/dict') }),
      )
      return kuroshiro
    })()
    // 初期化失敗時は次回リトライできるようリセット
    kuroshiroPromise.catch(() => {
      kuroshiroPromise = null
    })
  }
  return kuroshiroPromise
}

/** 名前 → ひらがな（漢字は kuroshiro・カタカナは kataToHira。記号・英数はそのまま） */
export async function toHiragana(name: string): Promise<string> {
  const kuroshiro = await getKuroshiro()
  const converted = await kuroshiro.convert(name, { to: 'hiragana', mode: 'normal' })
  return kataToHira(converted)
}
