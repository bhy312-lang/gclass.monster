-- ============================================================================
-- 042_parent_claim_and_recipient_rpcs.sql
-- ============================================================================
-- Purpose: 자동연동, 수신자 조회, 관리자/학부모 연락처 관리 RPC
-- ============================================================================

CREATE OR REPLACE FUNCTION normalize_phone_digits(p_phone TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT regexp_replace(COALESCE(p_phone, ''), '\\D', '', 'g');
$$;

CREATE OR REPLACE FUNCTION is_admin_role(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM profiles
    WHERE id = p_user_id
      AND LOWER(COALESCE(role, '')) IN ('admin', 'super_admin')
  );
$$;

CREATE OR REPLACE FUNCTION can_parent_manage_student(p_parent_id UUID, p_student_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM student_guardian_links sgl
    WHERE sgl.student_id = p_student_id
      AND sgl.parent_id = p_parent_id
      AND sgl.is_active = true
  )
  OR EXISTS (
    SELECT 1
    FROM students s
    WHERE s.id = p_student_id
      AND s.parent_id = p_parent_id
  );
$$;

CREATE OR REPLACE FUNCTION parent_claim_students_by_phone(
  p_parent_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent_id UUID := COALESCE(p_parent_id, auth.uid());
  v_parent_phone_digits TEXT;
  v_parent_role TEXT;
  v_linked_count INTEGER := 0;
  v_linked_student_ids UUID[] := ARRAY[]::UUID[];
  v_conflict_candidates JSONB := '[]'::JSONB;
  v_row RECORD;
  v_scope_count INTEGER := 0;
BEGIN
  IF v_parent_id <> auth.uid() THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', '본인 계정만 자동연동할 수 있습니다',
      'error_code', 'FORBIDDEN'
    );
  END IF;

  SELECT LOWER(COALESCE(role, '')), normalize_phone_digits(phone)
    INTO v_parent_role, v_parent_phone_digits
  FROM profiles
  WHERE id = v_parent_id;

  IF v_parent_role IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', '프로필을 찾을 수 없습니다',
      'error_code', 'PROFILE_NOT_FOUND'
    );
  END IF;

  IF v_parent_role NOT IN ('parent', 'admin', 'super_admin') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', '학부모 계정이 아닙니다',
      'error_code', 'NOT_PARENT_ROLE',
      'current_role', v_parent_role
    );
  END IF;

  IF v_parent_phone_digits IS NULL OR v_parent_phone_digits = '' THEN
    RETURN jsonb_build_object(
      'success', true,
      'linked_count', 0,
      'linked_student_ids', '[]'::jsonb,
      'conflict_candidates', '[]'::jsonb,
      'no_match_reason', 'PARENT_PHONE_EMPTY'
    );
  END IF;

  SELECT COUNT(*) INTO v_scope_count
  FROM parent_academy_links pal
  JOIN academies a ON a.id = pal.academy_id
  WHERE pal.parent_id = v_parent_id
    AND pal.status = 'approved';

  FOR v_row IN
    SELECT s.id, s.name, s.parent_id
    FROM students s
    WHERE s.approval_status = 'approved'
      AND normalize_phone_digits(s.full_phone) = v_parent_phone_digits
      AND (
        v_scope_count = 0
        OR EXISTS (
          SELECT 1
          FROM parent_academy_links pal
          JOIN academies a ON a.id = pal.academy_id
          WHERE pal.parent_id = v_parent_id
            AND pal.status = 'approved'
            AND (s.academy_id = pal.academy_id OR s.academy_id = a.owner_id)
        )
      )
  LOOP
    IF v_row.parent_id IS NOT NULL AND v_row.parent_id <> v_parent_id THEN
      v_conflict_candidates := v_conflict_candidates || jsonb_build_object(
        'student_id', v_row.id,
        'student_name', v_row.name,
        'existing_parent_id', v_row.parent_id
      );
      CONTINUE;
    END IF;

    IF v_row.parent_id IS NULL THEN
      UPDATE students
      SET parent_id = v_parent_id,
          updated_at = NOW()
      WHERE id = v_row.id;
    END IF;

    INSERT INTO student_guardian_links (
      student_id,
      parent_id,
      relationship,
      is_primary,
      receive_check_in,
      receive_check_out,
      is_active,
      linked_by
    ) VALUES (
      v_row.id,
      v_parent_id,
      CASE WHEN v_row.parent_id IS NULL OR v_row.parent_id = v_parent_id THEN 'primary' ELSE 'guardian' END,
      (v_row.parent_id IS NULL OR v_row.parent_id = v_parent_id),
      true,
      true,
      true,
      v_parent_id
    )
    ON CONFLICT (student_id, parent_id)
    DO UPDATE SET
      is_active = true,
      receive_check_in = EXCLUDED.receive_check_in,
      receive_check_out = EXCLUDED.receive_check_out,
      updated_at = NOW();

    v_linked_count := v_linked_count + 1;
    v_linked_student_ids := array_append(v_linked_student_ids, v_row.id);
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'linked_count', v_linked_count,
    'linked_student_ids', to_jsonb(v_linked_student_ids),
    'conflict_candidates', v_conflict_candidates,
    'no_match_reason', CASE WHEN v_linked_count = 0 AND jsonb_array_length(v_conflict_candidates) = 0 THEN 'NO_MATCH' ELSE NULL END
  );
