-- Kiosk attendance hardening:
-- 1) academy scope column for attendance
-- 2) scoped index for kiosk lookups
-- 3) scoped duplicate check-in guard
-- 4) re-enable attendance RLS with academy-based policies

ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS academy_id UUID REFERENCES profiles(id);

-- Backfill academy_id from students table when missing.
UPDATE attendance a
SET academy_id = s.academy_id
FROM students s
WHERE a.student_id = s.id
  AND a.academy_id IS NULL
  AND s.academy_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_attendance_academy_student_date_status
  ON attendance(academy_id, student_id, date, status);

-- Scoped duplicate check-in guard (active rows only).
CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_no_duplicate_checkin_scoped
  ON attendance(academy_id, student_id, date)
  WHERE status IN ('waiting', 'seated') AND type = 'check_in';

ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view attendance" ON attendance;
DROP POLICY IF EXISTS "Anyone can insert attendance" ON attendance;
DROP POLICY IF EXISTS "Anyone can update attendance" ON attendance;

-- Admin users can manage attendance in their academy scope.
CREATE POLICY "Admins can manage academy attendance"
ON attendance
FOR ALL
USING (
  academy_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM profiles p
    WHERE p.id = auth.uid()
      AND lower(coalesce(p.role, '')) = 'admin'
  )
)
WITH CHECK (
  academy_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM profiles p
    WHERE p.id = auth.uid()
      AND lower(coalesce(p.role, '')) = 'admin'
  )
);

-- Parents can view their own children attendance only.
CREATE POLICY "Parents can view own children attendance"
ON attendance
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM students s
    WHERE s.id = attendance.student_id
      AND s.parent_id = auth.uid()
  )
);
