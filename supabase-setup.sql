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
CREATE INDEX IF NOT EXISTS idx_students_parent_phone_last4 ON students(parent_phone_last4);
CREATE INDEX IF NOT EXISTS idx_attendance_status ON attendance(status);
CREATE INDEX IF NOT EXISTS idx_attendance_created ON attendance(created_at DESC);

-- ================================================
-- 3. Row Level Security 설정
-- ================================================

-- profiles 테이블 RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

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
  INSERT INTO public.profiles (id, email, name)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', '')
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
-- 설정 완료!
-- ================================================
