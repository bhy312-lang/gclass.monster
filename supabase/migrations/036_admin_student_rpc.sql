-- 관리자용 학생 등록/수정/삭제 RPC
-- 목적: 원장이 직접 학생을 관리할 수 있는 표준 경로 제공
-- 보안: role='admin' 권한 검증, academy_id=auth.uid() 강제

-- 관리자용 학생 등록/수정 RPC
CREATE OR REPLACE FUNCTION admin_upsert_student(
    p_student_id UUID DEFAULT NULL,
    p_name TEXT,
    p_birth_date DATE DEFAULT NULL,
    p_school_name TEXT DEFAULT NULL,
    p_grade INTEGER DEFAULT NULL,
    p_full_phone TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_academy_id UUID;
    v_result JSONB;
    v_student students%ROWTYPE;
BEGIN
    -- 관리자 권한 검증
    IF NOT EXISTS (
        SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    ) THEN
        RETURN jsonb_build_object('error', '관리자 권한이 필요합니다');
    END IF;

    v_academy_id := auth.uid();

    -- 신규 생성
    IF p_student_id IS NULL THEN
        INSERT INTO students (
            name, birth_date, school_name, grade, full_phone,
            academy_id, approval_status
        ) VALUES (
            p_name, p_birth_date, p_school_name, p_grade, p_full_phone,
            v_academy_id, 'approved'  -- 원장 직접 등록은 자동 승인
        )
        RETURNING * INTO v_student;
    ELSE
        -- 기존 수정 (소유권 검증 포함)
        UPDATE students
        SET
            name = p_name,
            birth_date = p_birth_date,
            school_name = p_school_name,
            grade = p_grade,
            full_phone = p_full_phone,
            updated_at = now()
        WHERE id = p_student_id AND academy_id = v_academy_id
        RETURNING * INTO v_student;

        -- 수정된 행이 없으면 에러
        IF NOT FOUND THEN
            RETURN jsonb_build_object('error', '학생을 찾을 수 없거나 권한이 없습니다');
        END IF;
    END IF;

    -- 결과 반환 (성공 시 전체 학생 데이터)
    RETURN row_to_json(v_student)::JSONB;
END;
$$;

-- 관리자용 학생 삭제 RPC
CREATE OR REPLACE FUNCTION admin_delete_student(
    p_student_id UUID
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_academy_id UUID;
    v_deleted_count INTEGER;
BEGIN
    -- 관리자 권한 검증
    IF NOT EXISTS (
        SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    ) THEN
        RETURN jsonb_build_object('error', '관리자 권한이 필요합니다');
    END IF;

    v_academy_id := auth.uid();

    -- 소유권 검증 후 삭제
    DELETE FROM students
    WHERE id = p_student_id AND academy_id = v_academy_id;

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    IF v_deleted_count = 0 THEN
        RETURN jsonb_build_object('error', '학생을 찾을 수 없거나 권한이 없습니다');
    END IF;

    RETURN jsonb_build_object('success', true, 'student_id', p_student_id);
END;
$$;

-- 권한 부여
GRANT EXECUTE ON FUNCTION admin_upsert_student TO authenticated;
GRANT EXECUTE ON FUNCTION admin_delete_student TO authenticated;

-- 롤백:
-- DROP FUNCTION IF EXISTS admin_upsert_student CASCADE;
-- DROP FUNCTION IF EXISTS admin_delete_student CASCADE;
