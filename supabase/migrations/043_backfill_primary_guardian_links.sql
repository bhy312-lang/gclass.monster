-- ============================================================================
-- 043_backfill_primary_guardian_links.sql
-- ============================================================================
-- Purpose: students.parent_id -> student_guardian_links 백필 + 검증 뷰
-- ============================================================================

INSERT INTO student_guardian_links (
  student_id,
  parent_id,
  relationship,
  is_primary,
  receive_check_in,
  receive_check_out,
  is_active,
  linked_by
)
SELECT
  s.id,
  s.parent_id,
  'primary',
  true,
  true,
  true,
  true,
  s.academy_id
FROM students s
WHERE s.parent_id IS NOT NULL
ON CONFLICT (student_id, parent_id)
DO UPDATE SET
  is_primary = true,
  is_active = true,
  updated_at = NOW();

-- 학생당 primary 링크 1개 초과 정리
WITH ranked AS (
  SELECT
    id,
    student_id,
    ROW_NUMBER() OVER (
      PARTITION BY student_id
      ORDER BY is_primary DESC, updated_at DESC, created_at DESC
    ) AS rn
  FROM student_guardian_links
  WHERE is_active = true
)
UPDATE student_guardian_links sgl
SET is_primary = CASE WHEN r.rn = 1 THEN true ELSE false END,
    updated_at = NOW()
FROM ranked r
WHERE sgl.id = r.id;

CREATE OR REPLACE VIEW v_student_guardian_backfill_report AS
SELECT
  s.id AS student_id,
  s.name AS student_name,
  s.academy_id,
  s.parent_id AS legacy_parent_id,
  COUNT(sgl.id) FILTER (WHERE sgl.is_active = true) AS active_link_count,
  COUNT(sgl.id) FILTER (WHERE sgl.is_active = true AND sgl.is_primary = true) AS active_primary_count,
  ARRAY_REMOVE(ARRAY_AGG(sgl.parent_id), NULL) AS linked_parent_ids
FROM students s
LEFT JOIN student_guardian_links sgl
  ON s.id = sgl.student_id
GROUP BY s.id, s.name, s.academy_id, s.parent_id;

COMMENT ON VIEW v_student_guardian_backfill_report IS 'students.parent_id와 student_guardian_links 백필/동기화 상태 점검 리포트';
