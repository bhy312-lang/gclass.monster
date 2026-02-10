-- =====================================================
-- 학원 테이블에 주간 최대 신청 가능시간 필드 추가
-- =====================================================

-- academies 테이블에 주간 최대 신청 가능시간 필드 추가
ALTER TABLE academies ADD COLUMN IF NOT EXISTS max_weekly_hours INTEGER DEFAULT 5;

-- 기존 레코드들의 기본값 설정 (없는 경우 5시간으로)
UPDATE academies SET max_weekly_hours = 5 WHERE max_weekly_hours IS NULL;

-- 제약조건: 1~20시간 사이로 설정 가능
ALTER TABLE academies ADD CONSTRAINT check_max_weekly_hours
  CHECK (max_weekly_hours >= 1 AND max_weekly_hours <= 20);

-- 주석 추가
COMMENT ON COLUMN academies.max_weekly_hours IS '학부모가 한 주에 신청 가능한 최대 시간 (시간 단위)';
