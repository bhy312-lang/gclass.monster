-- =====================================================
-- 033: fcm_message_recipients 스키마 수정 (Admin 지원)
-- 작업일: 2026-02-26
-- 목적:
--   1. admin_fcm_token_id 컬럼 추가
--   2. 다중 기기 지원을 위한 Partial Unique Index 2개
--   3. parent/admin 토큰 FK 중 하나만 NOT NULL 체크
-- =====================================================

-- 1) 기존 FK 제거
ALTER TABLE fcm_message_recipients
DROP CONSTRAINT IF EXISTS fcm_message_recipients_message_id_fkey;

ALTER TABLE fcm_message_recipients
DROP CONSTRAINT IF EXISTS fcm_message_recipients_fcm_token_id_fkey;

-- 2) message_id는 UUID 유지 (fcm_messages.id 참조)
-- 별도 타입 변경 없음 - 스키마는 정상임, 함수를 수정함

-- 3) fcm_token_id NULL 허용 확인
ALTER TABLE fcm_message_recipients
ALTER COLUMN fcm_token_id DROP NOT NULL;

-- 4) 기존 UNIQUE 제약조건 제거
ALTER TABLE fcm_message_recipients
DROP CONSTRAINT IF EXISTS fcm_message_recipients_message_id_recipient_id_key;

-- 5) admin_fcm_token_id 컬럼 추가
ALTER TABLE fcm_message_recipients
ADD COLUMN admin_fcm_token_id UUID REFERENCES admin_fcm_tokens(id) ON DELETE SET NULL;

-- 6) Partial Unique Index 2개 (다중 기기 지원, NULL 안전)
DROP INDEX IF EXISTS idx_fcm_recipients_parent_unique;
CREATE UNIQUE INDEX idx_fcm_recipients_parent_unique
ON fcm_message_recipients(message_id, recipient_id, fcm_token_id)
WHERE fcm_token_id IS NOT NULL;

DROP INDEX IF EXISTS idx_fcm_recipients_admin_unique;
CREATE UNIQUE INDEX idx_fcm_recipients_admin_unique
ON fcm_message_recipients(message_id, recipient_id, admin_fcm_token_id)
WHERE admin_fcm_token_id IS NOT NULL;

-- 7) CHECK 제약조건: parent/admin 토큰 FK 중 정확히 하나만 NOT NULL
ALTER TABLE fcm_message_recipients
ADD CONSTRAINT fcm_message_recipients_check_token
CHECK (
  (fcm_token_id IS NOT NULL AND admin_fcm_token_id IS NULL) OR  -- Parent
  (fcm_token_id IS NULL AND admin_fcm_token_id IS NOT NULL) OR  -- Admin
  (fcm_token_id IS NULL AND admin_fcm_token_id IS NULL)         -- Token 없는 경우
);

-- 8) admin_fcm_token_id 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_fcm_recipients_admin_token
ON fcm_message_recipients(admin_fcm_token_id);

-- 코멘트 추가
COMMENT ON COLUMN fcm_message_recipients.admin_fcm_token_id IS 'Admin FCM 토큰 ID (parent일 때는 NULL)';
COMMENT ON CONSTRAINT fcm_message_recipients_check_token ON fcm_message_recipients IS
  'parent_fcm_token_id와 admin_fcm_token_id 중 하나만 설정 가능';
