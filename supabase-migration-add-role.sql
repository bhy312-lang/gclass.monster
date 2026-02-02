-- ================================================
-- Supabase Migration: Add Role Column to Profiles Table
-- ================================================
-- 이 파일은 Supabase Dashboard > SQL Editor에서 실행하세요
-- profiles 테이블에 권한(role) 컬럼을 추가합니다
-- ================================================

-- 1. role 컬럼 추가 (기존 테이블이 있는 경우)
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS role TEXT;

-- 2. role 컬럼에 제약조건 추가 (Admin, User, null만 허용)
ALTER TABLE public.profiles
ADD CONSTRAINT check_role
CHECK (role IN ('Admin', 'User') OR role IS NULL);

-- 3. 기존 사용자들의 role을 기본값 'User'로 설정 (선택사항)
UPDATE public.profiles
SET role = 'User'
WHERE role IS NULL;

-- 4. 인덱스 생성 (role으로 빠르게 검색하기 위해)
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

-- ================================================
-- RLS 정책 업데이트 (관리자 권한 추가)
-- ================================================

-- Admin 권한: 모든 프로필 조회 가능
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
CREATE POLICY "Admins can view all profiles" ON profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'Admin'
    )
  );

-- Admin 권한: 모든 프로필 수정 가능
DROP POLICY IF EXISTS "Admins can update any profile" ON profiles;
CREATE POLICY "Admins can update any profile" ON profiles
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'Admin'
    )
  );

-- Admin 권한: 모든 사용자의 role 변경 가능
DROP POLICY IF EXISTS "Admins can change user roles" ON profiles;
CREATE POLICY "Admins can change user roles" ON profiles
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'Admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'Admin'
    )
  );

-- ================================================
-- 트리거 함수 업데이트 (새 사용자 role 기본값 설정)
-- ================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role)
  VALUES (
    new.id,
    new.email,
    COALESCE(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      ''
    ),
    'User'  -- 기본 권한은 'User'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================================
-- 편의 함수: 사용자 role 확인
-- ================================================

-- 현재 사용자의 role을 반환하는 함수
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS TEXT AS $$
BEGIN
  RETURN (
    SELECT role FROM public.profiles
    WHERE id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 특정 사용자가 Admin인지 확인하는 함수
CREATE OR REPLACE FUNCTION public.is_admin(user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = user_id AND role = 'Admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================================
-- 완료 메시지
-- ================================================

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Migration 완료!';
  RAISE NOTICE 'profiles 테이블에 role 컬럼이 추가되었습니다.';
  RAISE NOTICE 'role 값: Admin, User, null';
  RAISE NOTICE '========================================';
END $$;
