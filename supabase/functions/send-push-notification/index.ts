// Supabase Edge Function for FCM Push Notifications
// FCM을 통해 관리자에게 푸시 알림 전송

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, Accept',
  'Access-Control-Max-Age': '86400',
};

// FCM 서버 키 (환경 변수에서 로드)
const FCM_SERVER_KEY = Deno.env.get('FCM_SERVER_KEY') || '';

serve(async (req) => {
  // OPTIONS 요청 처리 (CORS preflight)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 요청 파싱
    const { tokens, title, body, data } = await req.json();

    console.log(`[FCM Push] 알림 요청: title=${title}, tokens=${tokens?.length || 0}개`);

    // 필수 파라미터 검증
    if (!tokens || !Array.isArray(tokens) || tokens.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing or empty tokens array'
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    if (!title || !body) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing required parameters: title, body'
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // FCM 서버 키 확인
    if (!FCM_SERVER_KEY) {
      console.error('[FCM Push] FCM_SERVER_KEY 미설정');

      // FCM이 설정되지 않은 경우 DB에 로그만 남기고 성공 반환
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

      if (supabaseUrl && supabaseServiceKey) {
        const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);
        await supabaseClient.from('admin_notification_logs').insert({
          type: data?.type || 'notification',
          title: title,
          body: body,
          data: data,
          status: 'pending_fcm_setup'
        });
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: 'FCM not configured, notification logged'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // FCM 메시지 페이로드 구성
    const fcmPayload = {
      registration_ids: tokens,
      notification: {
        title: title,
        body: body,
        sound: 'default',
        click_action: 'FLUTTER_NOTIFICATION_CLICK'
      },
      data: data || {},
      priority: 'high'
    };

    // FCM API 호출
    const fcmResponse = await fetch('https://fcm.googleapis.com/fcm/send', {
      method: 'POST',
      headers: {
        'Authorization': `key=${FCM_SERVER_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(fcmPayload)
    });

    const fcmResult = await fcmResponse.json();
    console.log('[FCM Push] FCM 응답:', JSON.stringify(fcmResult));

    // Supabase 클라이언트로 로그 기록
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (supabaseUrl && supabaseServiceKey) {
      const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);
      await supabaseClient.from('admin_notification_logs').insert({
        type: data?.type || 'notification',
        title: title,
        body: body,
        data: data,
        status: fcmResult.success > 0 ? 'sent' : 'failed'
      });
    }

    // FCM 응답 처리
    if (fcmResult.success > 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: `Push notification sent to ${fcmResult.success} devices`,
          details: fcmResult
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    } else {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Failed to send push notification',
          details: fcmResult
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

  } catch (error) {
    console.error('[FCM Push] 처리 중 오류:', error);
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
