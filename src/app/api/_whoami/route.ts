import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

// 一時デバッグ用（Slice 1 追補・確認完了後に削除する）:
// nginx auth_request → naisen への認証ヘッダー到達確認。
// role は値を返すが user/email は有無(boolean)のみ（値は返さない）。
export async function GET(req: NextRequest) {
  return NextResponse.json({
    role: req.headers.get("x-auth-role"),
    hasUser: req.headers.get("x-auth-user") !== null,
    hasEmail: req.headers.get("x-auth-email") !== null,
  })
}
