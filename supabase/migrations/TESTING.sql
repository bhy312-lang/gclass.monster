-- =====================================================
-- FCM 푸시 테스트 쿼리
-- 실행일: 2025-02-26
-- 목적: FCM 푸시 문제 디버깅 및 QA 검증용 SQL 쿼리 모음
-- =====================================================

-- =====================================================
-- 1. 관리자 토큰 확인
-- 용도: 특정 관리자의 FCM 토큰 등록 상태 확인
-- =====================================================
SELECT
    admin_id,
    is_active,
    LEFT(fcm_token, 12) as token_preview,
    device_name,
    last_used_at,
    updated_at
FROM admin_fcm_tokens
WHERE admin_id = '<관리자 auth.uid()>'  -- <-- 관리자 UUID로 교체
ORDER BY updated_at DESC;

-- 전체 활성 토큰 현황
SELECT
    p.academy_name,
    COUNT(aft.id) as active_token_count
FROM profiles p
LEFT JOIN admin_fcm_tokens aft ON aft.admin_id = p.id AND aft.is_active = true
WHERE p.role = 'Admin'
GROUP BY p.id, p.academy_name
ORDER BY active_token_count DESC;

-- =====================================================
-- 2. 최근 fcm_messages 실패 코드 확인
-- 용도: 학부모 가입 신청 푸시 전송 결과 확인
-- =====================================================
SELECT
    created_at,
    message_type,
    target_type,
    target_id,
    status,
    error_code,
    error_message
FROM fcm_messages
WHERE message_type = 'new_parent_registration'
ORDER BY created_at DESC
LIMIT 10;

-- =====================================================
-- 3. NO_ACTIVE_TOKEN 비율 확인
-- 용도: 토큰 등록 문제로 인한 실패 비율 파악
-- =====================================================
SELECT
    error_code,
    COUNT(*) as count,
    ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 1) as percentage
FROM fcm_messages
WHERE created_at > NOW() - INTERVAL '7 days'
  AND message_type = 'new_parent_registration'
GROUP BY error_code
ORDER BY count DESC;

-- =====================================================
-- 4. 특정 메시지의 수신자 확인
-- 용도: 메시지가 어떤 토큰으로 전송되었는지 추적
-- =====================================================
SELECT
    fmr.message_id,
    fmr.recipient_id,
    fmr.fcm_token_id,
    fmr.status as recipient_status,
    fmr.sent_at,
    fmr.failed_at,
    fmr.error_code,
    fmr.delivery_attempts,
    aft.is_active,
    LEFT(aft.fcm_token, 12) as token_preview
FROM fcm_message_recipients fmr
LEFT JOIN admin_fcm_tokens aft ON aft.id = fmr.fcm_token_id
WHERE fmr.message_id = '<message_id>'  -- <-- 메시지 UUID로 교체
ORDER BY fmr.created_at;

-- =====================================================
-- 5. 비활성 토큰 확인
-- 용도: 비활성화된 토큰과 원인 파악
-- =====================================================
SELECT
    admin_id,
    LEFT(fcm_token, 12) as token_preview,
    is_active,
    device_name,
    last_used_at,
    updated_at,
    created_at
FROM admin_fcm_tokens
WHERE is_active = false
ORDER BY updated_at DESC
LIMIT 20;

-- =====================================================
-- 6. 토큰 중복 확인
-- 용도: 같은 토큰이 여러 admin에 등록된 문제 확인
-- =====================================================
SELECT
    fcm_token,
    COUNT(*) as count,
    ARRAY_AGG(admin_id) as admin_ids,
    ARRAY_AGG(is_active) as active_statuses
FROM admin_fcm_tokens
GROUP BY fcm_token
HAVING COUNT(*) > 1
ORDER BY count DESC;

-- =====================================================
-- 7. 최근 1시간 동안의 푸시 전송 통계
-- 용도: 실시간 모니터링
-- =====================================================
SELECT
    status,
    COUNT(*) as count
FROM fcm_messages
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY status;

-- =====================================================
-- 8. 특정 학원의 푸시 수신 가능 여부
-- 용도: 학원별 관리자 토큰 상태 확인
-- =====================================================
SELECT
    p.id as admin_id,
    p.academy_name,
    COUNT(aft.id) as active_token_count,
    STRING_AGG(CASE WHEN aft.is_active THEN 'ACTIVE' ELSE 'INACTIVE' END, ', ') as token_statuses
FROM profiles p
LEFT JOIN admin_fcm_tokens aft ON aft.admin_id = p.id
WHERE p.role = 'Admin'
  AND p.id = '<academy_admin_id>'  -- <-- 학원 관리자 UUID로 교체
GROUP BY p.id, p.academy_name;

-- =====================================================
-- 9. RPC 함수 테스트
-- 용도: register_admin_fcm_token RPC 정상 작동 확인
-- =====================================================
-- 먼저 auth.uid()로 로그인한 상태에서 실행:
SELECT public.register_admin_fcm_token(
  'test_token_' || substr(gen_random_text()::text, 1, 20),
  'Test Device'
);

-- =====================================================
-- 10. 토큰 수동 활성화
-- 용도: 문제 해결을 위해 특정 토큰을 활성화
-- =====================================================
-- UPDATE admin_fcm_tokens
-- SET is_active = true,
--     updated_at = NOW()
-- WHERE id = '<token_id>';  -- <-- 토큰 UUID로 교체

-- =====================================================
-- 11. 오래된 비활성 토큰 정리 (30일 이상)
-- 용도: 불필요한 데이터 정리
-- =====================================================
-- DELETE FROM admin_fcm_tokens
-- WHERE is_active = false
--   AND updated_at < NOW() - INTERVAL '30 days';

-- =====================================================
-- 디버깅 체크리스트
-- =====================================================
-- [ ] admin_fcm_tokens에 해당 admin_id로 is_active=true인 레코드가 있는가?
-- [ ] fcm_messages에 status='sent'인 레코드가 있는가?
-- [ ] fcm_message_recipients에 해당 메시지의 수신자 레코드가 있는가?
-- [ ] error_code가 null인가?
-- [ ] FCM 서비스 계정 키가 정상적으로 설정되어 있는가?
-- [ ] Edge Function 환경 변수가 올바른가?
