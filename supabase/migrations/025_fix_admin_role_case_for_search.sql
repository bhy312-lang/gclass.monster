-- =====================================================
-- Fix admin role case mismatch for academy search and admin-scoped access
-- =====================================================

-- 1) Normalize legacy values (if any)
UPDATE profiles
SET role = 'admin'
WHERE role = 'Admin';

-- 2) Recreate searchable academy policy with case-compatible role check
DROP POLICY IF EXISTS "Approved academies are searchable" ON profiles;
CREATE POLICY "Approved academies are searchable"
  ON profiles FOR SELECT
  USING (
    role IN ('admin', 'Admin')
    AND approval_status = 'approved'
    AND academy_name IS NOT NULL
  );

-- 3) Recreate admin student policies with case-compatible role check
DROP POLICY IF EXISTS "Admins can view their academy students" ON students;
CREATE POLICY "Admins can view their academy students"
  ON students FOR SELECT
  USING (
    academy_id IN (
      SELECT id FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'Admin')
    )
  );

DROP POLICY IF EXISTS "Admins can update their academy students" ON students;
CREATE POLICY "Admins can update their academy students"
  ON students FOR UPDATE
  USING (
    academy_id IN (
      SELECT id FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'Admin')
    )
  );

-- 4) Recreate helper functions with case-compatible role check
CREATE OR REPLACE FUNCTION submit_admin_registration(
  p_academy_name TEXT,
  p_business_number TEXT,
  p_full_name TEXT,
  p_full_phone TEXT,
  p_business_license_url TEXT
) RETURNS JSONB AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  UPDATE profiles
  SET
    academy_name = p_academy_name,
    business_number = p_business_number,
    name = p_full_name,
    full_phone = p_full_phone,
    business_license_url = p_business_license_url,
    role = 'admin',
    approval_status = 'pending'
  WHERE id = v_user_id;

  INSERT INTO admin_registration_notifications (admin_id)
  VALUES (v_user_id);

  RETURN jsonb_build_object(
    'success', true,
    'message', '가입 신청이 완료되었습니다. 승인 대기 중입니다.'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION search_academies(p_search_term TEXT DEFAULT '')
RETURNS TABLE (
  id UUID,
  academy_name TEXT,
  business_number TEXT,
  full_phone TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.academy_name,
    p.business_number,
    p.full_phone
  FROM profiles p
  WHERE
    p.role IN ('admin', 'Admin')
    AND p.approval_status = 'approved'
    AND p.academy_name IS NOT NULL
    AND (p_search_term = '' OR p.academy_name ILIKE '%' || p_search_term || '%')
  ORDER BY p.academy_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_pending_admins()
RETURNS TABLE (
  id UUID,
  email TEXT,
  name TEXT,
  academy_name TEXT,
  business_number TEXT,
  full_phone TEXT,
  business_license_url TEXT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.email,
    p.name,
    p.academy_name,
    p.business_number,
    p.full_phone,
    p.business_license_url,
    p.created_at
  FROM profiles p
  WHERE
    p.role IN ('admin', 'Admin')
    AND p.approval_status = 'pending'
  ORDER BY p.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5) Notification log admin policy also case-compatible
DROP POLICY IF EXISTS "Admins can view all notification logs" ON notification_logs;
CREATE POLICY "Admins can view all notification logs"
  ON notification_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'Admin')
    )
  );
