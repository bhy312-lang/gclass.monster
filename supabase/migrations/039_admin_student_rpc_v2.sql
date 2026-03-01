-- ============================================================================
-- 039_admin_student_rpc_v2.sql
-- ============================================================================
-- Purpose: admin_upsert_student RPC에 parent_id 파라미터 추가
-- Context: 관리자가 학생을 등록할 때 부모 계정 연동을 명시적으로 처리
--
-- 주요 변경사항:
-- - p_parent_id UUID DEFAULT NULL 파라미터 추가
-- - parent_id 연동 상태를 명확히 추적 가능
-- - parent_id 제공 시 profiles.role='parent' 검증
-- ============================================================================

-- 기존 함수를 대체하는 새 버전
CREATE OR REPLACE FUNCTION admin_upsert_student(
    p_student_id UUID DEFAULT NULL,
    p_name TEXT,
    p_birth_date DATE DEFAULT NULL,
    p_school_name TEXT DEFAULT NULL,
    p_grade INTEGER DEFAULT NULL,
    p_full_phone TEXT DEFAULT NULL,
    p_parent_id UUID DEFAULT NULL  -- NEW: 부모 계정 명시적 연결
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_academy_id UUID;
    v_result JSONB;
    v_student students%ROWTYPE;
    v_parent_role TEXT;
BEGIN
    -- 관리자 권한 검증
    IF NOT EXISTS (
        SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    ) THEN
        RETURN jsonb_build_object(
            'error', '관리자 권한이 필요합니다',
            'error_code', 'INSUFFICIENT_PERMISSIONS'
        );
    END IF;

    v_academy_id := auth.uid();

    -- parent_id가 제공된 경우 유효성 검증
    IF p_parent_id IS NOT NULL THEN
        -- parent_id가 profiles 테이블에 존재하는지 확인
        SELECT role INTO v_parent_role
        FROM profiles
        WHERE id = p_parent_id;

        IF v_parent_role IS NULL THEN
            RETURN jsonb_build_object(
                'error', '지정된 부모 계정을 찾을 수 없습니다',
                'error_code', 'PARENT_NOT_FOUND'
            );
        END IF;

        IF v_parent_role != 'parent' THEN
            RETURN jsonb_build_object(
                'error', '지정된 계정은 부모 계정이 아닙니다',
                'error_code', 'NOT_A_PARENT_ACCOUNT',
                'actual_role', v_parent_role
            );
        END IF;
    END IF;

    -- 신규 생성
    IF p_student_id IS NULL THEN
        INSERT INTO students (
            name, birth_date, school_name, grade, full_phone,
            parent_id,  -- NEW: parent_id 포함
            academy_id, approval_status
        ) VALUES (
            p_name, p_birth_date, p_school_name, p_grade, p_full_phone,
            p_parent_id,  -- NEW: NULL 허용 (미연동 상태)
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
            parent_id = p_parent_id,  -- NEW: parent_id 수정 가능
            updated_at = now()
        WHERE id = p_student_id AND academy_id = v_academy_id
        RETURNING * INTO v_student;

        -- 수정된 행이 없으면 에러
        IF NOT FOUND THEN
            RETURN jsonb_build_object(
                'error', '학생을 찾을 수 없거나 권한이 없습니다',
                'error_code', 'STUDENT_NOT_FOUND'
            );
        END IF;
    END IF;

    -- 결과 반환 (성공 시 전체 학생 데이터)
    RETURN jsonb_build_object(
        'success', true,
        'data', row_to_json(v_student)::JSONB,
        -- 연동 상태 명시적 표시
        'parent_linked', v_student.parent_id IS NOT NULL
    );
END;
$$;

-- ============================================================================
-- 보조 함수: parent_id로 검색 가능한 부모 계정 목록
-- ============================================================================
-- 용도: 관리자 화면에서 부모 계정 연결 시 자동완성/검색 기능 제공
-- ============================================================================
CREATE OR REPLACE FUNCTION admin_search_parents(
    p_search_term TEXT DEFAULT NULL,
    p_limit INTEGER DEFAULT 50
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_academy_id UUID;
    v_results JSONB;
BEGIN
    -- 관리자 권한 검증
    IF NOT EXISTS (
        SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    ) THEN
        RETURN jsonb_build_object(
            'error', '관리자 권한이 필요합니다',
            'error_code', 'INSUFFICIENT_PERMISSIONS'
        );
    END IF;

    -- 검색 조건에 따라 부모 계정 조회
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', p.id,
            'name', p.name,
            'phone', p.phone,
            'email', p.email
        )
    ) INTO v_results
    FROM profiles p
    WHERE p.role = 'parent'
      AND (
          p_search_term IS NULL
          OR p.name ILIKE '%' || p_search_term || '%'
          OR p.phone ILIKE '%' || p_search_term || '%'
          OR p.email ILIKE '%' || p_search_term || '%'
      )
    ORDER BY p.name
    LIMIT p_limit;

    RETURN jsonb_build_object(
        'success', true,
        'data', COALESCE(v_results, '[]'::JSONB)
    );
END;
$$;

-- ============================================================================
-- 보조 함수: parent_id NULL인 학생에게 부모 계정 연결
-- ============================================================================
-- 용도: 이미 생성된 학생에게 나중에 부모 계정을 연결
-- ============================================================================
CREATE OR REPLACE FUNCTION admin_link_student_parent(
    p_student_id UUID,
    p_parent_id UUID
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_academy_id UUID;
    v_student_name TEXT;
    v_parent_name TEXT;
    v_parent_role TEXT;
BEGIN
    -- 관리자 권한 검증
    IF NOT EXISTS (
        SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    ) THEN
        RETURN jsonb_build_object(
            'error', '관리자 권한이 필요합니다',
            'error_code', 'INSUFFICIENT_PERMISSIONS'
        );
    END IF;

    v_academy_id := auth.uid();

    -- parent_id 유효성 검증
    SELECT role, name INTO v_parent_role, v_parent_name
    FROM profiles
    WHERE id = p_parent_id;

    IF v_parent_role IS NULL THEN
        RETURN jsonb_build_object(
            'error', '지정된 부모 계정을 찾을 수 없습니다',
            'error_code', 'PARENT_NOT_FOUND'
        );
    END IF;

    IF v_parent_role != 'parent' THEN
        RETURN jsonb_build_object(
            'error', '지정된 계정은 부모 계정이 아닙니다',
            'error_code', 'NOT_A_PARENT_ACCOUNT',
            'actual_role', v_parent_role
        );
    END IF;

    -- 학생 조회 및 소유권 검증
    SELECT name INTO v_student_name
    FROM students
    WHERE id = p_student_id AND academy_id = v_academy_id;

    IF v_student_name IS NULL THEN
        RETURN jsonb_build_object(
            'error', '학생을 찾을 수 없거나 권한이 없습니다',
            'error_code', 'STUDENT_NOT_FOUND'
        );
    END IF;

    -- 부모 계정 연결
    UPDATE students
    SET
        parent_id = p_parent_id,
        updated_at = NOW()
    WHERE id = p_student_id;

    RETURN jsonb_build_object(
        'success', true,
        'student_id', p_student_id,
        'student_name', v_student_name,
        'parent_id', p_parent_id,
        'parent_name', v_parent_name
    );
END;
$$;

-- 권한 부여
GRANT EXECUTE ON FUNCTION admin_upsert_student TO authenticated;
GRANT EXECUTE ON FUNCTION admin_search_parents TO authenticated;
GRANT EXECUTE ON FUNCTION admin_link_student_parent TO authenticated;

-- 롤백:
-- DROP FUNCTION IF EXISTS admin_upsert_student CASCADE;
-- DROP FUNCTION IF EXISTS admin_search_parents CASCADE;
-- DROP FUNCTION IF EXISTS admin_link_student_parent CASCADE;
