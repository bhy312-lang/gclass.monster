-- =====================================================
-- 수강신청 제출 함수 수정 (selected_slot_ids 저장 문제 해결)
-- =====================================================

-- 기존 함수 삭제 후 재생성
DROP FUNCTION IF EXISTS submit_course_registration(UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB);

-- 새 함수 생성 (레이스 조건 수정)
CREATE OR REPLACE FUNCTION submit_course_registration(
  p_period_id UUID,
  p_academy_id UUID,
  p_student_name TEXT,
  p_school_name TEXT,
  p_grade TEXT,
  p_guardian_phone TEXT,
  p_selected_slot_ids JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_registration_id UUID;
  v_order INTEGER;
  v_status TEXT := 'pending';
  v_slot_id TEXT;
  v_updated_count INTEGER;
  v_confirmed_slots JSONB := '[]'::jsonb;
  v_total_slots INTEGER;
  v_confirmed_count INTEGER;
BEGIN
  -- 중복 신청 체크 (같은 전화번호)
  IF EXISTS (
    SELECT 1 FROM course_registrations
    WHERE period_id = p_period_id
      AND guardian_phone = p_guardian_phone
      AND status != 'cancelled'
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'DUPLICATE_PHONE',
      'message', '이미 신청된 연락처입니다.'
    );
  END IF;

  -- 신청 순서 가져오기
  SELECT COALESCE(MAX(submission_order), 0) + 1
  INTO v_order
  FROM course_registrations
  WHERE period_id = p_period_id;

  -- 전체 슬롯 수 및 확인된 슬롯 수 초기화
  v_total_slots := jsonb_array_length(p_selected_slot_ids);
  v_confirmed_count := 0;

  -- 각 슬롯별 정원 체크 및 업데이트 (원자적 UPDATE로 레이스 조건 방지)
  IF v_total_slots > 0 THEN
    FOR v_slot_id IN
      SELECT jsonb_array_elements_text(p_selected_slot_ids)
    LOOP
      -- UPDATE에서 직접 정원 체크 및 증가 (원자적 연산)
      UPDATE course_time_slots
      SET current_count = current_count + 1
      WHERE id = v_slot_id::uuid
        AND current_count < capacity
      RETURNING current_count INTO v_updated_count;

      -- 정원이 남아서 업데이트되었는지 확인
      IF FOUND THEN
        v_confirmed_slots := v_confirmed_slots || to_jsonb(v_slot_id);
        v_confirmed_count := v_confirmed_count + 1;
      END IF;
    END LOOP;
  END IF;

  -- 신청 레코드 생성 (selected_slot_ids 명시적으로 저장)
  INSERT INTO course_registrations (
    period_id, academy_id, student_name, school_name, grade,
    guardian_phone, selected_slot_ids, confirmed_slot_ids, status, submission_order
  )
  VALUES (
    p_period_id, p_academy_id, p_student_name, p_school_name,
    p_grade, p_guardian_phone, p_selected_slot_ids, v_confirmed_slots, v_status, v_order
  )
  RETURNING id INTO v_registration_id;

  -- 상태 결정
  IF v_total_slots = 0 THEN
    v_status := 'pending';
  ELSIF v_confirmed_count = v_total_slots THEN
    v_status := 'confirmed';
  ELSIF v_confirmed_count > 0 THEN
    v_status := 'waiting';
  ELSE
    v_status := 'waiting';
  END IF;

  -- 신청 상태 업데이트
  UPDATE course_registrations
  SET status = v_status,
      updated_at = NOW()
  WHERE id = v_registration_id;

  -- 결과 반환
  RETURN jsonb_build_object(
    'success', true,
    'registration_id', v_registration_id,
    'status', v_status,
    'total_slots', v_total_slots,
    'confirmed_count', v_confirmed_count,
    'confirmed_slots', v_confirmed_slots
  );
END;
$$;

-- 주석 추가
COMMENT ON FUNCTION submit_course_registration IS '수강신청 제출 함수 (selected_slot_ids 저장 문제 해결, 원자적 UPDATE로 레이스 조건 방지)';

