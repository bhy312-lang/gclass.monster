-- Disable RLS and fix permissions for public kiosk access
-- 실행일: 2026-02-03

-- RLS 비활성화 (키오스크 공개 접근을 위해)
ALTER TABLE students DISABLE ROW LEVEL SECURITY;
ALTER TABLE attendance DISABLE ROW LEVEL SECURITY;
ALTER TABLE seats DISABLE ROW LEVEL SECURITY;
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;

-- 필요한 컬럼 확인 및 추가
ALTER TABLE students
    ADD COLUMN IF NOT EXISTS grade INTEGER,
    ADD COLUMN IF NOT EXISTS parent_phone_last4 TEXT;

ALTER TABLE attendance
    ADD COLUMN IF NOT EXISTS check_in TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS check_out TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS date DATE DEFAULT CURRENT_DATE,
    ADD COLUMN IF NOT EXISTS seat_number INTEGER,
    ADD COLUMN IF NOT EXISTS seat_id TEXT;

-- 인덱스 추가 (검색 성능 향상)
CREATE INDEX IF NOT EXISTS idx_students_parent_phone_last4 ON students(parent_phone_last4);
CREATE INDEX IF NOT EXISTS idx_attendance_student_id ON attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_status ON attendance(status);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);

-- 익명 롤(USER: anonymous)에 권한 부여
GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT INSERT ON ALL TABLES IN SCHEMA public TO anon;
GRANT UPDATE ON ALL TABLES IN SCHEMA public TO anon;
GRANT DELETE ON ALL TABLES IN SCHEMA public TO anon;

-- 기존 테이블 및 미래 테이블에 권한 적용
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon;
