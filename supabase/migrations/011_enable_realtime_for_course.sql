-- =====================================================
-- Realtime 기능 활성화 (수강신청 시스템)
-- =====================================================
-- RLS가 활성화된 테이블에서 Realtime이 작동하도록 설정

-- course_time_slots 테이블 Realtime 활성화
ALTER PUBLICATION supabase_realtime ADD TABLE course_time_slots;

-- course_registrations 테이블 Realtime 활성화
ALTER PUBLICATION supabase_realtime ADD TABLE course_registrations;
