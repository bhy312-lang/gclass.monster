-- Web Push 알림 시스템을 위한 데이터베이스 스키마 변경
-- 실행일: 2026-02-03

-- profiles 테이블에 Web Push 구독 정보 컬럼 추가
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS web_push_subscription JSONB,
  ADD COLUMN IF NOT EXISTS push_notification_enabled BOOLEAN DEFAULT false;

-- Web Push 구독 정보에 대한 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_profiles_push_enabled ON profiles(push_notification_enabled) WHERE push_notification_enabled = true;

-- 알림 로그 테이블 생성
CREATE TABLE IF NOT EXISTS notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT CHECK (type IN ('check_in', 'check_out')),
  channel TEXT DEFAULT 'web_push',
  status TEXT CHECK (status IN ('pending', 'sent', 'failed')) DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_notification_logs_parent ON notification_logs(parent_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_student ON notification_logs(student_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_created ON notification_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_logs_status ON notification_logs(status);

-- RLS (Row Level Security) 활성화
ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;

-- RLS 정책: 학부모는 자신의 알림 로그만 조회 가능
CREATE POLICY "Parents view own notification logs"
  ON notification_logs
  FOR SELECT
  USING (auth.uid() = parent_id);

-- RLS 정책: Service Role은 알림 로그 삽입 가능 (Edge Function용)
CREATE POLICY "Service can insert notification logs"
  ON notification_logs
  FOR INSERT
  WITH CHECK (true);

-- RLS 정책: 관리자는 모든 알림 로그 조회 가능
CREATE POLICY "Admins can view all notification logs"
  ON notification_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'Admin'
    )
  );

-- profiles 테이블에 대한 RLS 정책 추가 (Web Push 구독 정보)
CREATE POLICY "Parents can update own push subscription"
  ON profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 주석 추가
COMMENT ON COLUMN profiles.web_push_subscription IS 'Web Push API 구독 정보 (endpoint, keys.p256dh, keys.auth)';
COMMENT ON COLUMN profiles.push_notification_enabled IS 'Push 알림 활성화 여부';
COMMENT ON TABLE notification_logs IS '등하원 알림 전송 로그';
COMMENT ON COLUMN notification_logs.type IS '알림 유형: check_in (등원), check_out (하원)';
COMMENT ON COLUMN notification_logs.channel IS '알림 채널: web_push, sms 등';
COMMENT ON COLUMN notification_logs.status IS '전송 상태: pending, sent, failed';
