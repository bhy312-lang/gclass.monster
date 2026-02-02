-- Study-room-homepage Supabase 데이터베이스 설정
-- Supabase Dashboard > SQL Editor에서 실행하세요

-- ================================================
-- 1. 테이블 생성
-- ================================================

-- 사용자 프로필 (학부모)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email TEXT,
  name TEXT,
  phone TEXT,
  phone_last4 TEXT,
  role TEXT CHECK (role IN ('Admin', 'User') OR role IS NULL),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 학생
CREATE TABLE IF NOT EXISTS students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  parent_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  parent_phone_last4 TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 등원 기록
CREATE TABLE IF NOT EXISTS attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  student_name TEXT,
  type TEXT CHECK (type IN ('check_in', 'check_out')),
  check_in_time TIMESTAMPTZ,
  alarm_time TIMESTAMPTZ,
  seat_id TEXT,
  status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting', 'seated', 'completed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 좌석
CREATE TABLE IF NOT EXISTS seats (
  id TEXT PRIMARY KEY,
  number INT,
  x INT DEFAULT 0,
  y INT DEFAULT 0,
  occupied BOOLEAN DEFAULT FALSE,
  student_id UUID,
  student_name TEXT,
  check_in_time TIMESTAMPTZ,
  alarm_time TIMESTAMPTZ,
  alarming BOOLEAN DEFAULT FALSE,
  alarm_stopped BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================
-- 2. 인덱스 생성
-- ================================================

CREATE INDEX IF NOT EXISTS idx_profiles_phone_last4 ON profiles(phone_last4);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_students_parent_phone_last4 ON students(parent_phone_last4);
CREATE INDEX IF NOT EXISTS idx_attendance_status ON attendance(status);
CREATE INDEX IF NOT EXISTS idx_attendance_created ON attendance(created_at DESC);

-- ================================================
-- 3. Row Level Security 설정
-- ================================================

-- profiles 테이블 RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

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

-- 일반 사용자: 본인 프로필만 조회 가능
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Admin 권한: 모든 프로필 수정 가능 (is_admin 함수 사용으로 무한 재귀 방지)
DROP POLICY IF EXISTS "Admins can update any profile" ON profiles;
CREATE POLICY "Admins can update any profile" ON profiles
  FOR UPDATE
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- 일반 사용자: 본인 프로필만 수정 가능 (role 제외)
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND (old.role IS NOT DISTINCT FROM new.role OR new.role IS NULL));

-- students 테이블 RLS
ALTER TABLE students ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own students" ON students;
CREATE POLICY "Users can view own students" ON students
  FOR SELECT USING (auth.uid() = parent_id);

DROP POLICY IF EXISTS "Users can insert own students" ON students;
CREATE POLICY "Users can insert own students" ON students
  FOR INSERT WITH CHECK (auth.uid() = parent_id);

DROP POLICY IF EXISTS "Users can update own students" ON students;
CREATE POLICY "Users can update own students" ON students
  FOR UPDATE USING (auth.uid() = parent_id);

DROP POLICY IF EXISTS "Users can delete own students" ON students;
CREATE POLICY "Users can delete own students" ON students
  FOR DELETE USING (auth.uid() = parent_id);

-- 키오스크용: 전화번호 뒷자리로 학생 검색 허용 (익명 접근)
DROP POLICY IF EXISTS "Anyone can search students by phone" ON students;
CREATE POLICY "Anyone can search students by phone" ON students
  FOR SELECT USING (true);

-- attendance 테이블 RLS
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view attendance" ON attendance;
CREATE POLICY "Anyone can view attendance" ON attendance
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can insert attendance" ON attendance;
CREATE POLICY "Anyone can insert attendance" ON attendance
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can update attendance" ON attendance;
CREATE POLICY "Anyone can update attendance" ON attendance
  FOR UPDATE USING (true);

-- seats 테이블 RLS
ALTER TABLE seats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view seats" ON seats;
CREATE POLICY "Anyone can view seats" ON seats
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can insert seats" ON seats;
CREATE POLICY "Anyone can insert seats" ON seats
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can update seats" ON seats;
CREATE POLICY "Anyone can update seats" ON seats
  FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Anyone can delete seats" ON seats;
CREATE POLICY "Anyone can delete seats" ON seats
  FOR DELETE USING (true);

-- ================================================
-- 4. 트리거: 프로필 자동 생성
-- ================================================

-- 새 사용자 가입 시 profiles 테이블에 자동 추가
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    'User'  -- 기본 권한은 'User'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 기존 트리거 삭제 후 재생성
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ================================================
-- 5. Realtime 활성화
-- ================================================

-- attendance 테이블 실시간 변경 감지
ALTER PUBLICATION supabase_realtime ADD TABLE attendance;
ALTER PUBLICATION supabase_realtime ADD TABLE seats;

-- ================================================
-- 6. 편의 함수: 사용자 role 확인
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
-- 설정 완료!
-- ================================================
