-- IVR ルート別集計（回線別）
CREATE OR REPLACE VIEW v_naisen_ivr AS
SELECT
  ivr_route,
  line_name,
  COUNT(*)                                           AS call_count,
  COUNT(*) FILTER (WHERE status = 'ANSWERED')        AS answered,
  COUNT(*) FILTER (WHERE status = 'NO ANSWER')       AS no_answer,
  ROUND(
    COUNT(*) FILTER (WHERE status = 'ANSWERED')::numeric
    / NULLIF(COUNT(*), 0) * 100
  )                                                  AS answer_rate
FROM naisen_calls
WHERE ivr_route IS NOT NULL AND ivr_route <> ''
GROUP BY ivr_route, line_name
ORDER BY call_count DESC;

-- IVR ルート別・時間帯別
CREATE OR REPLACE VIEW v_naisen_ivr_hourly AS
SELECT
  EXTRACT(HOUR FROM started_at AT TIME ZONE 'Asia/Tokyo')::int AS hour,
  ivr_route,
  COUNT(*) AS call_count
FROM naisen_calls
WHERE ivr_route IS NOT NULL AND ivr_route <> ''
GROUP BY 1, 2
ORDER BY 1, 3 DESC;
