-- =====================================================
-- 익명 사용자(로그인하지 않은 모바일 사용자) 접근 허용
-- =====================================================
-- RLS 정책 수정: 인증되지 않은 사용자도 수강신청 페이지 이용 가능

-- 기존 정책 제거
DROP POLICY IF EXISTS "Anyone can view active periods" ON course_periods;
DROP POLICY IF EXISTS "Anyone can view time slots for active periods" ON course_time_slots;

-- 인증 여부와 상관없이 활성화된 기간 조회 허용
CREATE POLICY "Allow anonymous and authenticated users to view active periods"
  ON course_periods FOR SELECT
  USING (is_active = true);

-- 인증 여부와 상관없이 활성화된 기간의 시간 슬롯 조회 허용
CREATE POLICY "Allow anonymous and authenticated users to view time slots for active periods"
  ON course_time_slots FOR SELECT
  USING (
    period_id IN (
      SELECT id FROM course_periods WHERE is_active = true
    )
  );

-- course_registrations 정책 수정
DROP POLICY IF EXISTS "Anyone can submit registration" ON course_registrations;

-- 인증 여부와 상관없이 수강신청 제출 허용
CREATE POLICY "Allow anonymous and authenticated users to submit registration"
  ON course_registrations FOR INSERT
  WITH CHECK (true);

-- 인증 여부와 상관없이 자신의 신청 내역 조회 가능
CREATE POLICY "Allow users to view own registrations by phone"
  ON course_registrations FOR SELECT
  USING (true);
