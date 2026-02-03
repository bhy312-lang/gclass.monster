-- Add public read policy for students table (kiosk access)
-- 실행일: 2026-02-03

-- 키오스크에서 학생 조회를 허용하는 공개 정책
CREATE POLICY "Anonymous users can view students"
  ON students
  FOR SELECT
  TO anon
  USING (true);
