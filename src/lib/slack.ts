import 'server-only'

// Slack Incoming Webhook 通知（FAX受信・2026-07-18）。
// SLACK_FAX_WEBHOOK 未設定時は明示ログを出してスキップ（fail-safe・登録処理は止めない）
export async function notifySlackFax(text: string): Promise<void> {
  const url = process.env.SLACK_FAX_WEBHOOK?.trim()
  if (!url) {
    console.log('[fax] SLACK_FAX_WEBHOOK 未設定: Slack通知をスキップ')
    return
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  if (!res.ok) {
    throw new Error(`slack webhook error ${res.status}: ${(await res.text()).slice(0, 200)}`)
  }
  console.log('[fax] Slack通知OK')
}
