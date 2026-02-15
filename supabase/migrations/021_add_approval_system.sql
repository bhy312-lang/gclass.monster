-- ============================================
-- 승인 시스템을 위한 마이그레이션
-- ============================================

-- 1. profiles 테이블에 승인 관련 컬럼 추가
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS academy_name TEXT,
  ADD COLUMN IF NOT EXISTS business_number TEXT,
  ADD COLUMN IF NOT EXISTS full_phone TEXT,
  ADD COLUMN IF NOT EXISTS business_license_url TEXT,
  ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'approved' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT false;

-- 2. students 테이블에 승인 관련 컬럼 추가
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS birth_date DATE,
  ADD COLUMN IF NOT EXISTS school_name TEXT,
  ADD COLUMN IF NOT EXISTS grade INTEGER,
  ADD COLUMN IF NOT EXISTS full_phone TEXT,
  ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS academy_id UUID REFERENCES profiles(id);

-- 3. 관리자 가입 신청 알림 테이블 (슈퍼관리자용)
CREATE TABLE IF NOT EXISTS admin_registration_notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. 학부모 가입 신청 알림 테이블 (관리자용)
CREATE TABLE IF NOT EXISTS parent_registration_notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  academy_id UUID REFERENCES profiles(id),
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_profiles_approval_status ON profiles(approval_status);
CREATE INDEX IF NOT EXISTS idx_profiles_academy_name ON profiles(academy_name);
CREATE INDEX IF NOT EXISTS idx_students_approval_status ON students(approval_status);
CREATE INDEX IF NOT EXISTS idx_students_academy_id ON students(academy_id);
CREATE INDEX IF NOT EXISTS idx_admin_notifications_admin_id ON admin_registration_notifications(admin_id);
CREATE INDEX IF NOT EXISTS idx_parent_notifications_academy_id ON parent_registration_notifications(academy_id);

-- 6. RLS 정책 (알림 테이블)
ALTER TABLE admin_registration_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE parent_registration_notifications ENABLE ROW LEVEL SECURITY;

-- 슈퍼관리자만 모든 알림 조회 가능
CREATE POLICY "Super admins can view all admin notifications"
  ON admin_registration_notifications FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND is_super_admin = true
    )
  );

CREATE POLICY "Super admins can update admin notifications"
  ON admin_registration_notifications FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND is_super_admin = true
    )
  );

-- 관리자는 자신에게 온 학부모 신청 알림만 조회 가능
CREATE POLICY "Admins can view their parent notifications"
  ON parent_registration_notifications FOR SELECT
  USING (academy_id = auth.uid());

CREATE POLICY "Admins can update their parent notifications"
  ON parent_registration_notifications FOR UPDATE
  USING (academy_id = auth.uid());

-- 7. profiles RLS 정책 업데이트 (승인된 관리자만 조회 가능)
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

-- 본인 프로필 조회
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (id = auth.uid());

-- 본인 프로필 수정
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (id = auth.uid());

-- 슈퍼관리자는 모든 프로필 조회 가능
CREATE POLICY "Super admins can view all profiles"
  ON profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND is_super_admin = true
    )
  );

-- 슈퍼관리자는 모든 프로필 수정 가능
CREATE POLICY "Super admins can update all profiles"
  ON profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND is_super_admin = true
    )
  );

-- 8. 학원 검색을 위한 정책 (승인된 학원만 검색 가능)
CREATE POLICY "Approved academies are searchable"
  ON profiles FOR SELECT
  USING (
    role = 'Admin'
    AND approval_status = 'approved'
    AND academy_name IS NOT NULL
  );

-- 9. students RLS 정책 업데이트
DROP POLICY IF EXISTS "Users can view own students" ON students;
DROP POLICY IF EXISTS "Users can insert own students" ON students;
DROP POLICY IF EXISTS "Users can update own students" ON students;
DROP POLICY IF EXISTS "Users can delete own students" ON students;

-- 학부모는 본인 자녀만 조회 가능 (승인된 자녀만)
CREATE POLICY "Parents can view own approved students"
  ON students FOR SELECT
  USING (parent_id = auth.uid());

CREATE POLICY "Parents can insert own students"
  ON students FOR INSERT
  WITH CHECK (parent_id = auth.uid());

CREATE POLICY "Parents can update own students"
  ON students FOR UPDATE
  USING (parent_id = auth.uid());

CREATE POLICY "Parents can delete own students"
  ON students FOR DELETE
  USING (parent_id = auth.uid());

-- 관리자는 자신의 학원 학생들만 조회 가능
CREATE POLICY "Admins can view their academy students"
  ON students FOR SELECT
  USING (
    academy_id IN (
      SELECT id FROM profiles
      WHERE id = auth.uid() AND role = 'Admin'
    )
  );

-- 관리자는 자신의 학원 학생들 수정 가능
CREATE POLICY "Admins can update their academy students"
  ON students FOR UPDATE
  USING (
    academy_id IN (
      SELECT id FROM profiles
      WHERE id = auth.uid() AND role = 'Admin'
    )
  );

