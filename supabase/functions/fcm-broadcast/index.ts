// FCM Broadcast Edge Function
// Send notification to multiple recipients (bulk send)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { createFCMClient } from '../shared/fcm-client.ts';
import { generateMessageId } from '../shared/message-id-generator.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

interface BroadcastRequest {
  recipient_ids?: string[];
  academy_id?: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  priority?: 'normal' | 'high';
  target_type?: 'parent' | 'admin';
}

interface RecipientInfo {
  recipient_id: string;
  token_id: string;
  fcm_token: string;
}

const BATCH_SIZE = 100;
const CONCURRENCY = 10;
const ACK_TIMEOUT_SECONDS = 10;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const {
      recipient_ids,
      academy_id,
      type,
      title,
      body,
      data = {},
      priority = 'normal',
      target_type = 'parent'
    }: BroadcastRequest = await req.json();

    // Validate input
    if (!title || !body) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields: title, body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!recipient_ids?.length && !academy_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'Either recipient_ids or academy_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Generate message ID
    const messageId = generateMessageId();
    const now = new Date().toISOString();

    // Collect recipients
    let recipients: RecipientInfo[] = [];

    if (academy_id) {
      // Get all parents in academy
      const { data: academyParents } = await supabase.rpc('get_academy_parent_tokens', {
        p_academy_id: academy_id
      });

      if (academyParents) {
        recipients = academyParents.map((r: any) => ({
          recipient_id: r.parent_id,
          token_id: r.token_id,
          fcm_token: r.fcm_token
        }));
      }
    } else if (recipient_ids?.length) {
      // Get tokens for specific recipients
      const tokensTable = target_type === 'admin' ? 'admin_fcm_tokens' : 'parent_fcm_tokens';
      const userIdColumn = target_type === 'admin' ? 'admin_id' : 'parent_id';

      const { data: tokens } = await supabase
        .from(tokensTable)
        .select('id, fcm_token, ' + userIdColumn)
        .in(userIdColumn, recipient_ids)
        .eq('is_active', true);

      if (tokens) {
        recipients = tokens.map((t: any) => ({
          recipient_id: t[userIdColumn],
          token_id: t.id,
          fcm_token: t.fcm_token
        }));
      }
    }

    // Remove duplicates (same recipient may have multiple tokens)
    const uniqueRecipients = Array.from(
      new Map(recipients.map(r => [r.recipient_id + r.fcm_token, r])).values()
    );

    if (uniqueRecipients.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No active recipients found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create message record
    await supabase.from('fcm_messages').insert({
      message_id: messageId,
      message_type: type,
      title,
      body,
      data,
      priority,
      target_type: 'broadcast',
      academy_id,
      status: 'queued',
      queued_at: now
    });

    // Initialize FCM client
    let fcmClient: ReturnType<typeof createFCMClient>;
    try {
      fcmClient = createFCMClient();
    } catch (error) {
      await supabase.from('fcm_messages')
        .update({
          status: 'failed',
          error_code: 'FCM_NOT_CONFIGURED',
          failed_at: now
        })
        .eq('message_id', messageId);

      return new Response(
        JSON.stringify({ success: false, error: 'FCM not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Prepare recipient records for batch insert
    const recipientRecords = uniqueRecipients.map(r => ({
      message_id: messageId,
      recipient_id: r.recipient_id,
      fcm_token_id: target_type === 'parent' ? r.token_id : null,
      status: 'pending' as const,
      delivery_attempts: 0
    }));

    // Insert recipient records
    await supabase.from('fcm_message_recipients').insert(recipientRecords);

    // Process in batches with concurrency control
    let totalSent = 0;
    let totalFailed = 0;

    for (let i = 0; i < uniqueRecipients.length; i += BATCH_SIZE) {
      const batch = uniqueRecipients.slice(i, Math.min(i + BATCH_SIZE, uniqueRecipients.length));

      // Process batch with concurrency
      for (let j = 0; j < batch.length; j += CONCURRENCY) {
        const concurrentBatch = batch.slice(j, Math.min(j + CONCURRENCY, batch.length));

        const results = await Promise.allSettled(
          concurrentBatch.map(async (recipient) => {
            const result = await fcmClient.send({
              token: recipient.fcm_token,
              data: {
                message_id: messageId,
                type,
                ...data
              },
              notification: { title, body },
              android: {
                priority,
                ttl: '86400s',
                notification: { channel_id: type, sound: 'default' }
              }
            });

            // Update recipient record
            await supabase.from('fcm_message_recipients')
              .update({
                status: result.success ? 'sent' : 'failed',
                sent_at: result.success ? now : null,
                failed_at: result.success ? null : now,
                error_code: result.errorCode,
                delivery_attempts: 1
              })
              .eq('message_id', messageId)
              .eq('recipient_id', recipient.recipient_id);

            // Update token last_used_at on success
            if (result.success) {
              await supabase
                .from(target_type === 'admin' ? 'admin_fcm_tokens' : 'parent_fcm_tokens')
                .update({ last_used_at: now })
                .eq('id', recipient.token_id);
            } else {
              // Invalidate token if needed
              if (result.errorCode && fcmClient.shouldInvalidateToken(result.errorCode)) {
                await supabase
                  .from(target_type === 'admin' ? 'admin_fcm_tokens' : 'parent_fcm_tokens')
                  .update({ is_active: false, updated_at: now })
                  .eq('id', recipient.token_id);
              }
            }

            return { success: result.success, recipient_id: recipient.recipient_id };
          })
        );

        // Count results
        for (const result of results) {
          if (result.status === 'fulfilled') {
            if (result.value.success) totalSent++;
            else totalFailed++;
          } else {
            totalFailed++;
          }
        }
      }
    }

    // Update message status
    const finalStatus = totalSent > 0 ? 'sent' : 'failed';
    await supabase.from('fcm_messages')
      .update({
        status: finalStatus,
        sent_at: now,
        delivery_attempts: 1,
        next_retry_at: totalSent > 0 ? new Date(Date.now() + ACK_TIMEOUT_SECONDS * 1000).toISOString() : null,
        failed_at: totalSent === 0 ? now : null
      })
      .eq('message_id', messageId);

    console.log(`[FCM Broadcast] ${messageId}: ${totalSent}/${uniqueRecipients.length} sent, ${totalFailed} failed`);

    return new Response(
      JSON.stringify({
        success: totalSent > 0,
        data: {
          message_id: messageId,
          status: finalStatus,
          recipient_count: uniqueRecipients.length,
          sent_count: totalSent,
          failed_count: totalFailed
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[FCM Broadcast] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
