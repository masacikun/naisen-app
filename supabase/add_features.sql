-- 発信元メモテーブル
CREATE TABLE IF NOT EXISTS caller_memo (
  caller     TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  note       TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 着信頻度ランキングビュー
CREATE OR REPLACE VIEW v_top_callers AS
SELECT
  caller,
  COUNT(*)                                     AS call_count,
  COUNT(*) FILTER (WHERE status = 'ANSWERED')  AS answered,
  COUNT(*) FILTER (WHERE status = 'NO ANSWER') AS no_answer,
  MAX(started_at)                              AS last_called_at
FROM naisen_calls
WHERE caller IS NOT NULL AND caller <> ''
GROUP BY caller
ORDER BY call_count DESC
LIMIT 200;

-- 回線別平均通話時間ビュー
CREATE OR REPLACE VIEW v_avg_duration AS
SELECT
  line_name,
  COUNT(*) FILTER (WHERE status = 'ANSWERED')                   AS answered_count,
  ROUND(AVG(duration_sec) FILTER (WHERE status = 'ANSWERED'))   AS avg_sec,
  MAX(duration_sec)                                              AS max_sec
FROM naisen_calls
WHERE line_name IS NOT NULL
GROUP BY line_name
ORDER BY avg_sec DESC NULLS LAST;
