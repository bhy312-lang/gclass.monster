-- =====================================================
-- 029: RPC 함수 모호성 제거 + Fallback 지원
-- =====================================================
-- 작업일: 2026-02-25
-- 문제: 42702(ambiguous_column) 오류로 학교 목록 로드 실패
-- 해결:
--   1. search_academies 오버로드 제거 (CASCADE 없이 안전 처리)
--   2. 두 함수 모두 subquery wrapper로 컬럼 참조 명확화
--   3. 빈 문자열 필터 추가
--   4. schools SELECT 정책 재보장
--   5. 권한 재부여
-- =====================================================

-- -----------------------------------------------------
-- 1. search_academies 오버로드 제거 (CASCADE 없이)
-- -----------------------------------------------------
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS fn_sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'search_academies'
      AND n.nspname = 'public'
  LOOP
    BEGIN
      EXECUTE format('DROP FUNCTION IF EXISTS %s', r.fn_sig);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Failed to drop %: %', r.fn_sig, SQLERRM;
    END;
  END LOOP;
END $$;

-- -----------------------------------------------------
-- 2. search_academies 재생성
-- -----------------------------------------------------
CREATE FUNCTION public.search_academies(p_search_term TEXT DEFAULT '')
RETURNS TABLE (
  id UUID,
  academy_name TEXT,
  business_number TEXT,
  full_phone TEXT,
  academy_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT q.id, q.academy_name, q.business_number, q.full_phone, q.academy_id
  FROM (
    SELECT
      p.id,
      p.academy_name,
      p.business_number,
      p.full_phone,
      p.academy_id
    FROM public.profiles p
    WHERE p.academy_name IS NOT NULL
      AND p.academy_name <> ''
      AND (
        (p.role IN ('admin','Admin') AND p.approval_status = 'approved')
        OR p.is_super_admin = true
      )
      AND (
        p_search_term = ''
        OR p.academy_name ILIKE '%' || p_search_term || '%'
        OR p.full_phone ILIKE '%' || p_search_term || '%'
      )
  ) q
  ORDER BY q.academy_name;
END;
$$;

-- -----------------------------------------------------
-- 3. get_school_options_for_profile 재생성
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_school_options_for_profile(
  p_profile_id UUID,
  p_academy_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_valid_profile BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = p_profile_id
      AND (
        (p.role IN ('admin','Admin') AND p.approval_status = 'approved')
        OR p.is_super_admin = true
      )
  ) INTO v_is_valid_profile;

  IF NOT v_is_valid_profile THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT q.id, q.name
  FROM (
    SELECT DISTINCT s.id, s.name
    FROM public.schools s
    WHERE s.name IS NOT NULL
      AND s.name <> ''
      AND (
        s.profile_id = p_profile_id
        OR (p_academy_id IS NOT NULL AND s.academy_id = p_academy_id)
      )
  ) q
  ORDER BY q.name;
END;
$$;

-- -----------------------------------------------------
-- 4. 권한 부여
-- -----------------------------------------------------
GRANT EXECUTE ON FUNCTION public.search_academies(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_school_options_for_profile(UUID, UUID) TO anon, authenticated;

-- -----------------------------------------------------
-- 5. schools SELECT 정책 재보장
-- -----------------------------------------------------
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
    RAISE NOTICE 'Created policy: Anyone can view schools for registration';
  ELSE
    RAISE NOTICE 'Policy already exists: Anyone can view schools for registration';
  END IF;
END $$;
