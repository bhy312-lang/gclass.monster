// Supabase Edge Function for Web Push Notifications
// Web Push 알림을 전송하는 Edge Function

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

// Web Push 라이브러리
import webpush from 'https://esm.sh/web-push@3.6.3';

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// VAPID 설정 (환경 변수에서 로드)
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') || '';
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') || '';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:your-email@example.com';

// VAPID 설정 검증
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(
      VAPID_SUBJECT,
      VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY
    );
    console.log('[Edge Function] VAPID 설정 완료');
  } catch (error) {
    console.error('[Edge Function] VAPID 설정 실패:', error);
  }
} else {
  console.warn('[Edge Function] VAPID keys가 설정되지 않음');
}

serve(async (req) => {
  // OPTIONS 요청 처리 (CORS preflight)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 요청 파싱
    const { student_id, parent_id, type, student_name } = await req.json();

    console.log(`[Edge Function] Push 알림 요청: student=${student_name}, type=${type}`);

    // 필수 파라미터 검증
    if (!student_id || !parent_id || !type || !student_name) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing required parameters: student_id, parent_id, type, student_name'
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Supabase 클라이언트 생성
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase 환경 변수가 설정되지 않음');
    }

    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

    // 부모의 Push 구독 정보 조회
    const { data: parent, error: parentError } = await supabaseClient
      .from('profiles')
      .select('web_push_subscription, push_notification_enabled')
      .eq('id', parent_id)
      .single();

    if (parentError || !parent) {
      console.error('[Edge Function] 부모 조회 실패:', parentError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Parent not found'
        }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Push 알림 활성화 확인
    if (!parent.push_notification_enabled) {
      console.log('[Edge Function] Push 알림 비활성화됨');
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Push notifications disabled for this parent'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // 구독 정보 확인
    if (!parent.web_push_subscription) {
      console.log('[Edge Function] Web Push 구독 정보 없음');
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No push subscription found'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // VAPID 키 설정 확인
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      console.error('[Edge Function] VAPID keys 미설정');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'VAPID keys not configured'
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Web Push 페이로드 생성
    const payload = JSON.stringify({
      title: type === 'check_in' ? '📚 등원 알림' : '🏠 하원 알림',
      body: `${student_name}님이 ${type === 'check_in' ? '등원' : '하원'}했습니다`,
      url: '/parent/',
      studentId: student_id,
      type: type,
      timestamp: new Date().toISOString()
    });

    console.log('[Edge Function] Web Push 전송 시도...');

    // Web Push 전송
    try {
      await webpush.sendNotification(
        parent.web_push_subscription,
        payload
      );
      console.log('[Edge Function] Web Push 전송 성공');
    } catch (pushError) {
      console.error('[Edge Function] Web Push 전송 실패:', pushError);

      // 만료된 구독(410) 처리
      if (pushError.statusCode === 410 || pushError.code === 410) {
        console.log('[Edge Function] 만료된 구독 - 삭제 처리');
        await supabaseClient
          .from('profiles')
          .update({
            web_push_subscription: null,
            push_notification_enabled: false
          })
          .eq('id', parent_id);
      }

      // 알림 로그에 실패 기록
      await supabaseClient.from('notification_logs').insert({
        student_id,
        parent_id,
        type,
        channel: 'web_push',
        status: 'failed',
        error_message: pushError.message || 'Unknown error',
        sent_at: new Date().toISOString()
      });

      return new Response(
        JSON.stringify({
          success: false,
          error: 'Failed to send push notification',
          details: pushError.message
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // 알림 로그 기록 (성공)
    const { error: logError } = await supabaseClient.from('notification_logs').insert({
      student_id,
      parent_id,
      type,
      channel: 'web_push',
      status: 'sent',
      sent_at: new Date().toISOString()
    });

    if (logError) {
      console.error('[Edge Function] 알림 로그 기록 실패:', logError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Push notification sent successfully'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('[Edge Function] 처리 중 오류:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Internal server error'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
