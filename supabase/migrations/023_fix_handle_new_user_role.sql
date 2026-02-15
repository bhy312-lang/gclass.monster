-- =====================================================
-- OAuth 로그인 시 사용자 생성 실패 수정
-- 문제: handle_new_user() 함수가 role = 'User'로 설정하지만
--      CHECK 제약 조건은 'owner', 'parent', 'admin'만 허용
-- 해결: role을 NULL로 설정 (미가입 상태)
-- =====================================================

-- 1. 제약 조건 수정 (NULL 명시적으로 허용)
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('owner', 'parent', 'admin') OR role IS NULL);

-- 2. 기존 함수 수정 (role 없이 삽입, NULL로 기본 설정)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', '')
  );
  RETURN new;
EXCEPTION
  WHEN unique_violation THEN
    -- 이미 프로필이 존재하면 무시
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. 기존 트리거 삭제 후 재생성
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
