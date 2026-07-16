import { NextRequest, NextResponse } from 'next/server'
import { toHiragana } from '@/lib/furigana-server'

export const dynamic = 'force-dynamic'

// GET /n/api/furigana?name=山田太郎 → { furigana: "やまだたろう" }
// 電話帳フォームの自動入力用（blur / paste で呼ぶ）。nginx の auth_request 配下（内部利用）。
export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get('name')?.trim() ?? ''
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })
  if (name.length > 200) return NextResponse.json({ error: 'name too long' }, { status: 400 })
  try {
    const furigana = await toHiragana(name)
    return NextResponse.json({ furigana })
  } catch {
    return NextResponse.json({ error: 'conversion failed' }, { status: 500 })
  }
}
