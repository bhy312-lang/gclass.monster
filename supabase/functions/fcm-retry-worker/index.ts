// FCM Retry Worker Edge Function
// Retry messages that haven't received ACK within timeout
// Run this function periodically via cron or scheduled task

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { createFCMClient } from '../shared/fcm-client.ts';

const ACK_TIMEOUT_SECONDS = 10;
const MAX_RETRY_ATTEMPTS = 1;

serve(async (_req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  console.log('[Retry Worker] Starting retry process');

  // Find messages that need retry:
  // 1. Status is 'sent' (no ACK received yet)
  // 2. Sent more than ACK_TIMEOUT_SECONDS ago
  // 3. Delivery attempts < MAX_RETRY_ATTEMPTS
  const cutoffTime = new Date(Date.now() - ACK_TIMEOUT_SECONDS * 1000).toISOString();

  const { data: messagesToRetry, error: queryError } = await supabase
    .from('fcm_messages')
    .select('*')
    .eq('status', 'sent')
    .lt('sent_at', cutoffTime)
    .lt('delivery_attempts', MAX_RETRY_ATTEMPTS)
    .order('sent_at', { ascending: true })
    .limit(100);

  if (queryError) {
    console.error('[Retry Worker] Query error:', queryError);
    return new Response(
      JSON.stringify({ success: false, error: 'Database query failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (!messagesToRetry || messagesToRetry.length === 0) {
    console.log('[Retry Worker] No messages to retry');
    return new Response(
      JSON.stringify({ success: true, retried: 0, processed: 0 }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  }

  console.log(`[Retry Worker] Found ${messagesToRetry.length} messages to retry`);

  // Initialize FCM client
  let fcmClient: ReturnType<typeof createFCMClient> | null = null;
  try {
    fcmClient = createFCMClient();
  } catch (error) {
    console.error('[Retry Worker] FCM client error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'FCM not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let retriedCount = 0;
  const now = new Date().toISOString();

  for (const message of messagesToRetry) {
    try {
      const tokensTable = message.target_type === 'admin' ? 'admin_fcm_tokens' : 'parent_fcm_tokens';
      const tokenRelation = message.target_type === 'admin'
        ? 'admin_fcm_tokens!inner(fcm_token)'
        : 'parent_fcm_tokens!inner(fcm_token)';

      // Get recipients that haven't acknowledged (still in sent/pending status)
      // Use dynamic join based on target_type to support both admin and parent tokens
      const { data: pendingRecipients } = await supabase
        .from('fcm_message_recipients')
        .select(`*, ${tokenRelation}`)
        .eq('message_id', message.id)
        .in('status', ['sent', 'pending']);

      if (!pendingRecipients || pendingRecipients.length === 0) {
        // All recipients may have acknowledged, check message status
        const { data: acks } = await supabase
          .from('fcm_acknowledgments')
          .select('*')
          .eq('message_id', message.message_id)
          .limit(1);

        if (acks && acks.length > 0) {
          // ACK exists, update message
          await supabase
            .from('fcm_messages')
            .update({
              status: 'delivered',
              delivered_at: acks[0].server_received_at,
              next_retry_at: null
            })
            .eq('id', message.id);
          console.log(`[Retry Worker] Message ${message.message_id} already acknowledged`);
        }
        continue;
      }

      // Retry sending to pending recipients
      let successCount = 0;
      for (const recipient of pendingRecipients) {
        // Extract token based on target_type
        const token = message.target_type === 'admin'
          ? (recipient as any).admin_fcm_tokens?.fcm_token
          : (recipient as any).parent_fcm_tokens?.fcm_token;
        if (!token) continue;

        const result = await fcmClient!.send({
          token: token,
          data: {
            message_id: message.message_id,
            type: message.message_type,
            ...(message.data as Record<string, string>)
          },
          notification: {
            title: message.title,
            body: message.body
          },
          android: {
            priority: message.priority,
            ttl: '86400s',
            notification: { channel_id: message.message_type, sound: 'default' }
          }
        });

        // Update recipient record
        const newAttempts = (recipient.delivery_attempts || 0) + 1;
        await supabase
          .from('fcm_message_recipients')
          .update({
            status: result.success ? 'sent' : 'failed',
            delivery_attempts: newAttempts,
            sent_at: result.success ? now : recipient.sent_at,
            failed_at: result.success ? null : now,
            error_code: result.errorCode
          })
          .eq('id', recipient.id);

        // Update token last_used_at on success
        if (result.success) {
          await supabase
            .from(tokensTable)
            .update({ last_used_at: now })
            .eq('fcm_token', token);
          successCount++;
        } else {
          // Invalidate token if needed
          if (result.errorCode && fcmClient!.shouldInvalidateToken(result.errorCode)) {
            await supabase
              .from(tokensTable)
              .update({ is_active: false, updated_at: now })
              .eq('fcm_token', token);
          }
        }
      }

      // Update message attempts
      const newDeliveryAttempts = message.delivery_attempts + 1;
      const updateData: any = {
        delivery_attempts: newDeliveryAttempts
      };

      if (newDeliveryAttempts >= MAX_RETRY_ATTEMPTS) {
        // No more retries, determine final status
        const { data: allRecipients } = await supabase
          .from('fcm_message_recipients')
          .select('status')
          .eq('message_id', message.id);

        const hasSuccess = allRecipients?.some(r => r.status === 'sent' || r.status === 'delivered');

        if (hasSuccess) {
          updateData.status = 'sent'; // At least one delivery succeeded
          updateData.next_retry_at = null;
        } else {
          updateData.status = 'failed';
          updateData.failed_at = now;
          updateData.error_code = 'MAX_RETRIES_EXCEEDED';
          updateData.next_retry_at = null;
        }
      } else {
        updateData.next_retry_at = new Date(Date.now() + ACK_TIMEOUT_SECONDS * 1000).toISOString();
      }

      await supabase
        .from('fcm_messages')
        .update(updateData)
        .eq('id', message.id);

      retriedCount++;
      console.log(`[Retry Worker] Retried ${message.message_id}: ${successCount}/${pendingRecipients.length} sent`);

    } catch (error) {
      console.error(`[Retry Worker] Error retrying message ${message.message_id}:`, error);
    }
  }

  console.log(`[Retry Worker] Completed: ${retriedCount}/${messagesToRetry.length} messages retried`);

  return new Response(
    JSON.stringify({
      success: true,
      retried: retriedCount,
      processed: messagesToRetry.length
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
