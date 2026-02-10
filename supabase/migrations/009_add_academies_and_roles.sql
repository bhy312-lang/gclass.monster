-- =====================================================
-- 학원/공부방 테이블 및 사용자 역할 추가
-- =====================================================

-- 1. 학원/공부방 테이블 생성
CREATE TABLE IF NOT EXISTS academies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id) NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  address TEXT,
  phone TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 학원 검색을 위한 인덱스
CREATE INDEX IF NOT EXISTS idx_academies_name ON academies USING gin(to_tsvector('simple', name));
CREATE INDEX IF NOT EXISTS idx_academies_owner ON academies(owner_id);
CREATE INDEX IF NOT EXISTS idx_academies_active ON academies(is_active) WHERE is_active = true;

-- 학원 RLS
ALTER TABLE academies ENABLE ROW LEVEL SECURITY;

-- 원장은 자신의 학원만 관리
DROP POLICY IF EXISTS "Owners can manage own academy" ON academies;
CREATE POLICY "Owners can manage own academy" ON academies
  FOR ALL USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- 모든 로그인 사용자는 활성 학원 목록 조회 가능 (학부모 가입용)
DROP POLICY IF EXISTS "Anyone can view active academies" ON academies;
CREATE POLICY "Anyone can view active academies" ON academies
  FOR SELECT USING (is_active = true);

-- 2. profiles 테이블에 역할 및 학원 연결 컬럼 추가
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS role TEXT CHECK (role IN ('owner', 'parent')) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS academy_id UUID REFERENCES academies(id) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS name TEXT DEFAULT NULL;

-- 역할별 인덱스
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_academy ON profiles(academy_id);

-- 3. 학부모-학원 연결 테이블 (학부모가 여러 학원에 자녀를 보낼 수 있음)
CREATE TABLE IF NOT EXISTS parent_academy_links (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  parent_id UUID REFERENCES auth.users(id) NOT NULL,
  academy_id UUID REFERENCES academies(id) NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(parent_id, academy_id)
);

-- 학부모-학원 연결 RLS
ALTER TABLE parent_academy_links ENABLE ROW LEVEL SECURITY;

-- 학부모는 자신의 연결만 관리
DROP POLICY IF EXISTS "Parents can manage own links" ON parent_academy_links;
CREATE POLICY "Parents can manage own links" ON parent_academy_links
  FOR ALL USING (auth.uid() = parent_id)
  WITH CHECK (auth.uid() = parent_id);

-- 원장은 자신의 학원 연결 요청 조회/관리
DROP POLICY IF EXISTS "Owners can view academy links" ON parent_academy_links;
CREATE POLICY "Owners can view academy links" ON parent_academy_links
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM academies a
      WHERE a.id = parent_academy_links.academy_id
        AND a.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Owners can update academy links" ON parent_academy_links;
CREATE POLICY "Owners can update academy links" ON parent_academy_links
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM academies a
      WHERE a.id = parent_academy_links.academy_id
        AND a.owner_id = auth.uid()
    )
  );
