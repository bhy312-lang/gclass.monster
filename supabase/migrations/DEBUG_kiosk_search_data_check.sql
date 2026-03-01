-- ============================================
-- 키오스크 검색 디버깅용 SQL
-- ============================================
-- 실행 방법: Supabase 대시보드 → SQL Editor에서 실행
-- ============================================

-- 1. students 테이블 전체 현황 확인
SELECT
    id,
    name,
    full_phone,
    parent_phone_last4,
    approval_status,
    academy_id,
    created_at
FROM students
ORDER BY created_at DESC
LIMIT 20;

-- 2. parent_phone_last4가 NULL인 레코드 확인
SELECT
    id,
    name,
    full_phone,
    parent_phone_last4,
    approval_status,
    academy_id
FROM students
WHERE parent_phone_last4 IS NULL
  AND full_phone IS NOT NULL;

-- 3. 승인 상태별 개수 집계
SELECT
    approval_status,
    COUNT(*) as count
FROM students
GROUP BY approval_status
ORDER BY count DESC;

-- 4. 특정 번호(4397)로 검색 - 테스트용
SELECT
    id,
    name,
    full_phone,
    parent_phone_last4,
    approval_status,
    academy_id
FROM students
WHERE parent_phone_last4 = '4397';

-- 5. full_phone에 4397이 포함된 레코드 (백필 전 확인용)
SELECT
    id,
    name,
    full_phone,
    parent_phone_last4,
    approval_status,
    academy_id
FROM students
WHERE full_phone LIKE '%4397%';

-- 6. 현재 로그인한 관리자(bhy312@gmail.com, ID: b6a78592-5452-4464-8a91-c5da76f16702)의 학생들
SELECT
    s.id,
    s.name,
    s.full_phone,
    s.parent_phone_last4,
    s.approval_status,
    s.academy_id
FROM students s
WHERE s.academy_id = 'b6a78592-5452-4464-8a91-c5da76f16702'
ORDER BY s.created_at DESC;

-- ============================================
-- 문제 해결용 UPDATE 쿼리 (필요시 실행)
-- ============================================

-- A. parent_phone_last4 백필 재실행 (이미 마이그레이션에서 실행됨)
-- 백필이 안 됐을 경우만 실행
UPDATE students
SET parent_phone_last4 = CASE
    WHEN LENGTH(regexp_replace(full_phone, '\D', '', 'g')) >= 4
    THEN RIGHT(regexp_replace(full_phone, '\D', '', 'g'), 4)
    ELSE NULL
END
WHERE full_phone IS NOT NULL
  AND parent_phone_last4 IS NULL;

-- B. 특정 학생 승인 상태 변경 (4397 번호 테스트용)
-- parent_phone_last4가 4397인 학생을 approved로 변경
UPDATE students
SET approval_status = 'approved'
WHERE parent_phone_last4 = '4397'
  AND approval_status = 'pending';

-- C. academy_id 일치시키기 (필요시)
-- parent_phone_last4가 4397인 학생의 academy_id를 현재 관리자 ID로 변경
UPDATE students
SET academy_id = 'b6a78592-5452-4464-8a91-c5da76f16702'
WHERE parent_phone_last4 = '4397'
  AND academy_id IS DISTINCT FROM 'b6a78592-5452-4464-8a91-c5da76f16702';

-- D. 모든 조건 한번에 수정 (4397 번호 테스트용)
UPDATE students
SET approval_status = 'approved',
    academy_id = 'b6a78592-5452-4464-8a91-c5da76f16702'
WHERE parent_phone_last4 = '4397';

-- ============================================
-- 검증 쿼리 (수정 후 실행하여 확인)
-- ============================================

-- 수정 후 4397로 검색되는지 확인
SELECT
    id,
    name,
    full_phone,
    parent_phone_last4,
    approval_status,
    academy_id
FROM students
WHERE parent_phone_last4 = '4397'
  AND approval_status = 'approved'
  AND academy_id = 'b6a78592-5452-4464-8a91-c5da76f16702';
