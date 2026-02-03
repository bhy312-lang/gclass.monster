-- Fix infinite recursion in profiles RLS policy
-- 실행일: 2026-02-03

-- 모든 관련 정책 삭제
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update any profile" ON profiles;
DROP POLICY IF EXISTS "Parents can view own profile" ON profiles;
DROP POLICY IF EXISTS "Parents can update own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can change user roles" ON profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update any profile" ON profiles;

-- is_admin 함수 CASCADE 삭제
DROP FUNCTION IF EXISTS is_admin(UUID) CASCADE;

-- 간단한 RLS 정책: 인증된 사용자는 자신의 프로필 조회/수정 가능
CREATE POLICY "Users can view own profile"
  ON profiles
  FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
