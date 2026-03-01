-- 중복 등원 방지를 위한 Partial Unique Index
-- 같은 학생이 같은 날짜에 waiting/seated 상태로 중복 등원 방지
CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_no_duplicate_checkin
    ON attendance(student_id, date)
    WHERE status IN ('waiting', 'seated') AND type = 'check_in';

-- 참고: 하원은 중복이 가능해야 하므로 인덱스 추가 안 함
-- (등원-하원-등원 가능)
