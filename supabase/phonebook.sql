-- 電話帳（Phase 1 / Slice 1・2026-07-13）additive-only
-- phonebook_entries: 連絡先（1件） / phonebook_numbers: 連絡先に紐づく電話番号（複数）
-- 番号の突合キーは phone_normalized（src/lib/phone.ts の normalizePhone 結果・完全一致）
-- phone_normalized は UNIQUE にしない（重複ポリシーは Slice 2 のCSV取込で実データを見て決定）

CREATE TABLE IF NOT EXISTS phonebook_entries (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  name_kana   TEXT,
  group_name  TEXT,
  memo        TEXT,
  partner_id  INTEGER REFERENCES partners(partner_no) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS phonebook_numbers (
  id               BIGSERIAL PRIMARY KEY,
  entry_id         BIGINT NOT NULL REFERENCES phonebook_entries(id) ON DELETE CASCADE,
  phone_raw        TEXT NOT NULL,
  phone_normalized TEXT,
  label            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_phonebook_numbers_normalized ON phonebook_numbers (phone_normalized);
CREATE INDEX IF NOT EXISTS idx_phonebook_numbers_entry      ON phonebook_numbers (entry_id);
CREATE INDEX IF NOT EXISTS idx_phonebook_entries_partner    ON phonebook_entries (partner_id);

-- PostgREST サーバ側アクセス（既存慣行: service_role のみ・anon なし・RLS なし）
GRANT ALL ON phonebook_entries, phonebook_numbers TO service_role;
GRANT USAGE, SELECT ON SEQUENCE phonebook_entries_id_seq, phonebook_numbers_id_seq TO service_role;

-- Slice 2（2026-07-14）: 電話帳と着信拒否を1リスト＋フラグに統合（additive）
ALTER TABLE phonebook_entries ADD COLUMN IF NOT EXISTS blocked BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_phonebook_entries_blocked ON phonebook_entries (blocked);
