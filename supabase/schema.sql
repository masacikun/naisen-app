CREATE TABLE IF NOT EXISTS naisen_calls (
  id               BIGSERIAL PRIMARY KEY,
  started_at       TIMESTAMPTZ NOT NULL,
  ended_at         TIMESTAMPTZ,
  duration_sec     INTEGER DEFAULT 0,
  caller           TEXT,
  caller_name      TEXT,
  destination      TEXT,
  destination_name TEXT,
  line_number      TEXT,
  line_name        TEXT,
  ivr_route        TEXT,
  answered_ext     TEXT,
  outbound_line    TEXT,
  transferred      TEXT,
  park_number      TEXT,
  status           TEXT,
  memo             TEXT,
  comm_id          TEXT,
  call_id          TEXT UNIQUE,
  callback_id      TEXT,
  source_file      TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_naisen_calls_started_at ON naisen_calls (started_at);
CREATE INDEX IF NOT EXISTS idx_naisen_calls_line_name  ON naisen_calls (line_name);
CREATE INDEX IF NOT EXISTS idx_naisen_calls_status     ON naisen_calls (status);
CREATE INDEX IF NOT EXISTS idx_naisen_calls_caller     ON naisen_calls (caller);

CREATE OR REPLACE VIEW v_naisen_monthly AS
SELECT
  DATE_TRUNC('month', started_at AT TIME ZONE 'Asia/Tokyo') AS month,
  line_name,
  status,
  COUNT(*)           AS call_count,
  SUM(duration_sec)  AS total_sec,
  AVG(duration_sec)  AS avg_sec
FROM naisen_calls
WHERE line_name IS NOT NULL
GROUP BY 1, 2, 3
ORDER BY 1 DESC, 2, 3;

CREATE OR REPLACE VIEW v_naisen_daily AS
SELECT
  DATE(started_at AT TIME ZONE 'Asia/Tokyo')  AS call_date,
  line_name,
  COUNT(*)                                     AS call_count,
  COUNT(*) FILTER (WHERE status = 'ANSWERED')  AS answered,
  COUNT(*) FILTER (WHERE status = 'NO ANSWER') AS no_answer,
  COUNT(*) FILTER (WHERE status = 'BUSY')      AS busy
FROM naisen_calls
WHERE line_name IS NOT NULL
GROUP BY 1, 2
ORDER BY 1 DESC, 2;

CREATE OR REPLACE VIEW v_naisen_hourly AS
SELECT
  EXTRACT(HOUR FROM started_at AT TIME ZONE 'Asia/Tokyo')::INTEGER AS hour,
  line_name,
  COUNT(*)                                    AS call_count,
  COUNT(*) FILTER (WHERE status = 'ANSWERED') AS answered
FROM naisen_calls
WHERE line_name IS NOT NULL
GROUP BY 1, 2
ORDER BY 1, 2;
