-- Fix infinite recursion in profiles RLS policy
-- 실행일: 2026-02-03

-- 모든 관련 정책 삭제
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update any profile" ON profiles;
DROP POLICY IF EXISTS "Parents can view own profile" ON profiles;
DROP POLICY IF EXISTS "Parents can update own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can change user roles" ON profiles;

-- is_admin 함수 CASCADE 삭제
DROP FUNCTION IF EXISTS is_admin(UUID) CASCADE;

-- auth.users의 raw_user_meta_data 컬럼을 직접 확인하는 함수
CREATE FUNCTION is_admin(user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM auth.users
    WHERE id = user_id
    AND raw_user_meta_data->>'role' = 'Admin'
  );
END;
$$;

-- 간단한 RLS 정책: 모든 인증된 사용자는 자신의 프로필 조회/수정 가능
CREATE POLICY "Users can view own profile"
  ON profiles
  FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Admin 정책
CREATE POLICY "Admins can view all profiles"
  ON profiles
  FOR SELECT
  USING (is_admin(auth.uid()));

CREATE POLICY "Admins can update any profile"
  ON profiles
  FOR UPDATE
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));