END;
$$;

CREATE OR REPLACE FUNCTION admin_add_student_guardian_link(
  p_student_id UUID,
  p_parent_id UUID,
  p_relationship TEXT DEFAULT 'guardian',
  p_receive_check_in BOOLEAN DEFAULT true,
  p_receive_check_out BOOLEAN DEFAULT true,
  p_is_primary BOOLEAN DEFAULT false
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent_role TEXT;
BEGIN
  IF NOT is_admin_role(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', '관리자 권한이 필요합니다', 'error_code', 'INSUFFICIENT_PERMISSIONS');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM students WHERE id = p_student_id AND academy_id = auth.uid()
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', '학생 접근 권한이 없습니다', 'error_code', 'STUDENT_SCOPE_FORBIDDEN');
  END IF;

  SELECT LOWER(COALESCE(role, '')) INTO v_parent_role
  FROM profiles
  WHERE id = p_parent_id;

  IF v_parent_role NOT IN ('parent', 'admin', 'super_admin') THEN
    RETURN jsonb_build_object('success', false, 'error', '보호자 계정이 아닙니다', 'error_code', 'NOT_PARENT_ACCOUNT');
  END IF;

  IF p_is_primary THEN
    UPDATE student_guardian_links
    SET is_primary = false,
        updated_at = NOW()
    WHERE student_id = p_student_id;

    UPDATE students
    SET parent_id = p_parent_id,
        updated_at = NOW()
    WHERE id = p_student_id;
  END IF;

  INSERT INTO student_guardian_links (
    student_id, parent_id, relationship, is_primary,
    receive_check_in, receive_check_out, is_active, linked_by
  ) VALUES (
    p_student_id, p_parent_id, COALESCE(NULLIF(BTRIM(p_relationship), ''), 'guardian'), p_is_primary,
    p_receive_check_in, p_receive_check_out, true, auth.uid()
  )
  ON CONFLICT (student_id, parent_id)
  DO UPDATE SET
    relationship = EXCLUDED.relationship,
    is_primary = EXCLUDED.is_primary,
    receive_check_in = EXCLUDED.receive_check_in,
    receive_check_out = EXCLUDED.receive_check_out,
    is_active = true,
    updated_at = NOW();

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION admin_update_student_guardian_link(
  p_student_id UUID,
  p_parent_id UUID,
  p_relationship TEXT DEFAULT 'guardian',
  p_receive_check_in BOOLEAN DEFAULT true,
  p_receive_check_out BOOLEAN DEFAULT true,
  p_is_primary BOOLEAN DEFAULT false,
  p_is_active BOOLEAN DEFAULT true
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin_role(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', '관리자 권한이 필요합니다', 'error_code', 'INSUFFICIENT_PERMISSIONS');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM students WHERE id = p_student_id AND academy_id = auth.uid()
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', '학생 접근 권한이 없습니다', 'error_code', 'STUDENT_SCOPE_FORBIDDEN');
  END IF;

  IF p_is_primary THEN
    UPDATE student_guardian_links
    SET is_primary = false,
        updated_at = NOW()
    WHERE student_id = p_student_id;

    UPDATE students
    SET parent_id = p_parent_id,
        updated_at = NOW()
    WHERE id = p_student_id;
  END IF;

  UPDATE student_guardian_links
  SET relationship = COALESCE(NULLIF(BTRIM(p_relationship), ''), relationship),
      receive_check_in = p_receive_check_in,
      receive_check_out = p_receive_check_out,
      is_primary = p_is_primary,
      is_active = p_is_active,
      updated_at = NOW()
  WHERE student_id = p_student_id
    AND parent_id = p_parent_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '보호자 링크를 찾을 수 없습니다', 'error_code', 'LINK_NOT_FOUND');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION admin_remove_student_guardian_link(
  p_student_id UUID,
  p_parent_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin_role(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', '관리자 권한이 필요합니다', 'error_code', 'INSUFFICIENT_PERMISSIONS');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM students WHERE id = p_student_id AND academy_id = auth.uid()
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', '학생 접근 권한이 없습니다', 'error_code', 'STUDENT_SCOPE_FORBIDDEN');
  END IF;

  UPDATE student_guardian_links
  SET is_active = false,
      is_primary = false,
      updated_at = NOW()
  WHERE student_id = p_student_id
    AND parent_id = p_parent_id;

  UPDATE students
  SET parent_id = NULL,
      updated_at = NOW()
  WHERE id = p_student_id
    AND parent_id = p_parent_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION admin_add_student_notification_contact(
  p_student_id UUID,
  p_contact_name TEXT,
  p_relationship TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_receive_check_in BOOLEAN DEFAULT false,
  p_receive_check_out BOOLEAN DEFAULT false
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_id UUID;
BEGIN
  IF NOT is_admin_role(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', '관리자 권한이 필요합니다', 'error_code', 'INSUFFICIENT_PERMISSIONS');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM students WHERE id = p_student_id AND academy_id = auth.uid()
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', '학생 접근 권한이 없습니다', 'error_code', 'STUDENT_SCOPE_FORBIDDEN');
  END IF;

  IF p_phone IS NULL OR normalize_phone_digits(p_phone) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', '전화번호는 필수입니다', 'error_code', 'PHONE_REQUIRED');
  END IF;

  INSERT INTO student_notification_contacts (
    student_id, contact_name, relationship, phone, phone_digits, phone_last4,
    receive_check_in, receive_check_out, is_active, created_by
  ) VALUES (
    p_student_id,
    COALESCE(NULLIF(BTRIM(p_contact_name), ''), '연락처'),
    p_relationship,
    p_phone,
    normalize_phone_digits(p_phone),
    CASE WHEN length(normalize_phone_digits(p_phone)) >= 4 THEN right(normalize_phone_digits(p_phone), 4) ELSE NULL END,
    p_receive_check_in,
    p_receive_check_out,
    true,
    auth.uid()
  ) RETURNING id INTO v_new_id;

  RETURN jsonb_build_object('success', true, 'id', v_new_id);
END;
$$;

CREATE OR REPLACE FUNCTION admin_update_student_notification_contact(
  p_contact_id UUID,
  p_contact_name TEXT DEFAULT NULL,
  p_relationship TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_receive_check_in BOOLEAN DEFAULT false,
  p_receive_check_out BOOLEAN DEFAULT false,
  p_is_active BOOLEAN DEFAULT true
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id UUID;
BEGIN
  IF NOT is_admin_role(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', '관리자 권한이 필요합니다', 'error_code', 'INSUFFICIENT_PERMISSIONS');
  END IF;

  SELECT student_id INTO v_student_id
  FROM student_notification_contacts
  WHERE id = p_contact_id;

  IF v_student_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '연락처를 찾을 수 없습니다', 'error_code', 'CONTACT_NOT_FOUND');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM students WHERE id = v_student_id AND academy_id = auth.uid()
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', '학생 접근 권한이 없습니다', 'error_code', 'STUDENT_SCOPE_FORBIDDEN');
  END IF;

  UPDATE student_notification_contacts
  SET contact_name = COALESCE(NULLIF(BTRIM(p_contact_name), ''), contact_name),
      relationship = COALESCE(p_relationship, relationship),
      phone = COALESCE(NULLIF(BTRIM(p_phone), ''), phone),
      receive_check_in = p_receive_check_in,
      receive_check_out = p_receive_check_out,
      is_active = p_is_active,
      updated_at = NOW()
  WHERE id = p_contact_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION admin_remove_student_notification_contact(
  p_contact_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id UUID;
BEGIN
  IF NOT is_admin_role(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', '관리자 권한이 필요합니다', 'error_code', 'INSUFFICIENT_PERMISSIONS');
  END IF;

  SELECT student_id INTO v_student_id
  FROM student_notification_contacts
  WHERE id = p_contact_id;

  IF v_student_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '연락처를 찾을 수 없습니다', 'error_code', 'CONTACT_NOT_FOUND');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM students WHERE id = v_student_id AND academy_id = auth.uid()
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', '학생 접근 권한이 없습니다', 'error_code', 'STUDENT_SCOPE_FORBIDDEN');
  END IF;

  DELETE FROM student_notification_contacts
  WHERE id = p_contact_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION parent_add_student_notification_contact(
  p_student_id UUID,
  p_contact_name TEXT,
  p_relationship TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_receive_check_in BOOLEAN DEFAULT false,
  p_receive_check_out BOOLEAN DEFAULT false
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_id UUID;
BEGIN
  IF NOT can_parent_manage_student(auth.uid(), p_student_id) THEN
    RETURN jsonb_build_object('success', false, 'error', '학생 접근 권한이 없습니다', 'error_code', 'STUDENT_SCOPE_FORBIDDEN');
  END IF;

  IF p_phone IS NULL OR normalize_phone_digits(p_phone) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', '전화번호는 필수입니다', 'error_code', 'PHONE_REQUIRED');
  END IF;

  INSERT INTO student_notification_contacts (
    student_id, contact_name, relationship, phone, phone_digits, phone_last4,
    receive_check_in, receive_check_out, is_active, created_by
  ) VALUES (
    p_student_id,
    COALESCE(NULLIF(BTRIM(p_contact_name), ''), '연락처'),
    p_relationship,
    p_phone,
    normalize_phone_digits(p_phone),
    CASE WHEN length(normalize_phone_digits(p_phone)) >= 4 THEN right(normalize_phone_digits(p_phone), 4) ELSE NULL END,
    p_receive_check_in,
    p_receive_check_out,
    true,
    auth.uid()
  ) RETURNING id INTO v_new_id;

  RETURN jsonb_build_object('success', true, 'id', v_new_id);
END;
$$;

CREATE OR REPLACE FUNCTION parent_update_student_notification_contact(
  p_contact_id UUID,
  p_contact_name TEXT DEFAULT NULL,
  p_relationship TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_receive_check_in BOOLEAN DEFAULT false,
  p_receive_check_out BOOLEAN DEFAULT false,
  p_is_active BOOLEAN DEFAULT true
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id UUID;
BEGIN
  SELECT student_id INTO v_student_id
  FROM student_notification_contacts
  WHERE id = p_contact_id;

  IF v_student_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '연락처를 찾을 수 없습니다', 'error_code', 'CONTACT_NOT_FOUND');
  END IF;

  IF NOT can_parent_manage_student(auth.uid(), v_student_id) THEN
    RETURN jsonb_build_object('success', false, 'error', '학생 접근 권한이 없습니다', 'error_code', 'STUDENT_SCOPE_FORBIDDEN');
  END IF;

  UPDATE student_notification_contacts
  SET contact_name = COALESCE(NULLIF(BTRIM(p_contact_name), ''), contact_name),
      relationship = COALESCE(p_relationship, relationship),
      phone = COALESCE(NULLIF(BTRIM(p_phone), ''), phone),
      receive_check_in = p_receive_check_in,
      receive_check_out = p_receive_check_out,
      is_active = p_is_active,
      updated_at = NOW()
  WHERE id = p_contact_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION parent_remove_student_notification_contact(
  p_contact_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id UUID;
BEGIN
  SELECT student_id INTO v_student_id
  FROM student_notification_contacts
  WHERE id = p_contact_id;

  IF v_student_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '연락처를 찾을 수 없습니다', 'error_code', 'CONTACT_NOT_FOUND');
  END IF;

  IF NOT can_parent_manage_student(auth.uid(), v_student_id) THEN
    RETURN jsonb_build_object('success', false, 'error', '학생 접근 권한이 없습니다', 'error_code', 'STUDENT_SCOPE_FORBIDDEN');
  END IF;

  DELETE FROM student_notification_contacts
  WHERE id = p_contact_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION get_student_notification_recipients(
  p_student_id UUID,
  p_event_type TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_type TEXT := LOWER(COALESCE(p_event_type, 'check_in'));
  v_student_parent_id UUID;
  v_accounts JSONB := '[]'::JSONB;
  v_phones JSONB := '[]'::JSONB;
BEGIN
  IF v_event_type NOT IN ('check_in', 'check_out') THEN
    RETURN jsonb_build_object('success', false, 'error', '지원하지 않는 이벤트 타입', 'error_code', 'INVALID_EVENT_TYPE');
  END IF;

  IF NOT (
    is_admin_role(auth.uid())
    AND EXISTS (SELECT 1 FROM students s WHERE s.id = p_student_id AND s.academy_id = auth.uid())
  )
  AND NOT can_parent_manage_student(auth.uid(), p_student_id)
  THEN
    RETURN jsonb_build_object('success', false, 'error', '접근 권한이 없습니다', 'error_code', 'FORBIDDEN');
  END IF;

  SELECT parent_id INTO v_student_parent_id
  FROM students
  WHERE id = p_student_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'parent_id', sgl.parent_id,
    'channels', jsonb_build_array('web_push', 'fcm'),
    'receive_check_in', sgl.receive_check_in,
    'receive_check_out', sgl.receive_check_out,
    'is_primary', sgl.is_primary
  )), '[]'::JSONB)
  INTO v_accounts
  FROM student_guardian_links sgl
  WHERE sgl.student_id = p_student_id
    AND sgl.is_active = true
    AND (
      (v_event_type = 'check_in' AND sgl.receive_check_in = true)
      OR (v_event_type = 'check_out' AND sgl.receive_check_out = true)
    );

  IF jsonb_array_length(v_accounts) = 0 AND v_student_parent_id IS NOT NULL THEN
    v_accounts := jsonb_build_array(jsonb_build_object(
      'parent_id', v_student_parent_id,
      'channels', jsonb_build_array('web_push', 'fcm'),
      'receive_check_in', true,
      'receive_check_out', true,
      'is_primary', true,
      'legacy_parent_id', true
    ));
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'contact_id', snc.id,
    'phone', snc.phone,
    'phone_digits', snc.phone_digits,
    'contact_name', snc.contact_name,
    'relationship', snc.relationship,
    'receive_check_in', snc.receive_check_in,
    'receive_check_out', snc.receive_check_out
  )), '[]'::JSONB)
  INTO v_phones
  FROM student_notification_contacts snc
  WHERE snc.student_id = p_student_id
    AND snc.is_active = true
    AND (
      (v_event_type = 'check_in' AND snc.receive_check_in = true)
      OR (v_event_type = 'check_out' AND snc.receive_check_out = true)
    );

  RETURN jsonb_build_object(
    'success', true,
    'student_id', p_student_id,
    'event_type', v_event_type,
    'account_recipients', v_accounts,
    'phone_recipients', v_phones
  );
END;
$$;

CREATE OR REPLACE FUNCTION enqueue_student_phone_notifications(
  p_student_id UUID,
  p_event_type TEXT,
  p_payload JSONB DEFAULT '{}'::JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
  v_phone JSONB;
  v_count INTEGER := 0;
BEGIN
  v_result := get_student_notification_recipients(p_student_id, p_event_type);

  IF COALESCE((v_result->>'success')::BOOLEAN, false) = false THEN
    RETURN v_result;
  END IF;

  FOR v_phone IN SELECT * FROM jsonb_array_elements(COALESCE(v_result->'phone_recipients', '[]'::jsonb))
  LOOP
    INSERT INTO notification_phone_queue (
      student_id,
      contact_id,
      event_type,
      payload,
      status
    ) VALUES (
      p_student_id,
      NULLIF(v_phone->>'contact_id', '')::UUID,
      LOWER(p_event_type),
      jsonb_build_object(
        'contact', v_phone,
        'event', LOWER(p_event_type),
        'context', COALESCE(p_payload, '{}'::jsonb)
      ),
      'pending'
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'queued_count', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION parent_claim_students_by_phone TO authenticated;
GRANT EXECUTE ON FUNCTION admin_add_student_guardian_link TO authenticated;
GRANT EXECUTE ON FUNCTION admin_update_student_guardian_link TO authenticated;
GRANT EXECUTE ON FUNCTION admin_remove_student_guardian_link TO authenticated;
GRANT EXECUTE ON FUNCTION admin_add_student_notification_contact TO authenticated;
GRANT EXECUTE ON FUNCTION admin_update_student_notification_contact TO authenticated;
GRANT EXECUTE ON FUNCTION admin_remove_student_notification_contact TO authenticated;
GRANT EXECUTE ON FUNCTION parent_add_student_notification_contact TO authenticated;
GRANT EXECUTE ON FUNCTION parent_update_student_notification_contact TO authenticated;
GRANT EXECUTE ON FUNCTION parent_remove_student_notification_contact TO authenticated;
GRANT EXECUTE ON FUNCTION get_student_notification_recipients TO authenticated;
GRANT EXECUTE ON FUNCTION enqueue_student_phone_notifications TO authenticated;

NOTIFY pgrst, 'reload schema';
