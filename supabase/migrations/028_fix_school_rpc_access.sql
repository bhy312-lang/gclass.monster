-- =====================================================
-- 028: RPC 함수 검증 완화 + 권한 재부여
-- =====================================================
-- 작업일: 2026-02-25
-- 문제: super_admin도 approval_status = 'approved' 요구해서 RPC 실패
-- 해결: super_admin은 approval_status 예외 처리
--
-- 변경사항:
--   1. get_school_options_for_profile: super_admin 예외 추가
--   2. search_academies: super_admin 예외 추가
--   3. 두 함수 모두 권한 재부여 (GRANT EXECUTE)
--   4. search_path 고정 (보안 강화)
-- =====================================================

-- -----------------------------------------------------
-- 1. get_school_options_for_profile 재정의
-- -----------------------------------------------------
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
  -- super_admin은 approval_status 상관없이 통과
  SELECT EXISTS (
    SELECT 1
    FROM profiles
    WHERE id = p_profile_id
      AND (
        (role IN ('admin', 'Admin') AND approval_status = 'approved')
        OR is_super_admin = true
      )
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

-- -----------------------------------------------------
-- 2. search_academies 재정의 (동일 정책)
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION search_academies(p_search_term TEXT DEFAULT '')
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

-- -----------------------------------------------------
-- 3. 권한 부여
-- -----------------------------------------------------
GRANT EXECUTE ON FUNCTION public.get_school_options_for_profile(UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_academies(TEXT) TO anon, authenticated;

-- -----------------------------------------------------
-- 4. search_path 고정 (보안 강화)
-- -----------------------------------------------------
ALTER FUNCTION public.get_school_options_for_profile(UUID, UUID) SET search_path = public;
ALTER FUNCTION public.search_academies(TEXT) SET search_path = public;
