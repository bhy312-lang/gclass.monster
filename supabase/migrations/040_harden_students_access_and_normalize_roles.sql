-- ============================================================================
-- 040_harden_students_access_and_normalize_roles.sql
-- ============================================================================
-- 목적:
-- 1) students 익명 조회 정책 제거
-- 2) 역할 문자열 대소문자 혼재를 데이터 정규화로 완화
-- 3) 관리자 세션 기반 접근 유지
-- ============================================================================

-- 1) 익명/공개 조회 정책 제거
DROP POLICY IF EXISTS "Anonymous users can view students" ON students;
DROP POLICY IF EXISTS "Anyone can search students by phone" ON students;

-- 2) 역할 문자열 정규화 (함수 role='admin' 비교와 호환)
--    기존 데이터에 Admin/Parent 등 대소문자 혼재가 있으면 소문자로 통일
UPDATE profiles
SET role = 'admin'
WHERE role IS NOT NULL
  AND LOWER(role) = 'admin'
  AND role <> 'admin';

UPDATE profiles
SET role = 'parent'
WHERE role IS NOT NULL
  AND LOWER(role) = 'parent'
  AND role <> 'parent';

-- 3) 관리자 학원 학생 조회 정책이 없다면 보강
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'students'
          AND policyname = 'Admins can view their academy students'
    ) THEN
        CREATE POLICY "Admins can view their academy students"
          ON students FOR SELECT
          USING (
            academy_id = auth.uid()
            AND EXISTS (
              SELECT 1 FROM profiles p
              WHERE p.id = auth.uid()
                AND p.role = 'admin'
            )
          );
    END IF;
END $$;

-- 4) 키오스크 조회 성능 인덱스 재확인 (idempotent)
CREATE INDEX IF NOT EXISTS idx_students_kiosk_lookup
    ON students(parent_phone_last4, approval_status, academy_id)
    WHERE parent_phone_last4 IS NOT NULL;

-- 참고: attendance 중복 방지 인덱스는 035에서 이미 관리됨
-- idx_attendance_no_duplicate_checkin
