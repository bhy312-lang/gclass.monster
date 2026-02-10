-- =====================================================
-- 슬롯 카운트 감소 함수 (수정 시 기존 슬롯 해제용)
-- =====================================================

-- 슬롯 current_count 감소 함수
CREATE OR REPLACE FUNCTION decrement_slot_count(p_slot_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE course_time_slots
    SET current_count = GREATEST(0, current_count - 1)
    WHERE id = p_slot_id;
END;
$$;

-- 주석 추가
COMMENT ON FUNCTION decrement_slot_count IS '슬롯의 현재 인원 수를 1 감소시킴 (수정 시 기존 슬롯 해제용)';