-- 10. 함수: 관리자 가입 신청 생성
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
  -- 프로필 업데이트
  UPDATE profiles
  SET
    academy_name = p_academy_name,
    business_number = p_business_number,
    name = p_full_name,
    full_phone = p_full_phone,
    business_license_url = p_business_license_url,
    role = 'Admin',
    approval_status = 'pending'
  WHERE id = v_user_id;

  -- 알림 생성
  INSERT INTO admin_registration_notifications (admin_id)
  VALUES (v_user_id);

  RETURN jsonb_build_object(
    'success', true,
    'message', '가입 신청이 완료되었습니다. 승인 대기 중입니다.'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 11. 함수: 슈퍼관리자가 관리자 승인/거절
CREATE OR REPLACE FUNCTION process_admin_registration(
  p_admin_id UUID,
  p_approved BOOLEAN,
  p_rejection_reason TEXT DEFAULT NULL
) RETURNS JSONB AS $$
BEGIN
  -- 슈퍼관리자 권한 확인
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND is_super_admin = true
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', '슈퍼관리자 권한이 필요합니다.'
    );
  END IF;

  -- 승인 상태 업데이트
  UPDATE profiles
  SET
    approval_status = CASE WHEN p_approved THEN 'approved' ELSE 'rejected' END,
    rejection_reason = CASE WHEN p_approved THEN NULL ELSE p_rejection_reason END
  WHERE id = p_admin_id;

  -- 알림 읽음 표시
  UPDATE admin_registration_notifications
  SET is_read = true
  WHERE admin_id = p_admin_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', CASE
      WHEN p_approved THEN '승인이 완료되었습니다.'
      ELSE '거절되었습니다.'
    END
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 12. 함수: 학부모 가입 신청 생성
CREATE OR REPLACE FUNCTION submit_parent_registration(
  p_student_name TEXT,
  p_birth_date DATE,
  p_school_name TEXT,
  p_grade INTEGER,
  p_full_phone TEXT,
  p_academy_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_student_id UUID;
  v_user_id UUID := auth.uid();
BEGIN
  -- 학생 생성
  INSERT INTO students (
    name,
    birth_date,
    school_name,
    grade,
    full_phone,
    parent_id,
    academy_id,
    approval_status
  ) VALUES (
    p_student_name,
    p_birth_date,
    p_school_name,
    p_grade,
    p_full_phone,
    v_user_id,
    p_academy_id,
    'pending'
  ) RETURNING id INTO v_student_id;

  -- 알림 생성
  INSERT INTO parent_registration_notifications (student_id, academy_id)
  VALUES (v_student_id, p_academy_id);

  RETURN jsonb_build_object(
    'success', true,
    'student_id', v_student_id,
    'message', '가입 신청이 완료되었습니다. 관리자 승인 대기 중입니다.'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 13. 함수: 관리자가 학부모 승인/거절
CREATE OR REPLACE FUNCTION process_parent_registration(
  p_student_id UUID,
  p_approved BOOLEAN,
  p_rejection_reason TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_academy_id UUID;
BEGIN
  -- 학생의 학원 ID 확인
  SELECT academy_id INTO v_academy_id
  FROM students
  WHERE id = p_student_id;

  -- 권한 확인: 해당 학원의 관리자인지
  IF v_academy_id != auth.uid() THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', '권한이 없습니다.'
    );
  END IF;

  -- 승인 상태 업데이트
  UPDATE students
  SET
    approval_status = CASE WHEN p_approved THEN 'approved' ELSE 'rejected' END,
    rejection_reason = CASE WHEN p_approved THEN NULL ELSE p_rejection_reason END
  WHERE id = p_student_id;

  -- 알림 읽음 표시
  UPDATE parent_registration_notifications
  SET is_read = true
  WHERE student_id = p_student_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', CASE
      WHEN p_approved THEN '승인이 완료되었습니다.'
      ELSE '거절되었습니다.'
    END
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 14. 함수: 학원 검색 (승인된 학원만)
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
    p.role = 'Admin'
    AND p.approval_status = 'approved'
    AND p.academy_name IS NOT NULL
    AND (p_search_term = '' OR p.academy_name ILIKE '%' || p_search_term || '%')
  ORDER BY p.academy_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 15. 함수: 승인 대기 중인 관리자 목록 조회
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
    p.role = 'Admin'
    AND p.approval_status = 'pending'
  ORDER BY p.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 16. 함수: 승인 대기 중인 학생 목록 조회 (관리자용)
CREATE OR REPLACE FUNCTION get_pending_students(p_academy_id UUID DEFAULT NULL)
RETURNS TABLE (
  id UUID,
  student_name TEXT,
  birth_date DATE,
  school_name TEXT,
  grade INTEGER,
  full_phone TEXT,
  parent_name TEXT,
  parent_email TEXT,
  approval_status TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    s.name,
    s.birth_date,
    s.school_name,
    s.grade,
    s.full_phone,
    p.name AS parent_name,
    p.email AS parent_email,
    s.approval_status
  FROM students s
  JOIN profiles p ON s.parent_id = p.id
  WHERE
    (p_academy_id IS NULL OR s.academy_id = p_academy_id)
    AND s.approval_status IN ('pending', 'rejected')
  ORDER BY s.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
