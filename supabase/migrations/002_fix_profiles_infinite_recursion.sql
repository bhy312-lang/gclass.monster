-- Fix infinite recursion in profiles RLS policy
-- 실행일: 2026-02-03

-- 문제가 되는 정책 삭제
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update any profile" ON profiles;
DROP POLICY IF EXISTS "Parents can view own profile" ON profiles;
DROP POLICY IF EXISTS "Parents can update own profile" ON profiles;

-- is_admin 함수가 없으면 생성
CREATE OR REPLACE FUNCTION is_admin(user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
AS $$
BEGIN
  -- auth.users 테이블의 user_metadata를 확인
  -- profiles 테이블을 조회하지 않음으로써 무한 재귀 방지
  RETURN EXISTS (
    SELECT 1
    FROM auth.users a
    JOIN auth.user_metadata am ON a.id = am.user_id
    WHERE a.id = user_id
    AND am.raw_user_metadata->>'role' = 'Admin'
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

-- Admin 정책 (is_admin 함수 사용)
CREATE POLICY "Admins can view all profiles"
  ON profiles
  FOR SELECT
  USING (is_admin(auth.uid()));

CREATE POLICY "Admins can update any profile"
  ON profiles
  FOR UPDATE
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));
