-- =====================================================
-- Add super-admin to academy search and parent access
-- =====================================================

-- 1) Update search_academies function to include super-admins
DROP FUNCTION IF EXISTS search_academies(TEXT);

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
    p.academy_name IS NOT NULL
    AND (
      -- Regular approved admins
      (p.role IN ('admin', 'Admin') AND p.approval_status = 'approved')
      OR
      -- Super-admins with academy_name
      (p.is_super_admin = true)
    )
    AND (p_search_term = '' OR p.academy_name ILIKE '%' || p_search_term || '%')
  ORDER BY p.academy_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2) Update "Approved academies are searchable" policy
DROP POLICY IF EXISTS "Approved academies are searchable" ON profiles;

CREATE POLICY "Approved academies are searchable"
  ON profiles FOR SELECT
  USING (
    academy_name IS NOT NULL
    AND (
      -- Regular approved admins
      (role IN ('admin', 'Admin') AND approval_status = 'approved')
      OR
      -- Super-admins with academy_name
      (is_super_admin = true)
    )
  );

-- 3) Update admin student policies to allow super-admins to access their own students
DROP POLICY IF EXISTS "Admins can view their academy students" ON students;

CREATE POLICY "Admins can view their academy students"
  ON students FOR SELECT
  USING (
    academy_id IN (
      SELECT id FROM profiles
      WHERE id = auth.uid() AND (role IN ('admin', 'Admin') OR is_super_admin = true)
    )
  );

DROP POLICY IF EXISTS "Admins can update their academy students" ON students;

CREATE POLICY "Admins can update their academy students"
  ON students FOR UPDATE
  USING (
    academy_id IN (
      SELECT id FROM profiles
      WHERE id = auth.uid() AND (role IN ('admin', 'Admin') OR is_super_admin = true)
    )
  );

-- 4) Update get_pending_admins function to include role check fix
DROP FUNCTION IF EXISTS get_pending_admins();

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
    p.approval_status = 'pending'
    AND (
      p.role IN ('admin', 'Admin') OR p.is_super_admin = true
    )
  ORDER BY p.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
