-- 관리자 FCM 토큰 저장 테이블
-- Admin FCM tokens for push notifications

CREATE TABLE IF NOT EXISTS admin_fcm_tokens (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    admin_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    fcm_token TEXT NOT NULL UNIQUE,
    device_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_admin_fcm_tokens_admin_id ON admin_fcm_tokens(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_fcm_tokens_token ON admin_fcm_tokens(fcm_token);

-- RLS 활성화
ALTER TABLE admin_fcm_tokens ENABLE ROW LEVEL SECURITY;

-- 관리자가 자신의 토큰 관리 가능
CREATE POLICY "Admins can manage their own FCM tokens"
    ON admin_fcm_tokens
    FOR ALL
    USING (admin_id = auth.uid())
    WITH CHECK (admin_id = auth.uid());

-- 읽기 정책 (Edge Function에서 사용)
CREATE POLICY "Service role can read all tokens"
    ON admin_fcm_tokens
    FOR SELECT
    USING (true);

-- 알림 로그 테이블 (선택적)
CREATE TABLE IF NOT EXISTS admin_notification_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT,
    data JSONB,
    status TEXT DEFAULT 'pending',
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_admin_fcm_tokens_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_admin_fcm_tokens_updated_at
    BEFORE UPDATE ON admin_fcm_tokens
    FOR EACH ROW
    EXECUTE FUNCTION update_admin_fcm_tokens_updated_at();

COMMENT ON TABLE admin_fcm_tokens IS '관리자 FCM 푸시 알림 토큰 저장 테이블';
COMMENT ON TABLE admin_notification_logs IS '관리자 알림 전송 로그';
