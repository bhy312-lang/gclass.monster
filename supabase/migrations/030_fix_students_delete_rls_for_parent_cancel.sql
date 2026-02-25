-- =====================================================
-- 030: 부모가 본인 pending 학생을 삭제할 수 있도록 RLS 보정
-- =====================================================
-- 작업일: 2026-02-26
-- 목적: 학부모 앱의 "신청 취소" 기능이 동작하도록 DELETE 권한 추가
--
-- 변경사항:
--   1. "Parents can delete own students" 정책 생성/갱신
--   2. parent_id = auth.uid()인 본인 학생만 삭제 가능
-- =====================================================

-- 기존 정책 삭제 (있을 경우)
DROP POLICY IF EXISTS "Parents can delete own students" ON public.students;

-- 부모가 본인 학생을 삭제할 수 있는 정책 생성
CREATE POLICY "Parents can delete own students"
  ON public.students
  FOR DELETE
  USING (parent_id = auth.uid());

-- 정책 확인용 쿼리 (실행 필요 없음)
-- SELECT * FROM pg_policies WHERE tablename = 'students';
