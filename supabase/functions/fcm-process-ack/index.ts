// FCM ACK Processing Edge Function
// Process delivery acknowledgments from client apps

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

interface AckRequest {
  message_id: string;
  ack_type: 'delivered' | 'read' | 'dismissed';
  client_timestamp: string;
  app_state?: Record<string, unknown>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const { message_id, ack_type, client_timestamp, app_state = {} }: AckRequest = await req.json();

    // Validate input
    if (!message_id || !ack_type) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields: message_id, ack_type' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!['delivered', 'read', 'dismissed'].includes(ack_type)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid ack_type' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid authentication token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const recipient_id = user.id;
    const now = new Date().toISOString();

    // Get active FCM token for this user (parent tokens)
    const { data: tokenRecord } = await supabase
      .from('parent_fcm_tokens')
      .select('id')
      .eq('parent_id', recipient_id)
      .eq('is_active', true)
      .order('last_used_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Record acknowledgment
    await supabase.from('fcm_acknowledgments').insert({
      message_id,
      recipient_id,
      fcm_token_id: tokenRecord?.id || null,
      ack_type,
      client_timestamp,
      app_state,
      server_received_at: now
    });

    // Update message status based on ACK type
    const messageUpdate: Record<string, unknown> = {};
    const recipientUpdate: Record<string, unknown> = {};

    if (ack_type === 'delivered') {
      messageUpdate.status = 'delivered';
      messageUpdate.delivered_at = now;
      messageUpdate.next_retry_at = null; // Cancel retry
      recipientUpdate.status = 'delivered';
      recipientUpdate.delivered_at = now;
    } else if (ack_type === 'read') {
      messageUpdate.status = 'read';
      messageUpdate.read_at = now;
      messageUpdate.delivered_at = now; // Ensure delivered is set
      messageUpdate.next_retry_at = null;
      recipientUpdate.status = 'read';
    } else if (ack_type === 'dismissed') {
      // Dismissed counts as delivered
      messageUpdate.status = 'delivered';
      messageUpdate.delivered_at = now;
      messageUpdate.next_retry_at = null;
      recipientUpdate.status = 'delivered';
      recipientUpdate.delivered_at = now;
    }

    // Update main message (only if this is the target recipient)
    await supabase
      .from('fcm_messages')
      .update(messageUpdate)
      .eq('message_id', message_id)
      .eq('target_id', recipient_id);

    // Update recipient record (for broadcast messages)
    await supabase
      .from('fcm_message_recipients')
      .update(recipientUpdate)
      .eq('message_id', message_id)
      .eq('recipient_id', recipient_id);

    console.log(`[FCM ACK] ${message_id} - ${ack_type} by ${recipient_id}`);

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          acknowledged: true,
          message_status: messageUpdate.status
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[FCM ACK] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
