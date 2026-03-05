-- ============================================================================
-- 045_add_weekly_class_minutes_and_student_schedule_rpcs.sql
-- Purpose: 학생 기본정보에 요일별 수업시간(분) 저장 + 수강신청 연동 RPC 제공
-- ============================================================================

-- 1) students 컬럼 확장
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS weekly_class_minutes JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS weekly_class_minutes_source TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS weekly_class_minutes_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS weekly_class_minutes_manual_updated_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'students_weekly_class_minutes_source_chk'
  ) THEN
    ALTER TABLE students
      ADD CONSTRAINT students_weekly_class_minutes_source_chk
      CHECK (weekly_class_minutes_source IN ('none', 'registration', 'manual'));
  END IF;
END $$;

COMMENT ON COLUMN students.weekly_class_minutes IS '요일별 수업시간(분) JSONB. keys: mon,tue,wed,thu,fri';
COMMENT ON COLUMN students.weekly_class_minutes_source IS '요일별 수업시간 값의 마지막 반영 출처: none|registration|manual';

-- 2) 최신 confirmed 수강신청 기준 요일별 분 계산 RPC
CREATE OR REPLACE FUNCTION admin_get_student_registration_weekly_minutes(
  p_student_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_student students%ROWTYPE;
  v_academy_row academies%ROWTYPE;
  v_phone_digits TEXT;
  v_registration RECORD;
  v_slot_ids UUID[];
  v_interval_minutes INTEGER := 30;
  v_minutes JSONB := jsonb_build_object(
    'mon', NULL,
    'tue', NULL,
    'wed', NULL,
    'thu', NULL,
    'fri', NULL
  );
  v_mon_count INTEGER := 0;
  v_tue_count INTEGER := 0;
  v_wed_count INTEGER := 0;
  v_thu_count INTEGER := 0;
  v_fri_count INTEGER := 0;
BEGIN
  SELECT LOWER(COALESCE(role, '')) INTO v_role
  FROM profiles
  WHERE id = auth.uid();

  IF v_role NOT IN ('admin', 'super_admin') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INSUFFICIENT_PERMISSIONS'
    );
  END IF;

  SELECT * INTO v_student
  FROM students
  WHERE id = p_student_id
    AND academy_id = auth.uid();

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'STUDENT_NOT_FOUND'
    );
  END IF;

  IF COALESCE(TRIM(v_student.name), '') = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'STUDENT_NAME_EMPTY'
    );
  END IF;

  v_phone_digits := normalize_phone_digits(v_student.full_phone);
  IF COALESCE(v_phone_digits, '') = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'STUDENT_PHONE_EMPTY'
    );
  END IF;

  SELECT * INTO v_academy_row
  FROM academies
  WHERE owner_id = v_student.academy_id
  ORDER BY created_at ASC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'ACADEMY_NOT_FOUND_FOR_OWNER'
    );
  END IF;

  SELECT r.*
  INTO v_registration
  FROM course_registrations r
  WHERE r.academy_id = v_academy_row.id
    AND r.status = 'confirmed'
    AND COALESCE(TRIM(r.student_name), '') = COALESCE(TRIM(v_student.name), '')
    AND normalize_phone_digits(r.guardian_phone) = v_phone_digits
  ORDER BY r.submitted_at DESC, r.updated_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'data', jsonb_build_object(
        'weekly_class_minutes', v_minutes,
        'registration_id', NULL,
        'registration_submitted_at', NULL,
        'matched', false
      )
    );
  END IF;

  SELECT ARRAY(
    SELECT jsonb_array_elements_text(
      COALESCE(v_registration.confirmed_slot_ids, v_registration.selected_slot_ids, '[]'::jsonb)
    )::uuid
  ) INTO v_slot_ids;

  SELECT COALESCE(cp.slot_interval_minutes, cp.slot_duration_minutes, 30)
  INTO v_interval_minutes
  FROM course_periods cp
  WHERE cp.id = v_registration.period_id;

  IF v_slot_ids IS NOT NULL AND array_length(v_slot_ids, 1) > 0 THEN
    SELECT
      COUNT(*) FILTER (WHERE day_of_week = 'mon'),
      COUNT(*) FILTER (WHERE day_of_week = 'tue'),
      COUNT(*) FILTER (WHERE day_of_week = 'wed'),
      COUNT(*) FILTER (WHERE day_of_week = 'thu'),
      COUNT(*) FILTER (WHERE day_of_week = 'fri')
    INTO v_mon_count, v_tue_count, v_wed_count, v_thu_count, v_fri_count
    FROM course_time_slots
    WHERE id = ANY(v_slot_ids);
  END IF;

  v_minutes := jsonb_build_object(
    'mon', CASE WHEN v_mon_count > 0 THEN v_mon_count * v_interval_minutes ELSE NULL END,
    'tue', CASE WHEN v_tue_count > 0 THEN v_tue_count * v_interval_minutes ELSE NULL END,
    'wed', CASE WHEN v_wed_count > 0 THEN v_wed_count * v_interval_minutes ELSE NULL END,
    'thu', CASE WHEN v_thu_count > 0 THEN v_thu_count * v_interval_minutes ELSE NULL END,
    'fri', CASE WHEN v_fri_count > 0 THEN v_fri_count * v_interval_minutes ELSE NULL END
  );

  RETURN jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'weekly_class_minutes', v_minutes,
      'registration_id', v_registration.id,
      'registration_submitted_at', v_registration.submitted_at,
      'matched', true
    )
  );
