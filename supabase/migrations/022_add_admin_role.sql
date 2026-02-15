-- =====================================================
-- 관리자(admin) 역할 추가
-- =====================================================

-- 기존 제약 조건 삭제
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- admin 포함하여 새 제약 조건 추가
ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('owner', 'parent', 'admin')) DEFAULT NULL;
