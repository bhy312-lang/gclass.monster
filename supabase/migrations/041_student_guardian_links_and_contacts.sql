-- ============================================================================
-- 041_student_guardian_links_and_contacts.sql
-- ============================================================================
-- Purpose: 학생별 다중 보호자 링크 + 전화번호-only 알림 연락처 + 큐 테이블 도입
-- ============================================================================

-- 1) 계정 기반 보호자 링크
CREATE TABLE IF NOT EXISTS student_guardian_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  parent_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  relationship TEXT NOT NULL DEFAULT 'guardian',
  is_primary BOOLEAN NOT NULL DEFAULT false,
  receive_check_in BOOLEAN NOT NULL DEFAULT true,
  receive_check_out BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  linked_by UUID NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(student_id, parent_id)
);

CREATE INDEX IF NOT EXISTS idx_student_guardian_links_student_id
  ON student_guardian_links(student_id);

CREATE INDEX IF NOT EXISTS idx_student_guardian_links_parent_id
  ON student_guardian_links(parent_id);

CREATE INDEX IF NOT EXISTS idx_student_guardian_links_active
  ON student_guardian_links(student_id, is_active)
  WHERE is_active = true;

-- 2) 전화번호-only 알림 연락처
CREATE TABLE IF NOT EXISTS student_notification_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  contact_name TEXT NOT NULL,
  relationship TEXT NULL,
  phone TEXT NOT NULL,
  phone_digits TEXT NOT NULL,
  phone_last4 TEXT NULL,
  receive_check_in BOOLEAN NOT NULL DEFAULT false,
  receive_check_out BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_notification_contacts_student_id
  ON student_notification_contacts(student_id);

CREATE INDEX IF NOT EXISTS idx_student_notification_contacts_phone_digits
  ON student_notification_contacts(phone_digits);

CREATE INDEX IF NOT EXISTS idx_student_notification_contacts_active
  ON student_notification_contacts(student_id, is_active)
  WHERE is_active = true;

-- 3) 전화번호-only 발송 대기 큐
CREATE TABLE IF NOT EXISTS notification_phone_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  contact_id UUID NULL REFERENCES student_notification_contacts(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('check_in', 'check_out')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ NULL,
  error_message TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_notification_phone_queue_status
  ON notification_phone_queue(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_phone_queue_student_id
  ON notification_phone_queue(student_id, created_at DESC);

-- 4) updated_at 트리거
CREATE OR REPLACE FUNCTION set_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_student_guardian_links_updated_at ON student_guardian_links;
CREATE TRIGGER trg_student_guardian_links_updated_at
  BEFORE UPDATE ON student_guardian_links
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at_column();

DROP TRIGGER IF EXISTS trg_student_notification_contacts_updated_at ON student_notification_contacts;
CREATE TRIGGER trg_student_notification_contacts_updated_at
  BEFORE UPDATE ON student_notification_contacts
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at_column();

-- 5) phone_digits/last4 자동 정규화
CREATE OR REPLACE FUNCTION normalize_student_notification_contact_phone()
RETURNS TRIGGER AS $$
DECLARE
  v_digits TEXT;
BEGIN
  v_digits := regexp_replace(COALESCE(NEW.phone, ''), '\\D', '', 'g');
  NEW.phone_digits := v_digits;
  NEW.phone_last4 := CASE WHEN length(v_digits) >= 4 THEN right(v_digits, 4) ELSE NULL END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_normalize_student_notification_contact_phone ON student_notification_contacts;
CREATE TRIGGER trg_normalize_student_notification_contact_phone
  BEFORE INSERT OR UPDATE ON student_notification_contacts
  FOR EACH ROW
  EXECUTE FUNCTION normalize_student_notification_contact_phone();

