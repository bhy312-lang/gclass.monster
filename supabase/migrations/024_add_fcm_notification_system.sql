-- FCM 기반 출결 알림 시스템 스키마
-- FCM-based Attendance Notification System Schema

-- =====================================================
-- 1. Parent FCM Tokens Table
-- =====================================================
CREATE TABLE IF NOT EXISTS parent_fcm_tokens (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    parent_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    fcm_token TEXT NOT NULL,
    device_info JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    last_used_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(parent_id, fcm_token)
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_parent_fcm_tokens_parent_id ON parent_fcm_tokens(parent_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_parent_fcm_tokens_token ON parent_fcm_tokens(fcm_token) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_parent_fcm_tokens_last_used ON parent_fcm_tokens(last_used_at DESC);
CREATE INDEX IF NOT EXISTS idx_parent_fcm_tokens_device_id ON parent_fcm_tokens((device_info->>'device_id')) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_parent_fcm_tokens_inactive_cleanup ON parent_fcm_tokens(is_active, updated_at) WHERE NOT is_active;

-- RLS 활성화
ALTER TABLE parent_fcm_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Parents can manage own FCM tokens"
    ON parent_fcm_tokens
    FOR ALL
    USING (parent_id = auth.uid())
    WITH CHECK (parent_id = auth.uid());

CREATE POLICY "Service role can manage all parent tokens"
    ON parent_fcm_tokens
    FOR ALL
    USING (true);

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_parent_fcm_tokens_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_parent_fcm_tokens_updated_at
    BEFORE UPDATE ON parent_fcm_tokens
    FOR EACH ROW
    EXECUTE FUNCTION update_parent_fcm_tokens_updated_at();

COMMENT ON TABLE parent_fcm_tokens IS 'Parent FCM push notification tokens';
COMMENT ON COLUMN parent_fcm_tokens.device_info IS 'Platform, OS version, app version, device identifier';
COMMENT ON COLUMN parent_fcm_tokens.is_active IS 'Soft delete flag for inactive tokens';

-- =====================================================
-- 2. Enhance admin_fcm_tokens Table
-- =====================================================
ALTER TABLE admin_fcm_tokens
    ADD COLUMN IF NOT EXISTS device_info JSONB DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ DEFAULT NOW();

-- 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_admin_fcm_tokens_active ON admin_fcm_tokens(admin_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_admin_fcm_tokens_inactive_cleanup ON admin_fcm_tokens(is_active, updated_at) WHERE NOT is_active;

-- unique constraint를 soft delete와 호환되도록 수정
DROP INDEX IF EXISTS admin_fcm_tokens_fcm_token_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_fcm_tokens_unique_active ON admin_fcm_tokens(fcm_token) WHERE is_active = true;

COMMENT ON COLUMN admin_fcm_tokens.device_info IS 'Platform, OS version, app version, device identifier';
COMMENT ON COLUMN admin_fcm_tokens.is_active IS 'Soft delete flag for inactive tokens';

-- =====================================================
-- 3. FCM Messages Table
-- =====================================================
CREATE TABLE IF NOT EXISTS fcm_messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    message_id TEXT NOT NULL UNIQUE,
    message_type TEXT NOT NULL,
    priority TEXT DEFAULT 'normal',

    title TEXT NOT NULL,
    body TEXT NOT NULL,
    data JSONB DEFAULT '{}',

    target_type TEXT NOT NULL,
    target_id UUID REFERENCES auth.users(id),
    academy_id UUID REFERENCES profiles(id),

    status TEXT DEFAULT 'pending',
    delivery_attempts INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 1,
    next_retry_at TIMESTAMPTZ,

    queued_at TIMESTAMPTZ DEFAULT NOW(),
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,

    error_code TEXT,
    error_message TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT fcm_messages_status_check CHECK (status IN ('pending', 'queued', 'sending', 'sent', 'delivered', 'read', 'failed', 'retry_pending')),
    CONSTRAINT fcm_messages_priority_check CHECK (priority IN ('normal', 'high')),
    CONSTRAINT fcm_messages_target_type_check CHECK (target_type IN ('parent', 'admin', 'broadcast'))
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_fcm_messages_message_id ON fcm_messages(message_id);
CREATE INDEX IF NOT EXISTS idx_fcm_messages_status ON fcm_messages(status);
CREATE INDEX IF NOT EXISTS idx_fcm_messages_target ON fcm_messages(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_fcm_messages_academy ON fcm_messages(academy_id);
CREATE INDEX IF NOT EXISTS idx_fcm_messages_retry_queue ON fcm_messages(status, next_retry_at)
    WHERE status IN ('queued', 'retry_pending', 'sent');
CREATE INDEX IF NOT EXISTS idx_fcm_messages_created_at ON fcm_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fcm_messages_type ON fcm_messages(message_type);

-- RLS 활성화
ALTER TABLE fcm_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to fcm_messages"
    ON fcm_messages
    FOR ALL
    USING (true);

CREATE POLICY "Parents can view own messages"
    ON fcm_messages
    FOR SELECT
    USING (target_id = auth.uid());

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_fcm_messages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_fcm_messages_updated_at
    BEFORE UPDATE ON fcm_messages
    FOR EACH ROW
    EXECUTE FUNCTION update_fcm_messages_updated_at();

COMMENT ON TABLE fcm_messages IS 'FCM message tracking with delivery confirmation';
COMMENT ON COLUMN fcm_messages.message_id IS 'Globally unique ID for message tracking';
COMMENT ON COLUMN fcm_messages.status IS 'Delivery lifecycle status';

-- =====================================================
-- 4. FCM Message Recipients Table (for bulk sends)
-- =====================================================
CREATE TABLE IF NOT EXISTS fcm_message_recipients (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    message_id UUID REFERENCES fcm_messages(id) ON DELETE CASCADE NOT NULL,
    recipient_id UUID REFERENCES auth.users(id) NOT NULL,
    fcm_token_id UUID REFERENCES parent_fcm_tokens(id) ON DELETE SET NULL,

    status TEXT DEFAULT 'pending',
    delivery_attempts INTEGER DEFAULT 0,

    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,

    error_code TEXT,
    error_message TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(message_id, recipient_id),

    CONSTRAINT fcm_recipients_status_check CHECK (status IN ('pending', 'sent', 'delivered', 'failed'))
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_fcm_recipients_message ON fcm_message_recipients(message_id);
CREATE INDEX IF NOT EXISTS idx_fcm_recipients_recipient ON fcm_message_recipients(recipient_id);
CREATE INDEX IF NOT EXISTS idx_fcm_recipients_status ON fcm_message_recipients(status);
CREATE INDEX IF NOT EXISTS idx_fcm_recipients_token ON fcm_message_recipients(fcm_token_id);

-- RLS 활성화
ALTER TABLE fcm_message_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to fcm_recipients"
    ON fcm_message_recipients
    FOR ALL
    USING (true);

CREATE POLICY "Users can view own recipient records"
    ON fcm_message_recipients
    FOR SELECT
    USING (recipient_id = auth.uid());

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_fcm_recipients_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_fcm_recipients_updated_at
    BEFORE UPDATE ON fcm_message_recipients
    FOR EACH ROW
    EXECUTE FUNCTION update_fcm_recipients_updated_at();

COMMENT ON TABLE fcm_message_recipients IS 'Per-recipient delivery tracking for bulk FCM messages';

-- =====================================================
-- 5. FCM Acknowledgments Table
-- =====================================================
CREATE TABLE IF NOT EXISTS fcm_acknowledgments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    message_id TEXT NOT NULL,
    recipient_id UUID REFERENCES auth.users(id) NOT NULL,
    fcm_token_id UUID REFERENCES parent_fcm_tokens(id) ON DELETE SET NULL,

    ack_type TEXT NOT NULL,
    client_timestamp TIMESTAMPTZ NOT NULL,
    server_received_at TIMESTAMPTZ DEFAULT NOW(),
    app_state JSONB DEFAULT '{}',

    created_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT fcm_ack_type_check CHECK (ack_type IN ('delivered', 'read', 'dismissed'))
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_fcm_ack_message ON fcm_acknowledgments(message_id);
CREATE INDEX IF NOT EXISTS idx_fcm_ack_recipient ON fcm_acknowledgments(recipient_id);
CREATE INDEX IF NOT EXISTS idx_fcm_ack_created_at ON fcm_acknowledgments(created_at DESC);

-- RLS 활성화
ALTER TABLE fcm_acknowledgments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to fcm_ack"
    ON fcm_acknowledgments
    FOR ALL
    USING (true);

CREATE POLICY "Users can insert own acknowledgments"
    ON fcm_acknowledgments
    FOR INSERT
    WITH CHECK (recipient_id = auth.uid());

CREATE POLICY "Users can view own acknowledgments"
    ON fcm_acknowledgments
    FOR SELECT
    USING (recipient_id = auth.uid());

COMMENT ON TABLE fcm_acknowledgments IS 'Client delivery confirmations for FCM messages';

-- =====================================================
-- 6. Token Cleanup Function
-- =====================================================
CREATE OR REPLACE FUNCTION mark_inactive_fcm_tokens()
RETURNS TABLE(
    tokens_marked_inactive INTEGER
) AS $$
DECLARE
    inactive_threshold TIMESTAMPTZ := NOW() - INTERVAL '90 days';
    recently_failed_threshold TIMESTAMPTZ := NOW() - INTERVAL '7 days';
BEGIN
    -- Mark parent tokens inactive
    UPDATE parent_fcm_tokens
    SET is_active = false,
        updated_at = NOW()
    WHERE is_active = true
    AND (
        last_used_at < inactive_threshold
        OR id IN (
            SELECT DISTINCT ft.id
            FROM parent_fcm_tokens ft
            JOIN fcm_message_recipients fmr ON fmr.fcm_token_id = ft.id
            WHERE ft.id = parent_fcm_tokens.id
            AND fmr.status = 'failed'
            AND fmr.created_at > recently_failed_threshold
            GROUP BY ft.id
            HAVING COUNT(*) >= 3
        )
    );

    -- Mark admin tokens inactive
    UPDATE admin_fcm_tokens
    SET is_active = false,
        updated_at = NOW()
    WHERE is_active = true
    AND last_used_at < inactive_threshold;

    GET DIAGNOSTICS tokens_marked_inactive = ROW_COUNT;
    RETURN QUERY SELECT tokens_marked_inactive;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 7. Hard delete old tokens function
-- =====================================================
CREATE OR REPLACE FUNCTION hard_delete_old_fcm_tokens()
RETURNS TABLE(
    tokens_deleted INTEGER
) AS $$
BEGIN
    -- Delete old inactive parent tokens
    DELETE FROM parent_fcm_tokens
    WHERE is_active = false
    AND updated_at < NOW() - INTERVAL '180 days';

    GET DIAGNOSTICS tokens_deleted = ROW_COUNT;

    -- Delete old inactive admin tokens
    DELETE FROM admin_fcm_tokens
    WHERE is_active = false
    AND updated_at < NOW() - INTERVAL '180 days';

    tokens_deleted := tokens_deleted + (SELECT COUNT(*) FROM admin_fcm_tokens WHERE is_active = false AND updated_at < NOW() - INTERVAL '180 days');

    RETURN QUERY SELECT tokens_deleted;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 8. Helper function to get active parent tokens
-- =====================================================
CREATE OR REPLACE FUNCTION get_active_parent_fcm_tokens(p_parent_id UUID)
RETURNS TABLE(
    token_id UUID,
    fcm_token TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT id, fcm_token
    FROM parent_fcm_tokens
    WHERE parent_id = p_parent_id
    AND is_active = true
    ORDER BY last_used_at DESC;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 9. Helper function to get academy parents for broadcast
-- =====================================================
CREATE OR REPLACE FUNCTION get_academy_parent_tokens(p_academy_id UUID)
RETURNS TABLE(
    parent_id UUID,
    token_id UUID,
    fcm_token TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT
        p.id as parent_id,
        pft.id as token_id,
        pft.fcm_token
    FROM profiles p
    JOIN students s ON s.parent_id = p.id
    JOIN parent_fcm_tokens pft ON pft.parent_id = p.id
    WHERE s.academy_id = p_academy_id
    AND pft.is_active = true
    AND p.push_notification_enabled = true;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION mark_inactive_fcm_tokens IS 'Mark inactive FCM tokens for cleanup';
COMMENT ON FUNCTION hard_delete_old_fcm_tokens IS 'Hard delete tokens inactive for 180+ days';
COMMENT ON FUNCTION get_active_parent_fcm_tokens IS 'Get active FCM tokens for a parent';
COMMENT ON FUNCTION get_academy_parent_tokens IS 'Get all parent tokens for an academy broadcast';
