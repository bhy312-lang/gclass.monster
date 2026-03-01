-- 키오스크 학부모 뒤 4자리 검색 수정
-- FCM-based Attendance Notification System Schema
--
-- 문제: parent-join 신청 후 승인되어도 키오스크에서 뒤 4자리 검색이 안 됨
-- 원인: submit_parent_registration이 parent_phone_last4를 저장하지 않음
-- 해결: 1) 트리거로 자동 추출, 2) 기존 데이터 백필, 3) RPC 수정, 4) 복합 인덱스

-- =====================================================
-- 1. 자동 뒤4자리 추출 함수
-- =====================================================
CREATE OR REPLACE FUNCTION extract_parent_phone_last4()
RETURNS TRIGGER AS $$
DECLARE
    clean_phone TEXT;
BEGIN
    -- full_phone이 NULL이 되면 parent_phone_last4도 NULL로 초기화
    IF NEW.full_phone IS NULL THEN
        NEW.parent_phone_last4 := NULL;
        RETURN NEW;
    END IF;

    -- 숫자만 추출
    clean_phone := regexp_replace(NEW.full_phone, '\D', '', 'g');

    -- 숫자 길이가 4 미만이면 NULL 저장
    IF LENGTH(clean_phone) >= 4 THEN
        NEW.parent_phone_last4 := RIGHT(clean_phone, 4);
    ELSE
        NEW.parent_phone_last4 := NULL;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 2. 트리거 생성 (중복 방지)
-- =====================================================
DROP TRIGGER IF EXISTS trigger_students_extract_phone_last4 ON students;

CREATE TRIGGER trigger_students_extract_phone_last4
    BEFORE INSERT OR UPDATE ON students
    FOR EACH ROW
    EXECUTE FUNCTION extract_parent_phone_last4();

-- =====================================================
-- 3. 기존 데이터 백필
-- =====================================================
UPDATE students
SET parent_phone_last4 = CASE
    WHEN LENGTH(regexp_replace(full_phone, '\D', '', 'g')) >= 4
    THEN RIGHT(regexp_replace(full_phone, '\D', '', 'g'), 4)
    ELSE NULL
END
WHERE full_phone IS NOT NULL
  AND parent_phone_last4 IS NULL;

-- =====================================================
-- 4. 성능 인덱스 추가 (키오스크 조회 최적화)
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_students_kiosk_lookup
    ON students(parent_phone_last4, approval_status, academy_id)
    WHERE parent_phone_last4 IS NOT NULL;

-- =====================================================
-- 5. RPC 업데이트 (보안 강화: search_path 명시)
-- =====================================================
CREATE OR REPLACE FUNCTION submit_parent_registration(
  p_student_name TEXT,
  p_birth_date DATE,
  p_school_name TEXT,
  p_grade INTEGER,
  p_full_phone TEXT,
  p_academy_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_student_id UUID;
  v_user_id UUID := auth.uid();
  v_phone_last4 TEXT;
  v_clean_phone TEXT;
BEGIN
  -- 뒤 4자리 추출
  v_clean_phone := regexp_replace(p_full_phone, '\D', '', 'g');
  v_phone_last4 := CASE
    WHEN LENGTH(v_clean_phone) >= 4 THEN RIGHT(v_clean_phone, 4)
    ELSE NULL
  END;

  INSERT INTO students (
    name, birth_date, school_name, grade, full_phone, parent_phone_last4,
    parent_id, academy_id, approval_status
  ) VALUES (
    p_student_name, p_birth_date, p_school_name, p_grade,
    p_full_phone, v_phone_last4,
    v_user_id, p_academy_id, 'pending'
  ) RETURNING id INTO v_student_id;

  INSERT INTO parent_registration_notifications (student_id, academy_id)
  VALUES (v_student_id, p_academy_id);

  RETURN jsonb_build_object(
    'success', true,
    'student_id', v_student_id,
    'message', '가입 신청이 완료되었습니다. 관리자 승인 대기 중입니다.'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =====================================================
-- 주석
-- =====================================================
COMMENT ON FUNCTION extract_parent_phone_last4 IS 'full_phone에서 숫자만 추출하여 뒤 4자리를 parent_phone_last4에 자동 저장';
COMMENT ON INDEX idx_students_kiosk_lookup IS '키오스크 조회 성능 최적화 복합 인덱스 (parent_phone_last4 + approval_status + academy_id)';