-- 6) students.parent_id <-> student_guardian_links.is_primary 동기화
CREATE OR REPLACE FUNCTION sync_student_primary_guardian_link()
RETURNS TRIGGER AS $$
BEGIN
  -- parent_id 변경 시 기존 primary 해제
  UPDATE student_guardian_links
  SET is_primary = false, updated_at = NOW()
  WHERE student_id = NEW.id AND is_primary = true;

  -- parent_id 존재 시 primary 링크 upsert
  IF NEW.parent_id IS NOT NULL THEN
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
      NEW.id,
      NEW.parent_id,
      'primary',
      true,
      true,
      true,
      true,
      auth.uid()
    )
    ON CONFLICT (student_id, parent_id)
    DO UPDATE SET
      is_primary = true,
      is_active = true,
      updated_at = NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_student_primary_guardian_link ON students;
CREATE TRIGGER trg_sync_student_primary_guardian_link
  AFTER INSERT OR UPDATE OF parent_id ON students
  FOR EACH ROW
  EXECUTE FUNCTION sync_student_primary_guardian_link();

-- 7) RLS
ALTER TABLE student_guardian_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_notification_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_phone_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Guardian links admin academy scope" ON student_guardian_links;
CREATE POLICY "Guardian links admin academy scope"
  ON student_guardian_links
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM students s
      JOIN profiles p ON p.id = auth.uid()
      WHERE s.id = student_guardian_links.student_id
        AND s.academy_id = auth.uid()
        AND LOWER(COALESCE(p.role, '')) IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM students s
      JOIN profiles p ON p.id = auth.uid()
      WHERE s.id = student_guardian_links.student_id
        AND s.academy_id = auth.uid()
        AND LOWER(COALESCE(p.role, '')) IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "Guardian links parent own" ON student_guardian_links;
CREATE POLICY "Guardian links parent own"
  ON student_guardian_links
  FOR SELECT
  USING (parent_id = auth.uid());

DROP POLICY IF EXISTS "Notification contacts admin academy scope" ON student_notification_contacts;
CREATE POLICY "Notification contacts admin academy scope"
  ON student_notification_contacts
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM students s
      JOIN profiles p ON p.id = auth.uid()
      WHERE s.id = student_notification_contacts.student_id
        AND s.academy_id = auth.uid()
        AND LOWER(COALESCE(p.role, '')) IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM students s
      JOIN profiles p ON p.id = auth.uid()
      WHERE s.id = student_notification_contacts.student_id
        AND s.academy_id = auth.uid()
        AND LOWER(COALESCE(p.role, '')) IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "Notification contacts parent linked student" ON student_notification_contacts;
CREATE POLICY "Notification contacts parent linked student"
  ON student_notification_contacts
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM student_guardian_links sgl
      WHERE sgl.student_id = student_notification_contacts.student_id
        AND sgl.parent_id = auth.uid()
        AND sgl.is_active = true
    )
    OR EXISTS (
      SELECT 1
      FROM students s
      WHERE s.id = student_notification_contacts.student_id
        AND s.parent_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM student_guardian_links sgl
      WHERE sgl.student_id = student_notification_contacts.student_id
        AND sgl.parent_id = auth.uid()
        AND sgl.is_active = true
    )
    OR EXISTS (
      SELECT 1
      FROM students s
      WHERE s.id = student_notification_contacts.student_id
        AND s.parent_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Phone queue admin academy scope" ON notification_phone_queue;
CREATE POLICY "Phone queue admin academy scope"
  ON notification_phone_queue
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM students s
      JOIN profiles p ON p.id = auth.uid()
      WHERE s.id = notification_phone_queue.student_id
        AND s.academy_id = auth.uid()
        AND LOWER(COALESCE(p.role, '')) IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "Phone queue service role insert" ON notification_phone_queue;
CREATE POLICY "Phone queue service role insert"
  ON notification_phone_queue
  FOR INSERT
  WITH CHECK (auth.role() IN ('authenticated', 'service_role'));

COMMENT ON TABLE student_guardian_links IS '학생-보호자(계정) 다대다 링크 및 학생별 알림 토글';
COMMENT ON TABLE student_notification_contacts IS '계정 없이 전화번호로만 등록하는 학생별 알림 수신 연락처';
COMMENT ON TABLE notification_phone_queue IS '전화번호-only 수신자 발송 대기 큐 (실발송 연동 전 단계)';

-- PostgREST 스키마 캐시 갱신
NOTIFY pgrst, 'reload schema';
