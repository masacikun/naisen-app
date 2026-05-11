-- 通話時間分布
CREATE OR REPLACE VIEW v_duration_dist AS
SELECT
  CASE
    WHEN duration_sec <= 30  THEN '〜30秒'
    WHEN duration_sec <= 120 THEN '30秒〜2分'
    WHEN duration_sec <= 300 THEN '2分〜5分'
    ELSE '5分以上'
  END AS bucket,
  CASE
    WHEN duration_sec <= 30  THEN 1
    WHEN duration_sec <= 120 THEN 2
    WHEN duration_sec <= 300 THEN 3
    ELSE 4
  END AS sort_order,
  COUNT(*) AS call_count
FROM naisen_calls
WHERE status = 'ANSWERED'
  AND duration_sec IS NOT NULL
  AND duration_sec > 0
GROUP BY 1, 2
ORDER BY 2;

-- リピーター分析
CREATE OR REPLACE VIEW v_repeat_analysis AS
SELECT
  CASE WHEN cnt = 1 THEN '初回' ELSE 'リピーター' END AS caller_type,
  COUNT(*)   AS caller_count,
  SUM(cnt)   AS call_count
FROM (
  SELECT caller, COUNT(*) AS cnt
  FROM naisen_calls
  WHERE caller IS NOT NULL AND caller <> ''
  GROUP BY caller
) sub
GROUP BY 1;
