-- =====================================================
-- 032: admin_fcm_tokens 테이블에 last_used_at 컬럼 추가
-- =====================================================
-- 작업일: 2025-02-26
-- 목적: register_admin_fcm_token RPC에서 토큰 마지막 사용 시간 추적
-- =====================================================

ALTER TABLE admin_fcm_tokens
ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 기존 레코드의 경우 updated_at을 last_used_at으로 복사
UPDATE admin_fcm_tokens
SET last_used_at = updated_at
WHERE last_used_at IS NULL;

COMMENT ON COLUMN admin_fcm_tokens.last_used_at IS 'FCM 토큰이 마지막으로 성공적으로 사용된 시간';
