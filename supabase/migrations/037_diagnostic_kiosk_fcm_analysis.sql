-- ============================================================================
-- 037_diagnostic_kiosk_fcm_analysis.sql
-- ============================================================================
-- Purpose: 키오스크 FCM 미수신 원인 분석을 위한 진단 쿼리
-- Context: admin-app 키오스크 등/하원 시 parent-app으로 FCM이 도착하지 않는 문제 분석
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. 최근 30일 키오스크 등하원 건 기준 학생-부모ID-토큰 존재 여부 확인
-- ----------------------------------------------------------------------------
-- 원인 A: parent_id가 NULL인 학생이 등/하원 처리된 건수
-- 원인 B: parent_id는 있으나 활성 토큰이 없는 건수
-- ----------------------------------------------------------------------------
WITH attendance_analysis AS (
    SELECT
        a.id AS attendance_id,
        a.student_id,
        s.name AS student_name,
        s.parent_id,
        s.parent_phone_last4,
        s.approval_status,
        a.action_type,
        a.created_at,
        -- 활성 토큰 존재 여부
        EXISTS(
            SELECT 1
            FROM parent_fcm_tokens pft
            WHERE pft.parent_id = s.parent_id
              AND pft.is_active = true
        ) AS has_active_token,
        -- 토큰 전체 존재 여부 (비활성 포함)
        EXISTS(
            SELECT 1
            FROM parent_fcm_tokens pft
            WHERE pft.parent_id = s.parent_id
        ) AS has_any_token
    FROM attendances a
    JOIN students s ON s.id = a.student_id
    WHERE a.created_at >= NOW() - INTERVAL '30 days'
)
SELECT
    '원인 A: parent_id NULL' AS cause,
    COUNT(*) FILTER (WHERE parent_id IS NULL) AS count,
    ROUND(100.0 * COUNT(*) FILTER (WHERE parent_id IS NULL) / NULLIF(COUNT(*), 0), 2) AS percentage
FROM attendance_analysis
UNION ALL
SELECT
    '원인 B: parent_id 있으나 활성 토큰 없음' AS cause,
    COUNT(*) FILTER (WHERE parent_id IS NOT NULL AND NOT has_active_token) AS count,
    ROUND(100.0 * COUNT(*) FILTER (WHERE parent_id IS NOT NULL AND NOT has_active_token) / NULLIF(COUNT(*), 0), 2) AS percentage
FROM attendance_analysis
UNION ALL
SELECT
    '원인 C: 정상 (parent_id 있고 활성 토큰 있음)' AS cause,
    COUNT(*) FILTER (WHERE parent_id IS NOT NULL AND has_active_token) AS count,
    ROUND(100.0 * COUNT(*) FILTER (WHERE parent_id IS NOT NULL AND has_active_token) / NULLIF(COUNT(*), 0), 2) AS percentage
FROM attendance_analysis;

-- 상세 목록 (디버깅용)
-- SELECT * FROM attendance_analysis ORDER BY created_at DESC LIMIT 100;


-- ----------------------------------------------------------------------------
-- 2. 최근 30일 fcm_messages 실패 코드 분포
-- ----------------------------------------------------------------------------
-- FCM 전송 실패의 주요 원인 파악
-- ----------------------------------------------------------------------------
SELECT
    COALESCE(error_code, 'NULL') AS error_code,
    status,
    COUNT(*) AS count,
    ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER(), 2) AS percentage
FROM fcm_messages
WHERE created_at >= NOW() - INTERVAL '30 days'
    AND status = 'failed'
GROUP BY error_code, status
ORDER BY count DESC;


-- ----------------------------------------------------------------------------
-- 3. parent_id NULL인 approved 학생 목록
-- ----------------------------------------------------------------------------
-- 현재 시스템에서 부모 앱 연동이 안 된 학생들
-- ----------------------------------------------------------------------------
SELECT
    s.id,
    s.name,
    s.parent_phone_last4,
    s.full_phone,
    s.approval_status,
    s.academy_id,
    s.created_at,
    -- 해당 전화번호로 가입된 부모 계정이 있는지 확인
    EXISTS(
        SELECT 1
        FROM profiles p
        WHERE p.phone = s.full_phone
          AND p.role = 'parent'
    ) AS parent_account_exists
FROM students s
WHERE s.parent_id IS NULL
  AND s.approval_status = 'approved'
ORDER BY s.created_at DESC;


