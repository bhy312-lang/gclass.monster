-- =====================================================
-- 학교 테이블 RLS 정책 수정 (인증 없이도 작동하도록)
-- =====================================================

-- 기존 정책 삭제
DROP POLICY IF EXISTS "Owners can view own schools" ON schools;
DROP POLICY IF EXISTS "Owners can insert schools" ON schools;
DROP POLICY IF EXISTS "Owners can update schools" ON schools;
DROP POLICY IF EXISTS "Owners can delete schools" ON schools;
DROP POLICY IF EXISTS "Anyone can view schools for registration" ON schools;

-- 새 정책: 인증 여부와 상관없이 모든 작업 허용
CREATE POLICY "Allow all operations on schools"
  ON schools FOR ALL USING (true) WITH CHECK (true);
