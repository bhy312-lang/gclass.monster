-- Diagnostic + repair SQL for kiosk mismatch cases (example: phone last4 = 4397)
-- Run in Supabase SQL Editor when you need to inspect/fix broken same-day state.

-- 1) Target student candidates in current academy scope.
SELECT
  s.id AS student_id,
  s.name,
  s.parent_phone_last4,
  s.academy_id
FROM students s
WHERE s.parent_phone_last4 = '4397'
ORDER BY s.created_at DESC;

-- 2) Today rows (KST date) for candidate students.
WITH kst_today AS (
  SELECT (now() AT TIME ZONE 'Asia/Seoul')::date AS d
)
SELECT
  a.id,
  a.student_id,
  a.student_name,
  a.status,
  a.type,
  a.date,
  a.seat_id,
  a.check_in_time,
  a.check_out
FROM attendance a
JOIN students s ON s.id = a.student_id
JOIN kst_today t ON a.date = t.d
WHERE s.parent_phone_last4 = '4397'
ORDER BY a.check_in_time DESC NULLS LAST, a.created_at DESC;

-- 3) Repair A: seated rows whose seat is missing/non-occupied -> waiting + seat_id null.
WITH kst_today AS (
  SELECT (now() AT TIME ZONE 'Asia/Seoul')::date AS d
), target AS (
  SELECT a.id
  FROM attendance a
  JOIN students s ON s.id = a.student_id
  LEFT JOIN seats st ON st.id = a.seat_id
  JOIN kst_today t ON a.date = t.d
  WHERE s.parent_phone_last4 = '4397'
    AND a.status = 'seated'
    AND (
      a.seat_id IS NULL
      OR st.id IS NULL
      OR st.occupied IS DISTINCT FROM TRUE
      OR st.student_name IS DISTINCT FROM a.student_name
    )
)
UPDATE attendance a
SET status = 'waiting',
    seat_id = NULL
FROM target
WHERE a.id = target.id;

-- 4) Repair B: same-day completed + active coexist -> active rows completed.
WITH kst_today AS (
  SELECT (now() AT TIME ZONE 'Asia/Seoul')::date AS d
), conflicted_students AS (
  SELECT a.student_id
  FROM attendance a
  JOIN students s ON s.id = a.student_id
  JOIN kst_today t ON a.date = t.d
  WHERE s.parent_phone_last4 = '4397'
  GROUP BY a.student_id
  HAVING COUNT(*) FILTER (WHERE a.status = 'completed') > 0
     AND COUNT(*) FILTER (WHERE a.status IN ('waiting','seated')) > 0
)
UPDATE attendance a
SET status = 'completed',
    type = 'check_out',
    check_out = coalesce(a.check_out, now()),
    seat_id = NULL
WHERE a.student_id IN (SELECT student_id FROM conflicted_students)
  AND a.date = (now() AT TIME ZONE 'Asia/Seoul')::date
  AND a.status IN ('waiting','seated');

-- 5) Optional seat cleanup by student name for target phone.
UPDATE seats st
SET occupied = FALSE,
    student_id = NULL,
    student_name = NULL,
    alarm_time = NULL,
    alarming = FALSE,
    alarm_stopped = FALSE
FROM students s
WHERE s.parent_phone_last4 = '4397'
  AND st.student_name = s.name;
