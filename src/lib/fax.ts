// FAX受信管理の共通定義（2026-07-18）
export const FAX_STATUSES = ['untriaged', 'open', 'done'] as const
export type FaxStatus = (typeof FAX_STATUSES)[number]
export const FAX_STATUS_LABELS: Record<FaxStatus, string> = {
  untriaged: '未仕分け',
  open: '未対応',
  done: '対応済み',
}

export const FAX_CATEGORIES = ['invoice', 'payment', 'other'] as const
export type FaxCategory = (typeof FAX_CATEGORIES)[number]
export const FAX_CATEGORY_LABELS: Record<FaxCategory, string> = {
  invoice: '請求書',
  payment: '支払明細',
  other: 'その他',
}

// 編集可否: admin / shain（camera-app と同方針。閲覧は全ログインユーザー）
export function canEditFax(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'shain'
}

export function isFaxStatus(v: unknown): v is FaxStatus {
  return typeof v === 'string' && (FAX_STATUSES as readonly string[]).includes(v)
}

export function isFaxCategory(v: unknown): v is FaxCategory {
  return typeof v === 'string' && (FAX_CATEGORIES as readonly string[]).includes(v)
}
