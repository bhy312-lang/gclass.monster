-- =====================================================
-- 기간 설정에 단위 시간 필드 추가
-- =====================================================

-- course_periods 테이블에 단위 시간 필드 추가
ALTER TABLE course_periods ADD COLUMN IF NOT EXISTS slot_interval_minutes INTEGER DEFAULT 30;

-- 기존 레코드들의 기본값 설정 (없는 경우 30분으로)
UPDATE course_periods SET slot_interval_minutes = 30 WHERE slot_interval_minutes IS NULL;

-- 제약조건: 15분 단위로 설정 가능 (15, 30, 45, 60, ...)
ALTER TABLE course_periods ADD CONSTRAINT check_slot_interval_minutes
  CHECK (slot_interval_minutes IN (15, 30, 45, 60));

-- 주석 추가
COMMENT ON COLUMN course_periods.slot_interval_minutes IS '슬롯 단위 시간 (분) - 학부모가 선택하는 최소 시간 단위';
