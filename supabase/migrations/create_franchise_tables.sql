-- 가맹점별 데이터 분리를 위한 테이블 생성
-- Supabase SQL Editor에서 실행하세요

-- 1. 가맹점 학생 테이블
CREATE TABLE IF NOT EXISTS franchise_students (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id) NOT NULL,
  name TEXT NOT NULL,
  grade TEXT,
  school TEXT,
  parent_phone TEXT,
  memos JSONB DEFAULT '[]',
  makeup_times JSONB DEFAULT '[]',
  grades JSONB DEFAULT '[]',
  feedbacks JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS 정책
ALTER TABLE franchise_students ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own students" ON franchise_students;
CREATE POLICY "Users can manage own students" ON franchise_students
  FOR ALL USING (auth.uid() = owner_id);

-- 2. 가맹점 좌석 테이블
CREATE TABLE IF NOT EXISTS franchise_seats (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id) NOT NULL,
  seat_number INTEGER NOT NULL,
  name TEXT DEFAULT '',
  occupied BOOLEAN DEFAULT false,
  alarm_time TIMESTAMPTZ,
  alarming BOOLEAN DEFAULT false,
  alarm_stopped BOOLEAN DEFAULT false,
  position_x INTEGER DEFAULT 0,
  position_y INTEGER DEFAULT 0,
  width INTEGER DEFAULT 80,
  height INTEGER DEFAULT 80,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE franchise_seats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own seats" ON franchise_seats;
CREATE POLICY "Users can manage own seats" ON franchise_seats
  FOR ALL USING (auth.uid() = owner_id);

-- 3. 가맹점 할일(To-do) 테이블
CREATE TABLE IF NOT EXISTS franchise_todos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id) NOT NULL,
  date DATE NOT NULL,
  text TEXT NOT NULL,
  completed BOOLEAN DEFAULT false,
  color TEXT DEFAULT 'hsl(0, 0%, 95%)',
  student_id TEXT,
  memo_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE franchise_todos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own todos" ON franchise_todos;
CREATE POLICY "Users can manage own todos" ON franchise_todos
  FOR ALL USING (auth.uid() = owner_id);

-- 4. 가맹점 출결 테이블
CREATE TABLE IF NOT EXISTS franchise_attendance (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id) NOT NULL,
  student_id TEXT NOT NULL,
  student_name TEXT NOT NULL,
  check_in_time TIMESTAMPTZ,
  check_out_time TIMESTAMPTZ,
  alarm_time TIMESTAMPTZ,
  status TEXT DEFAULT 'waiting',
  seat_id TEXT,
  date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE franchise_attendance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own attendance" ON franchise_attendance;
CREATE POLICY "Users can manage own attendance" ON franchise_attendance
  FOR ALL USING (auth.uid() = owner_id);

-- 인덱스 생성 (성능 최적화)
CREATE INDEX IF NOT EXISTS idx_franchise_students_owner ON franchise_students(owner_id);
CREATE INDEX IF NOT EXISTS idx_franchise_seats_owner ON franchise_seats(owner_id);
CREATE INDEX IF NOT EXISTS idx_franchise_todos_owner_date ON franchise_todos(owner_id, date);
CREATE INDEX IF NOT EXISTS idx_franchise_attendance_owner_date ON franchise_attendance(owner_id, date);