-- ----------------------------------------------------------------------------
-- 4. 자동 매핑 가능한 학생-부모 쌍 (full_phone 기준)
-- ----------------------------------------------------------------------------
-- students.full_phone과 profiles.phone이 일치하는 경우
-- ----------------------------------------------------------------------------
SELECT
    s.id AS student_id,
    s.name AS student_name,
    s.full_phone AS student_phone,
    s.parent_phone_last4,
    p.id AS potential_parent_id,
    p.name AS parent_name,
    p.phone AS parent_phone,
    p.role AS parent_role,
    s.approval_status
FROM students s
JOIN profiles p ON p.phone = s.full_phone
WHERE s.parent_id IS NULL
  AND s.full_phone IS NOT NULL
  AND p.role = 'parent';


-- ----------------------------------------------------------------------------
-- 5. 동일 last4를 가진 학생 그룹 중 parent_id 유무 혼합 케이스
-- ----------------------------------------------------------------------------
-- 원인 C: 동일한 뒷자리 4자리를 가진 학생 중 일부만 parent_id가 있는 경우
-- ----------------------------------------------------------------------------
WITH last4_groups AS (
    SELECT
        parent_phone_last4,
        academy_id,
        COUNT(*) AS total_count,
        COUNT(*) FILTER (WHERE parent_id IS NOT NULL) AS with_parent_count,
        COUNT(*) FILTER (WHERE parent_id IS NULL) AS without_parent_count
    FROM students
    WHERE parent_phone_last4 IS NOT NULL
      AND approval_status = 'approved'
    GROUP BY parent_phone_last4, academy_id
    HAVING COUNT(*) FILTER (WHERE parent_id IS NULL) > 0
      AND COUNT(*) FILTER (WHERE parent_id IS NOT NULL) > 0
)
SELECT
    l.parent_phone_last4,
    l.academy_id,
    l.total_count,
    l.with_parent_count,
    l.without_parent_count,
    -- 해당 그룹의 학생들
    (
        SELECT JSON_AGG(JSON_BUILD_OBJECT(
            'id', s.id,
            'name', s.name,
            'parent_id', s.parent_id
        ))
        FROM students s
        WHERE s.parent_phone_last4 = l.parent_phone_last4
          AND s.academy_id = l.academy_id
          AND s.approval_status = 'approved'
    ) AS students
FROM last4_groups l
ORDER BY l.parent_phone_last4;


-- ----------------------------------------------------------------------------
-- 6. 진단 요약 (한 번에 실행하기 위한 통합 뷰)
-- ----------------------------------------------------------------------------
-- 이 쿼리 하나로 전체 상황 파악
-- ----------------------------------------------------------------------------
SELECT
    'A. parent_id NULL인 approved 학생' AS metric,
    COUNT(*) AS count
FROM students
WHERE parent_id IS NULL AND approval_status = 'approved'
UNION ALL
SELECT
    'B. 최근 30일 등하원 중 parent_id NULL 건',
    COUNT(*)
FROM attendances a
JOIN students s ON s.id = a.student_id
WHERE a.created_at >= NOW() - INTERVAL '30 days'
  AND s.parent_id IS NULL
UNION ALL
SELECT
    'C. 최근 30일 FCM 실패 (NO_ACTIVE_TOKEN)',
    COUNT(*)
FROM fcm_messages
WHERE created_at >= NOW() - INTERVAL '30 days'
  AND error_code = 'NO_ACTIVE_TOKEN'
UNION ALL
SELECT
    'D. 자동 매핑 가능한 학생-부모 쌍',
    COUNT(*)
FROM students s
JOIN profiles p ON p.phone = s.full_phone
WHERE s.parent_id IS NULL
  AND s.full_phone IS NOT NULL
  AND p.role = 'parent'
UNION ALL
SELECT
    'E. 동일 last4 혼합 그룹 수',
    COUNT(DISTINCT parent_phone_last4)
FROM students s
WHERE parent_phone_last4 IS NOT NULL
  AND approval_status = 'approved'
  AND EXISTS (
      SELECT 1
      FROM students s2
      WHERE s2.parent_phone_last4 = s.parent_phone_last4
        AND s2.academy_id = s.academy_id
        AND s2.approval_status = 'approved'
        AND s2.parent_id IS NULL
  )
  AND EXISTS (
      SELECT 1
      FROM students s2
      WHERE s2.parent_phone_last4 = s.parent_phone_last4
        AND s2.academy_id = s.academy_id
        AND s2.approval_status = 'approved'
        AND s2.parent_id IS NOT NULL
  );
