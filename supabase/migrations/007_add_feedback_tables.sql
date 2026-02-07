-- 학생 피드백 테이블 생성
-- 관리자가 입력한 피드백과 AI 생성 메시지를 저장

CREATE TABLE IF NOT EXISTS student_feedbacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES students(id) ON DELETE CASCADE NOT NULL,

  -- 성적 정보 (자유 과목 입력)
  subject_scores JSONB DEFAULT '{}',  -- {"국어": 85, "수학": 90, ...}
  grade_level TEXT,  -- "상", "중상", "중", "중하", "하"

  -- 피드백 내용
  study_attitude TEXT,  -- 학습 태도
  strengths TEXT,  -- 잘하는 점
  improvements TEXT,  -- 개선이 필요한 점
  special_notes TEXT,  -- 특이사항
  teacher_comment TEXT,  -- 선생님 코멘트

  -- AI 생성 메시지
  generated_message TEXT,  -- Gemini가 생성한 학부모용 메시지

  -- 전송 관련
  feedback_period TEXT,  -- "2026년 1월", "2026년 1학기" 등
  sent_at TIMESTAMPTZ,  -- 전송 시간
  scheduled_at TIMESTAMPTZ,  -- 예약 전송 시간
  send_status TEXT DEFAULT 'pending' CHECK (send_status IN ('pending', 'sent', 'scheduled', 'failed')),

  -- 메타데이터
  created_by UUID REFERENCES profiles(id),  -- 작성자 (관리자)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_feedbacks_student ON student_feedbacks(student_id);
CREATE INDEX IF NOT EXISTS idx_feedbacks_period ON student_feedbacks(feedback_period);
CREATE INDEX IF NOT EXISTS idx_feedbacks_created ON student_feedbacks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedbacks_status ON student_feedbacks(send_status);
CREATE INDEX IF NOT EXISTS idx_feedbacks_scheduled ON student_feedbacks(scheduled_at) WHERE scheduled_at IS NOT NULL;

-- RLS 비활성화 (기존 정책과 동일하게)
ALTER TABLE student_feedbacks DISABLE ROW LEVEL SECURITY;

-- updated_at 자동 업데이트 트리거
CREATE OR REPLACE FUNCTION update_feedback_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_feedback_updated_at
  BEFORE UPDATE ON student_feedbacks
  FOR EACH ROW
  EXECUTE FUNCTION update_feedback_updated_at();

-- 코멘트 추가
COMMENT ON TABLE student_feedbacks IS '학생별 피드백 및 AI 생성 메시지 저장';
COMMENT ON COLUMN student_feedbacks.subject_scores IS 'JSON 형태의 과목별 점수 {"과목명": 점수}';
COMMENT ON COLUMN student_feedbacks.generated_message IS 'Gemini AI가 생성한 학부모용 메시지';
COMMENT ON COLUMN student_feedbacks.scheduled_at IS '예약 전송 시간';
