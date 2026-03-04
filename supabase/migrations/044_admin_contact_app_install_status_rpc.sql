-- ============================================================================
-- 044_admin_contact_app_install_status_rpc.sql
-- ============================================================================
-- Purpose: 관리자 화면에서 연락처별 앱 설치 여부 표시용 RPC
-- ============================================================================

CREATE OR REPLACE FUNCTION admin_get_contact_app_install_status(
  p_phone_digits_list TEXT[] DEFAULT '{}'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM profiles
    WHERE id = auth.uid()
      AND LOWER(COALESCE(role, '')) IN ('admin', 'super_admin')
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', '관리자 권한이 필요합니다',
      'error_code', 'INSUFFICIENT_PERMISSIONS'
    );
  END IF;

  SELECT COALESCE(
    jsonb_object_agg(phone_digits, app_installed),
    '{}'::jsonb
  ) INTO v_result
  FROM (
    SELECT
      regexp_replace(COALESCE(p.phone, ''), '\D', '', 'g') AS phone_digits,
      (
        COALESCE(p.push_notification_enabled, false) = true
        AND p.fcm_token IS NOT NULL
        AND btrim(p.fcm_token) <> ''
      ) AS app_installed
    FROM profiles p
    WHERE LOWER(COALESCE(p.role, '')) = 'parent'
      AND regexp_replace(COALESCE(p.phone, ''), '\D', '', 'g') = ANY (COALESCE(p_phone_digits_list, '{}'::TEXT[]))
  ) t;

  RETURN jsonb_build_object(
    'success', true,
    'data', v_result
  );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_get_contact_app_install_status TO authenticated;

NOTIFY pgrst, 'reload schema';

