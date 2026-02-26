-- =====================================================
-- 030: admin_fcm_tokens 테이블에 is_active 컬럼 추가
-- =====================================================
-- 작업일: 2026-02-25
-- 목적: fcm-send-notification Edge Function이 활성 토큰만 조회하도록 지원
-- =====================================================

ALTER TABLE admin_fcm_tokens
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- 기존 토큰은 모두 활성 상태로 설정
UPDATE admin_fcm_tokens
SET is_active = true
WHERE is_active IS NULL;

-- 인덱스 추가 (성능 최적화)
CREATE INDEX IF NOT EXISTS idx_admin_fcm_tokens_active
ON admin_fcm_tokens(admin_id, is_active)
WHERE is_active = true;
