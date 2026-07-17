-- FAX削除機能（ゴミ箱・削除日から30日後に完全削除）2026-07-18
-- DM(不要)ステータスは廃止し、削除に一本化（既存 dm 行はゴミ箱へ移行）
ALTER TABLE naisen_fax_messages ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_fax_deleted_at ON naisen_fax_messages (deleted_at) WHERE deleted_at IS NOT NULL;
UPDATE naisen_fax_messages SET deleted_at = now(), status = 'untriaged' WHERE status = 'dm' AND deleted_at IS NULL;
NOTIFY pgrst, 'reload schema';
