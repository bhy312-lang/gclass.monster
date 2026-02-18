// FCM Send Notification Edge Function
// Send notification to parent/admin with delivery tracking

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { createFCMClient } from '../shared/fcm-client.ts';
import { generateMessageId } from '../shared/message-id-generator.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

interface SendRequest {
  recipient_id: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  priority?: 'normal' | 'high';
  target_type?: 'parent' | 'admin';
}

const ACK_TIMEOUT_SECONDS = 10;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const {
      recipient_id,
      type,
      title,
      body,
      data = {},
      priority = 'normal',
      target_type = 'parent'
    }: SendRequest = await req.json();

    // Validate input
    if (!recipient_id || !title || !body) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields: recipient_id, title, body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Generate message ID
    const messageId = generateMessageId();
    const now = new Date().toISOString();

    // Determine table name based on target type
    const tokensTable = target_type === 'admin' ? 'admin_fcm_tokens' : 'parent_fcm_tokens';
    const userIdColumn = target_type === 'admin' ? 'admin_id' : 'parent_id';

    // Get recipient's active FCM tokens
    const { data: tokens, error: tokensError } = await supabase
      .from(tokensTable)
      .select('id, fcm_token')
      .eq(userIdColumn, recipient_id)
      .eq('is_active', true);

    if (tokensError) {
      console.error('[FCM Send] Token query error:', tokensError);
      return new Response(
        JSON.stringify({ success: false, error: 'Database query failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!tokens || tokens.length === 0) {
      // No active tokens - create message record with failed status
      await supabase.from('fcm_messages').insert({
        message_id: messageId,
        message_type: type,
        title,
        body,
        data,
        priority,
        target_type,
        target_id: recipient_id,
        status: 'failed',
        error_code: 'NO_ACTIVE_TOKEN',
        error_message: 'No active FCM token found for recipient',
        queued_at: now,
        failed_at: now
      });

      return new Response(
        JSON.stringify({
          success: false,
          error: 'No active FCM token for recipient',
          message_id: messageId
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create message record with queued status
    const { error: insertError } = await supabase.from('fcm_messages').insert({
      message_id: messageId,
      message_type: type,
      title,
      body,
      data,
      priority,
      target_type,
      target_id: recipient_id,
      status: 'queued',
      queued_at: now
    });

    if (insertError) {
      console.error('[FCM Send] Message insert error:', insertError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to create message record' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize FCM client
    let fcmClient: ReturnType<typeof createFCMClient>;
    try {
      fcmClient = createFCMClient();
    } catch (error) {
      console.error('[FCM Send] FCM client error:', error);
      // Mark message as failed
      await supabase.from('fcm_messages')
        .update({
          status: 'failed',
          error_code: 'FCM_NOT_CONFIGURED',
          error_message: 'FCM not configured',
          failed_at: new Date().toISOString()
        })
        .eq('message_id', messageId);

      return new Response(
        JSON.stringify({
          success: false,
          error: 'FCM not configured',
          message_id: messageId
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Send to each token
    let successCount = 0;
    const results: Array<{ token_id: string; success: boolean; error?: string }> = [];

    for (const token of tokens) {
      const result = await fcmClient.send({
        token: token.fcm_token,
        data: {
          message_id: messageId,
          type,
          ...data
        },
        notification: {
          title,
          body
        },
        android: {
          priority,
          ttl: '86400s', // 24 hours
          notification: {
            channel_id: type,
            sound: 'default'
          }
        }
      });

      // Create recipient record
      await supabase.from('fcm_message_recipients').insert({
        message_id: messageId,
        recipient_id,
        fcm_token_id: target_type === 'parent' ? token.id : null,
        status: result.success ? 'sent' : 'failed',
        sent_at: result.success ? now : null,
        failed_at: result.success ? null : now,
        error_code: result.errorCode,
        delivery_attempts: 1
      });

      // Update token last_used_at on success
      if (result.success) {
        await supabase
          .from(tokensTable)
          .update({ last_used_at: now })
          .eq('id', token.id);
        successCount++;
      } else {
        // Check if token should be invalidated
        if (result.errorCode && fcmClient.shouldInvalidateToken(result.errorCode)) {
          await supabase
            .from(tokensTable)
            .update({ is_active: false, updated_at: now })
            .eq('id', token.id);
          console.log(`[FCM Send] Token invalidated: ${token.id}, error: ${result.errorCode}`);
        }
      }

      results.push({ token_id: token.id, success: result.success, error: result.error });
    }

    // Update message status
    const finalStatus = successCount > 0 ? 'sent' : 'failed';
    const updateData: any = {
      status: finalStatus,
      sent_at: now,
      delivery_attempts: 1
    };

    if (finalStatus === 'sent') {
      // Set next_retry_at for ACK timeout
      updateData.next_retry_at = new Date(Date.now() + ACK_TIMEOUT_SECONDS * 1000).toISOString();
    } else {
      updateData.failed_at = now;
      updateData.error_code = 'ALL_TOKENS_FAILED';
    }

    await supabase.from('fcm_messages')
      .update(updateData)
      .eq('message_id', messageId);

    console.log(`[FCM Send] Message ${messageId}: ${successCount}/${tokens.length} tokens sent`);

    return new Response(
      JSON.stringify({
        success: successCount > 0,
        data: {
          message_id: messageId,
          status: finalStatus,
          tokens_sent: successCount,
          tokens_total: tokens.length
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[FCM Send] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
