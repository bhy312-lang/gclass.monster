-- ============================================================================
-- 038_fix_students_parent_mapping.sql
-- ============================================================================
-- Purpose: students.parent_id가 NULL인 데이터를 정리하고 자동 매핑
-- Context: 관리자가 직접 등록한 학생 중 부모 계정과 연결되지 않은 경우 처리
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. parent_id NULL인 approved 학생 확인용 뷰 생성
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_students_without_parent AS
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
    ) AS parent_account_exists,
    -- 자동 매핑 가능 여부 (1:1 매칭)
    (
        SELECT COUNT(*)
        FROM profiles p
        WHERE p.phone = s.full_phone
          AND p.role = 'parent'
    ) AS potential_parent_count
FROM students s
WHERE s.parent_id IS NULL
  AND s.approval_status = 'approved';

COMMENT ON VIEW v_students_without_parent IS 'parent_id가 NULL인 approved 학생 목록. 부모 계정 연동을 위한 진단 뷰.';


-- ----------------------------------------------------------------------------
-- 2. 자동 매핑 가능한 학생-부모 쌍 확인 (1:1 매칭만)
-- ----------------------------------------------------------------------------
-- full_phone으로 profiles.phone과 정확히 일치하고 1:1인 경우만 자동 매핑
-- 다건 매칭은 수동 처리 대상으로 제외
-- ----------------------------------------------------------------------------

-- 먼저 자동 매핑 가능한 케이스를 확인하는 쿼리 (실행 전 확인용)
-- 이 쿼리의 결과를 확인 후 아래 UPDATE 실행
SELECT
    s.id AS student_id,
    s.name AS student_name,
    s.full_phone AS student_phone,
    s.parent_phone_last4,
    p.id AS parent_id,
    p.name AS parent_name,
    p.phone AS parent_phone,
    p.role AS parent_role,
    s.approval_status
FROM students s
JOIN profiles p ON p.phone = s.full_phone
WHERE s.parent_id IS NULL
  AND s.full_phone IS NOT NULL
  AND p.role = 'parent'
  -- 1:1 매칭만: 한 학생의 전화번호에 정확히 하나의 부모 계정만 존재
  AND 1 = (
      SELECT COUNT(*)
      FROM profiles p2
      WHERE p2.phone = s.full_phone
        AND p2.role = 'parent'
  );


-- ----------------------------------------------------------------------------
-- 3. 자동 매핑 실행 (안전하게 한 번에 실행)
-- ----------------------------------------------------------------------------
-- 위 확인 쿼리 결과를 검토한 후 실행하세요.
-- ----------------------------------------------------------------------------

-- 자동 매핑: 1:1 매칭인 경우만
-- (다건 매칭은 수동 처리가 필요하므로 제외)
UPDATE students s
SET
    parent_id = p.id,
    updated_at = NOW()
FROM profiles p
WHERE s.parent_id IS NULL
  AND s.full_phone IS NOT NULL
  AND p.phone = s.full_phone
  AND p.role = 'parent'
  -- 안전장치: 1:1 매칭 확인
  AND 1 = (
      SELECT COUNT(*)
      FROM profiles p2
      WHERE p2.phone = s.full_phone
        AND p2.role = 'parent'
  );

-- ----------------------------------------------------------------------------
-- 4. 수동 처리 대상 목록 (다건 매칭 또는 모호한 케이스)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_students_needing_manual_parent_link AS
SELECT
    s.id AS student_id,
    s.name AS student_name,
    s.full_phone AS student_phone,
    s.parent_phone_last4,
    s.approval_status,
    s.academy_id,
    -- 매칭되는 부모 계정들 (JSON 배열)
    (
        SELECT JSON_AGG(JSON_BUILD_OBJECT(
            'parent_id', p.id,
            'parent_name', p.name,
            'parent_phone', p.phone
        ))
        FROM profiles p
        WHERE p.phone = s.full_phone
          AND p.role = 'parent'
    ) AS potential_parents,
    -- 매칭되는 부모 계정 수
    (
        SELECT COUNT(*)
        FROM profiles p
        WHERE p.phone = s.full_phone
          AND p.role = 'parent'
    ) AS parent_match_count
FROM students s
WHERE s.parent_id IS NULL
  AND s.approval_status = 'approved'
  AND s.full_phone IS NOT NULL
  AND EXISTS (
      -- 부모 계정이 하나라도 존재하지만,
      SELECT 1
      FROM profiles p
      WHERE p.phone = s.full_phone
        AND p.role = 'parent'
  )
  AND (
      -- 1:1이 아닌 경우 (다건 매칭) 또는
      1 < (
          SELECT COUNT(*)
          FROM profiles p
          WHERE p.phone = s.full_phone
            AND p.role = 'parent'
      )
  );

COMMENT ON VIEW v_students_needing_manual_parent_link IS '부모 계정 연동이 필요하지만 다건 매칭 등으로 수동 처리가 필요한 학생 목록.';


-- ----------------------------------------------------------------------------
-- 5. full_phone이 없는 학생 (parent_phone_last4만 있는 경우)
-- ----------------------------------------------------------------------------
-- 이 경우는 전화번호 뒷자리만으로는 정확한 매칭이 불가능하므로
-- 수동으로 full_phone을 입력하거나 부모 계정을 선택해야 함
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_students_without_full_phone AS
SELECT
    s.id,
    s.name,
    s.parent_phone_last4,
    s.approval_status,
    s.academy_id,
    s.created_at
FROM students s
WHERE s.parent_id IS NULL
  AND s.approval_status = 'approved'
  AND (s.full_phone IS NULL OR s.full_phone = '');

COMMENT ON VIEW v_students_without_full_phone IS 'full_phone이 없어 자동 매핑이 불가능한 학생 목록. 수동으로 전화번호 입력 필요.';


-- ----------------------------------------------------------------------------
-- 6. 실행 결과 요약 (마이그레이션 후 확인용)
-- ----------------------------------------------------------------------------
SELECT
    '자동 매핑 완료된 학생 수' AS description,
    COUNT(*) AS count
FROM students s
WHERE s.parent_id IS NOT NULL
  AND s.full_phone IS NOT NULL
  AND EXISTS (
      SELECT 1
      FROM profiles p
      WHERE p.id = s.parent_id
        AND p.phone = s.full_phone
        AND p.role = 'parent'
  )
UNION ALL
SELECT
    '여전히 parent_id가 NULL인 approved 학생',
    COUNT(*)
FROM students
WHERE parent_id IS NULL AND approval_status = 'approved'
UNION ALL
SELECT
    '수동 처리 필요 (다건 매칭)',
    COUNT(*)
FROM v_students_needing_manual_parent_link
UNION ALL
SELECT
    '수동 처리 필요 (full_phone 없음)',
    COUNT(*)
FROM v_students_without_full_phone;
