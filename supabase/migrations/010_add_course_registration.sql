-- =====================================================
-- 선착순 수강신청 시스템 테이블 생성
-- =====================================================

-- 1. 수강신청 기간 관리 테이블
CREATE TABLE IF NOT EXISTS course_periods (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  academy_id UUID REFERENCES academies(id) NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  open_datetime TIMESTAMPTZ NOT NULL,
  close_datetime TIMESTAMPTZ,
  slot_duration_minutes INTEGER DEFAULT 30,
  booking_duration_minutes INTEGER DEFAULT 60,
  default_capacity INTEGER DEFAULT 5,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 시간대 슬롯 테이블 (30분 단위)
CREATE TABLE IF NOT EXISTS course_time_slots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  period_id UUID REFERENCES course_periods(id) ON DELETE CASCADE NOT NULL,
  day_of_week TEXT NOT NULL CHECK (day_of_week IN ('mon', 'tue', 'wed', 'thu', 'fri')),
  start_time TEXT NOT NULL, -- HH:mm format
  end_time TEXT NOT NULL, -- HH:mm format
  capacity INTEGER DEFAULT 5,
  current_count INTEGER DEFAULT 0,
  is_available BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(period_id, day_of_week, start_time)
);

-- 3. 수강신청 내역 테이블
CREATE TABLE IF NOT EXISTS course_registrations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  period_id UUID REFERENCES course_periods(id) ON DELETE CASCADE NOT NULL,
  academy_id UUID NOT NULL,

  -- 학생 정보
  student_name TEXT NOT NULL,
  school_name TEXT NOT NULL,
  grade TEXT NOT NULL,
  guardian_phone TEXT NOT NULL,

  -- 상태: pending(처리중), confirmed(확정), waiting(대기), cancelled(취소)
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'waiting', 'cancelled')),

  -- 선택한 슬롯 ID 배열 (JSONB: [mon_slot_id, tue_slot_id, ...])
  selected_slot_ids JSONB NOT NULL,

  -- 확정된 슬롯 ID 배열
  confirmed_slot_ids JSONB,

  -- 신청 순서 (선착순)
  submission_order INTEGER,

  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 인덱스 생성
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_course_periods_academy ON course_periods(academy_id);
CREATE INDEX IF NOT EXISTS idx_course_periods_active ON course_periods(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_time_slots_period ON course_time_slots(period_id);
CREATE INDEX IF NOT EXISTS idx_time_slots_day_of_week ON course_time_slots(day_of_week);
CREATE INDEX IF NOT EXISTS idx_registrations_period ON course_registrations(period_id);
CREATE INDEX IF NOT EXISTS idx_registrations_academy ON course_registrations(academy_id);
CREATE INDEX IF NOT EXISTS idx_registrations_status ON course_registrations(status);
CREATE INDEX IF NOT EXISTS idx_registrations_phone ON course_registrations(guardian_phone);

-- =====================================================
-- RLS (Row Level Security) 정책
-- =====================================================
ALTER TABLE course_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_time_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_registrations ENABLE ROW LEVEL SECURITY;

-- course_periods 정책
CREATE POLICY "Anyone can view active periods"
  ON course_periods FOR SELECT USING (is_active = true);

CREATE POLICY "Owners can manage own periods"
  ON course_periods FOR ALL USING (
    academy_id IN (
      SELECT id FROM academies WHERE owner_id = auth.uid()
    )
  );

-- course_time_slots 정책
CREATE POLICY "Anyone can view time slots for active periods"
  ON course_time_slots FOR SELECT USING (
    period_id IN (
      SELECT id FROM course_periods WHERE is_active = true
    )
  );

CREATE POLICY "Owners can manage own time slots"
  ON course_time_slots FOR ALL USING (
    period_id IN (
      SELECT id FROM course_periods WHERE
        academy_id IN (SELECT id FROM academies WHERE owner_id = auth.uid())
    )
  );

-- course_registrations 정책
CREATE POLICY "Anyone can submit registration"
  ON course_registrations FOR INSERT WITH CHECK (true);

CREATE POLICY "Owners can view registrations"
  ON course_registrations FOR SELECT USING (
    academy_id IN (
      SELECT id FROM academies WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "Owners can update registrations"
  ON course_registrations FOR UPDATE USING (
    academy_id IN (
      SELECT id FROM academies WHERE owner_id = auth.uid()
    )
  );

-- =====================================================
-- 함수: 수강신청 제출 (선착순 처리)
-- =====================================================
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
  v_capacity INTEGER;
  v_current_count INTEGER;
  v_confirmed_slots JSONB := '[]'::jsonb;
  v_all_confirmed BOOLEAN := false;
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

  -- 신청 레코드 생성
  INSERT INTO course_registrations (
    period_id, academy_id, student_name, school_name, grade,
    guardian_phone, selected_slot_ids, status, submission_order
  )
  VALUES (
    p_period_id, p_academy_id, p_student_name, p_school_name,
    p_grade, p_guardian_phone, p_selected_slot_ids, v_status, v_order
  )
  RETURNING id INTO v_registration_id;

  -- 각 슬롯별 정원 체크 및 업데이트
  FOR v_slot_id IN
    SELECT jsonb_array_elements_text(p_selected_slot_ids)
  LOOP
    -- 슬롯 정보 조회 및 락
    SELECT capacity, current_count
    INTO v_capacity, v_current_count
    FROM course_time_slots
    WHERE id = v_slot_id::uuid
    FOR UPDATE;

    -- 정원 남아있으면 확정
    IF v_current_count < v_capacity THEN
      UPDATE course_time_slots
      SET current_count = current_count + 1
      WHERE id = v_slot_id::uuid;

      v_confirmed_slots := v_confirmed_slots || to_jsonb(v_slot_id);
    END IF;
  END LOOP;

  -- 모든 요일이 확정되었는지 확인
  IF jsonb_array_length(v_confirmed_slots) = 5 THEN
    v_all_confirmed := true;
    v_status := 'confirmed';
  ELSE
    v_status := 'waiting';
  END IF;

  -- 신청 상태 업데이트
  UPDATE course_registrations
  SET status = v_status,
      confirmed_slot_ids = v_confirmed_slots,
      updated_at = NOW()
  WHERE id = v_registration_id;

  -- 결과 반환
  RETURN jsonb_build_object(
    'success', true,
    'registration_id', v_registration_id,
    'status', v_status,
    'all_confirmed', v_all_confirmed,
    'confirmed_slots', v_confirmed_slots
  );
END;
$$;

-- =====================================================
-- 함수: 시간 슬롯 일괄 생성 (관리자용)
-- =====================================================
CREATE OR REPLACE FUNCTION create_time_slots_for_period(
  p_period_id UUID,
  p_start_hour INTEGER,
  p_end_hour INTEGER,
  p_capacity INTEGER DEFAULT 5
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_day TEXT;
  v_hour INTEGER;
  v_start_time TEXT;
  v_end_time TEXT;
  v_count INTEGER := 0;
BEGIN
  -- 요일별, 시간별 슬롯 생성
  FOREACH v_day IN ARRAY ARRAY['mon', 'tue', 'wed', 'thu', 'fri']
  LOOP
    FOR v_hour IN p_start_hour..p_end_hour - 1
    LOOP
      -- 시작 시간 (예: 14:00)
      v_start_time := LPAD(v_hour::TEXT, 2, '0') || ':00';

      -- 종료 시간 (예: 15:00 - 1시간 단위)
      v_end_time := LPAD((v_hour + 1)::TEXT, 2, '0') || ':00';

      -- 슬롯 삽입 (중복 무시)
      INSERT INTO course_time_slots (
        period_id, day_of_week, start_time, end_time, capacity
      )
      VALUES (
        p_period_id, v_day, v_start_time, v_end_time, p_capacity
      )
      ON CONFLICT (period_id, day_of_week, start_time) DO NOTHING;

      IF FOUND THEN
        v_count := v_count + 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'created_count', v_count
  );
END;
$$;

-- =====================================================
-- 함수: 신청 취소 (정원 반영)
-- =====================================================
CREATE OR REPLACE FUNCTION cancel_course_registration(
  p_registration_id UUID,
  p_academy_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_registration RECORD;
  v_slot_id TEXT;
BEGIN
  -- 신청 정보 조회
  SELECT * INTO v_registration
  FROM course_registrations
  WHERE id = p_registration_id AND academy_id = p_academy_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  IF v_registration.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'error', 'ALREADY_CANCELLED');
  END IF;

  -- 확정된 슬롯의 current_count 감소
  IF v_registration.confirmed_slot_ids IS NOT NULL THEN
    FOR v_slot_id IN
      SELECT jsonb_array_elements_text(v_registration.confirmed_slot_ids)
    LOOP
      UPDATE course_time_slots
      SET current_count = GREATEST(current_count - 1, 0)
      WHERE id = v_slot_id::uuid;
    END LOOP;
  END IF;

  -- 상태 변경
  UPDATE course_registrations
  SET status = 'cancelled', updated_at = NOW()
  WHERE id = p_registration_id;

  RETURN jsonb_build_object('success', true);
END;
$$;
