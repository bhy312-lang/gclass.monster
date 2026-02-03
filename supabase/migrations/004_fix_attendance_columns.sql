-- Fix attendance table columns for parent portal
-- 실행일: 2026-02-03

-- check_in과 check_out 컬럼 추가 (기존 check_in_time은 유지)
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS check_in TIMESTAMPTZ;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS check_out TIMESTAMPTZ;

-- date 컬럼 추가 (parent.js에서 사용)
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS date DATE DEFAULT CURRENT_DATE;

-- seat_number 컬럼 추가 (parent.js에서 좌석 번호 표시용)
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS seat_number INTEGER;
