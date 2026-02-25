-- =====================================================
-- schools 테이블에 profile_id 추가 (하위 호환성 유지)
-- =====================================================
-- 작업일: 2026-02-25
-- 설명:
--   1. schools 테이블에 profile_id 컬럼 추가
--   2. 기존 academy_id 컬럼 유지 (하위 호환성)
--   3. 데이터 백필 (결정적 수행)
--   4. RPC 함수 추가/수정
--   5. RLS 정책 업데이트
-- =====================================================

-- =====================================================
-- 1. 테이블 스키마 변경
-- =====================================================

-- profile_id 컬럼 추가 (NULL 허용 - 기존 데이터 호환)
ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE;

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_schools_profile_id ON schools(profile_id);
CREATE INDEX IF NOT EXISTS idx_schools_profile_name ON schools(profile_id, name);

-- 유니크 제약조건 추가 (profile_id, name)
-- 기존 유니크(academy_id, name)은 유지
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'schools_profile_id_name_key'
  ) THEN
    ALTER TABLE schools DROP CONSTRAINT schools_profile_id_name_key;
  END IF;

  ALTER TABLE schools
    ADD CONSTRAINT schools_profile_id_name_key UNIQUE (profile_id, name);
END $$;

-- =====================================================
-- 2. 데이터 백필: 결정적으로 수행
-- =====================================================
-- 여러 profile이 매칭될 경우 우선순위 적용:
--   1. is_super_admin 내림차순
--   2. role이 'admin' 또는 'Admin'인 것 우선
--   3. created_at 오름차순 (먼저 생성된 것)
WITH ranked_profiles AS (
  SELECT
    s.id AS school_id,
    p.id AS profile_id,
    ROW_NUMBER() OVER (
      PARTITION BY s.id
      ORDER BY
        p.is_super_admin DESC,
        CASE WHEN p.role IN ('admin', 'Admin') THEN 1 ELSE 0 END DESC,
        p.created_at ASC
    ) AS rn
  FROM schools s
  JOIN profiles p ON s.academy_id = p.academy_id
  WHERE s.profile_id IS NULL
)
UPDATE schools
SET profile_id = rp.profile_id
FROM ranked_profiles rp
WHERE schools.id = rp.school_id
  AND rp.rn = 1;

-- =====================================================
-- 3. RPC 함수: get_school_options_for_profile (신규)
-- =====================================================
CREATE OR REPLACE FUNCTION get_school_options_for_profile(
  p_profile_id UUID,
  p_academy_id UUID DEFAULT NULL
) RETURNS TABLE (
  id UUID,
  name TEXT
) AS $$
DECLARE
  v_is_valid_profile BOOLEAN;
BEGIN
  -- p_profile_id가 유효한 학원 프로필인지 검증
  SELECT EXISTS (
    SELECT 1
    FROM profiles
    WHERE id = p_profile_id
      AND (role IN ('admin', 'Admin') OR is_super_admin = true)
      AND approval_status = 'approved'
  ) INTO v_is_valid_profile;

  IF NOT v_is_valid_profile THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT DISTINCT s.id, s.name
  FROM schools s
  WHERE
    s.profile_id = p_profile_id
    OR (
      p_academy_id IS NOT NULL
      AND s.academy_id = p_academy_id
    )
  ORDER BY s.name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 4. RPC 함수: search_academies 확장 (academy_id 추가)
-- =====================================================

-- 기존 search_academies 변형들 전부 제거 (TEXT/VARCHAR 등 시그니처 차이 대응)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS fn_sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'search_academies'
      AND n.nspname = 'public'
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', r.fn_sig);
  END LOOP;
END $$;

CREATE FUNCTION public.search_academies(p_search_term TEXT DEFAULT '')
RETURNS TABLE (
  id UUID,
  academy_name TEXT,
  business_number TEXT,
  full_phone TEXT,
  academy_id UUID
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.academy_name,
    p.business_number,
    p.full_phone,
    p.academy_id
  FROM profiles p
  WHERE
    p.academy_name IS NOT NULL
    AND (
      (p.role IN ('admin', 'Admin') AND p.approval_status = 'approved')
      OR p.is_super_admin = true
    )
    AND (
      p_search_term = ''
      OR p.academy_name ILIKE '%' || p_search_term || '%'
      OR p.full_phone ILIKE '%' || p_search_term || '%'
    )
  ORDER BY p.academy_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 5. RLS 정책 업데이트 (하위 호환성 유지)
-- =====================================================

-- 기존/신규 정책 모두 제거 (재실행 안전)
DO $$
BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Anyone can view schools for registration" ON public.schools';
  EXECUTE 'DROP POLICY IF EXISTS "Owners can view own schools" ON public.schools';
  EXECUTE 'DROP POLICY IF EXISTS "Owners can insert schools" ON public.schools';
  EXECUTE 'DROP POLICY IF EXISTS "Owners can update schools" ON public.schools';
  EXECUTE 'DROP POLICY IF EXISTS "Owners can delete schools" ON public.schools';
  EXECUTE 'DROP POLICY IF EXISTS "Users can insert schools" ON public.schools';
  EXECUTE 'DROP POLICY IF EXISTS "Users can update own schools" ON public.schools';
  EXECUTE 'DROP POLICY IF EXISTS "Users can delete own schools" ON public.schools';
END $$;

-- SELECT: 인증되지 않은 사용자도 조회 가능 (가입 화면용)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'schools'
      AND policyname = 'Anyone can view schools for registration'
  ) THEN
    CREATE POLICY "Anyone can view schools for registration"
      ON public.schools FOR SELECT USING (true);
  END IF;
END $$;

-- INSERT: 본인 프로필 OR 레거시 academy 소유자
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'schools'
      AND policyname = 'Users can insert schools'
  ) THEN
    CREATE POLICY "Users can insert schools"
      ON public.schools FOR INSERT
      WITH CHECK (
        profile_id = auth.uid()
        OR academy_id IN (SELECT id FROM academies WHERE owner_id = auth.uid())
      );
  END IF;
END $$;

-- UPDATE: 본인 프로필 OR 레거시 academy 소유자
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'schools'
      AND policyname = 'Users can update own schools'
  ) THEN
    CREATE POLICY "Users can update own schools"
      ON public.schools FOR UPDATE
      USING (
        profile_id = auth.uid()
        OR academy_id IN (SELECT id FROM academies WHERE owner_id = auth.uid())
      )
      WITH CHECK (
        profile_id = auth.uid()
        OR academy_id IN (SELECT id FROM academies WHERE owner_id = auth.uid())
      );
  END IF;
END $$;

-- DELETE: 본인 프로필 OR 레거시 academy 소유자
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'schools'
      AND policyname = 'Users can delete own schools'
  ) THEN
    CREATE POLICY "Users can delete own schools"
      ON public.schools FOR DELETE
      USING (
        profile_id = auth.uid()
        OR academy_id IN (SELECT id FROM academies WHERE owner_id = auth.uid())
      );
  END IF;
END $$;

-- =====================================================
-- 6. 함수 권한 부여 (재실행 안전)
-- =====================================================

GRANT EXECUTE ON FUNCTION public.search_academies(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_school_options_for_profile(UUID, UUID) TO anon, authenticated;