END;
$$;

-- 3) 학생 요일별 수업시간 저장 RPC (수동/재불러오기 공통)
CREATE OR REPLACE FUNCTION admin_update_student_weekly_minutes(
  p_student_id UUID,
  p_weekly_class_minutes JSONB,
  p_source TEXT DEFAULT 'manual'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_src TEXT := LOWER(COALESCE(p_source, 'manual'));
  v_norm JSONB;
  v_now TIMESTAMPTZ := NOW();
  v_student students%ROWTYPE;
BEGIN
  SELECT LOWER(COALESCE(role, '')) INTO v_role
  FROM profiles
  WHERE id = auth.uid();

  IF v_role NOT IN ('admin', 'super_admin') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INSUFFICIENT_PERMISSIONS'
    );
  END IF;

  IF v_src NOT IN ('manual', 'registration', 'none') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INVALID_SOURCE'
    );
  END IF;

  v_norm := jsonb_build_object(
    'mon', CASE WHEN (p_weekly_class_minutes ? 'mon') AND (p_weekly_class_minutes->>'mon') ~ '^\d+$' THEN (p_weekly_class_minutes->>'mon')::INT ELSE NULL END,
    'tue', CASE WHEN (p_weekly_class_minutes ? 'tue') AND (p_weekly_class_minutes->>'tue') ~ '^\d+$' THEN (p_weekly_class_minutes->>'tue')::INT ELSE NULL END,
    'wed', CASE WHEN (p_weekly_class_minutes ? 'wed') AND (p_weekly_class_minutes->>'wed') ~ '^\d+$' THEN (p_weekly_class_minutes->>'wed')::INT ELSE NULL END,
    'thu', CASE WHEN (p_weekly_class_minutes ? 'thu') AND (p_weekly_class_minutes->>'thu') ~ '^\d+$' THEN (p_weekly_class_minutes->>'thu')::INT ELSE NULL END,
    'fri', CASE WHEN (p_weekly_class_minutes ? 'fri') AND (p_weekly_class_minutes->>'fri') ~ '^\d+$' THEN (p_weekly_class_minutes->>'fri')::INT ELSE NULL END
  );

  IF EXISTS (
    SELECT 1
    FROM jsonb_each_text(v_norm)
    WHERE value IS NOT NULL
      AND value ~ '^\d+$'
      AND (value::INT < 0 OR value::INT > 600)
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INVALID_MINUTES_RANGE'
    );
  END IF;

  UPDATE students
  SET
    weekly_class_minutes = v_norm,
    weekly_class_minutes_source = v_src,
    weekly_class_minutes_synced_at = CASE WHEN v_src = 'registration' THEN v_now ELSE weekly_class_minutes_synced_at END,
    weekly_class_minutes_manual_updated_at = CASE WHEN v_src = 'manual' THEN v_now ELSE weekly_class_minutes_manual_updated_at END,
    updated_at = v_now
  WHERE id = p_student_id
    AND academy_id = auth.uid()
  RETURNING * INTO v_student;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'STUDENT_NOT_FOUND'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'data', row_to_json(v_student)::jsonb
  );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_get_student_registration_weekly_minutes(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_update_student_weekly_minutes(UUID, JSONB, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
