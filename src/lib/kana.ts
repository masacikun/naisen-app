// かな変換ユーティリティ（純関数・テスト対象）。
// kuroshiro の to:'hiragana' は漢字のみ変換しカタカナを残すため、後段でひらがなへ揃える。

/** カタカナ（ァ..ヶ・ヴ含む）をひらがなへ。長音「ー」・記号・英数はそのまま */
export function kataToHira(s: string): string {
  return s.replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60))
}
