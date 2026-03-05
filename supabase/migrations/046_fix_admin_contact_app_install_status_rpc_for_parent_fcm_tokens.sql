-- ============================================================================
-- 046_fix_admin_contact_app_install_status_rpc_for_parent_fcm_tokens.sql
-- ============================================================================
-- Purpose:
--   1) Align app-installed status logic with parent_fcm_tokens (current FCM source)
--   2) Normalize phone matching with COALESCE(full_phone, phone)
--   3) Support 82-prefixed numbers by normalizing to local 0-prefixed digits
--   4) Aggregate duplicate parent profiles by phone with bool_or()
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
      'error', 'Admin permission required',
      'error_code', 'INSUFFICIENT_PERMISSIONS'
    );
  END IF;

  WITH input_phones AS (
    SELECT DISTINCT
      CASE
        WHEN d = '' THEN NULL
        WHEN d LIKE '82%' THEN
          CASE
            WHEN substring(d FROM 3 FOR 1) = '0' THEN substring(d FROM 3)
            ELSE '0' || substring(d FROM 3)
          END
        ELSE d
      END AS phone_digits
    FROM (
      SELECT regexp_replace(COALESCE(v, ''), '\D', '', 'g') AS d
      FROM unnest(COALESCE(p_phone_digits_list, '{}'::TEXT[])) AS t(v)
    ) s
  ),
  parent_install AS (
    SELECT
      CASE
        WHEN norm_digits LIKE '82%' THEN
          CASE
            WHEN substring(norm_digits FROM 3 FOR 1) = '0' THEN substring(norm_digits FROM 3)
            ELSE '0' || substring(norm_digits FROM 3)
          END
        ELSE norm_digits
      END AS phone_digits,
      (
        COALESCE(p.push_notification_enabled, false) = true
        AND EXISTS (
          SELECT 1
          FROM parent_fcm_tokens pft
          WHERE pft.parent_id = p.id
            AND pft.is_active = true
            AND btrim(COALESCE(pft.fcm_token, '')) <> ''
        )
      ) AS app_installed
    FROM (
      SELECT
        id,
        role,
        push_notification_enabled,
        regexp_replace(COALESCE(full_phone, phone, ''), '\D', '', 'g') AS norm_digits
      FROM profiles
    ) p
    WHERE LOWER(COALESCE(p.role, '')) = 'parent'
      AND COALESCE(p.norm_digits, '') <> ''
  ),
  aggregated AS (
    SELECT
      pi.phone_digits,
      bool_or(pi.app_installed) AS app_installed
    FROM parent_install pi
    JOIN input_phones ip
      ON ip.phone_digits IS NOT NULL
     AND ip.phone_digits = pi.phone_digits
    GROUP BY pi.phone_digits
  )
  SELECT COALESCE(
    jsonb_object_agg(ip.phone_digits, COALESCE(a.app_installed, false)),
    '{}'::jsonb
  )
  INTO v_result
  FROM input_phones ip
  LEFT JOIN aggregated a
    ON a.phone_digits = ip.phone_digits
  WHERE ip.phone_digits IS NOT NULL;

  RETURN jsonb_build_object(
    'success', true,
    'data', COALESCE(v_result, '{}'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_get_contact_app_install_status TO authenticated;

NOTIFY pgrst, 'reload schema';
