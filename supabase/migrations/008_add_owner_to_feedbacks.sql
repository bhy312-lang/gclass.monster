-- =====================================================
-- student_feedbacks 테이블에 owner_id 추가
-- 원장별 피드백 데이터 분리를 위한 마이그레이션
-- =====================================================

-- 1. owner_id 컬럼 추가
ALTER TABLE student_feedbacks
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id);

-- 2. 인덱스 생성 (성능 최적화)
CREATE INDEX IF NOT EXISTS idx_student_feedbacks_owner
  ON student_feedbacks(owner_id);

CREATE INDEX IF NOT EXISTS idx_student_feedbacks_owner_student
  ON student_feedbacks(owner_id, student_id);

-- 3. RLS 활성화
ALTER TABLE student_feedbacks ENABLE ROW LEVEL SECURITY;

-- 4. 기존 정책 삭제 (있을 경우)
DROP POLICY IF EXISTS "Owners can manage own feedbacks" ON student_feedbacks;
DROP POLICY IF EXISTS "Parents can view children feedbacks" ON student_feedbacks;

-- 5. 원장 접근 정책 (본인 피드백 CRUD)
CREATE POLICY "Owners can manage own feedbacks" ON student_feedbacks
  FOR ALL USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- 6. 학부모 조회 정책 (자녀 피드백만 읽기)
CREATE POLICY "Parents can view children feedbacks" ON student_feedbacks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM students s
      WHERE s.id::text = student_feedbacks.student_id::text
        AND s.parent_id = auth.uid()
    )
  );
