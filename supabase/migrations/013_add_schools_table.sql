-- =====================================================
-- 학교 테이블 생성 (학부모 수강신청용)
-- =====================================================

-- 학교 테이블 생성
CREATE TABLE IF NOT EXISTS schools (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  academy_id UUID NOT NULL REFERENCES academies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(academy_id, name)
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_schools_academy ON schools(academy_id);

-- RLS 활성화
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;

-- RLS 정책
CREATE POLICY "Owners can view own schools"
  ON schools FOR SELECT USING (
    academy_id IN (SELECT id FROM academies WHERE owner_id = auth.uid())
  );

CREATE POLICY "Owners can insert schools"
  ON schools FOR INSERT WITH CHECK (
    academy_id IN (SELECT id FROM academies WHERE owner_id = auth.uid())
  );

CREATE POLICY "Owners can update schools"
  ON schools FOR UPDATE USING (
    academy_id IN (SELECT id FROM academies WHERE owner_id = auth.uid())
  );

CREATE POLICY "Owners can delete schools"
  ON schools FOR DELETE USING (
    academy_id IN (SELECT id FROM academies WHERE owner_id = auth.uid())
  );

-- 인증되지 않은 사용자도 학교 목록 조회 가능 (수강신청 페이지용)
CREATE POLICY "Anyone can view schools for registration"
  ON schools FOR SELECT USING (true);

-- updated_at 트리거
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_schools_updated_at
  BEFORE UPDATE ON schools
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
