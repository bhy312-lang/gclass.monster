// FCM Token Registration Edge Function
// Register or update parent/admin FCM tokens

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

interface TokenRequest {
  fcm_token: string;
  device_info?: {
    platform?: 'ios' | 'android';
    os_version?: string;
    app_version?: string;
    device_id?: string;
    device_model?: string;
  };
  user_type?: 'parent' | 'admin';
}

interface TokenResponse {
  id: string;
  fcm_token: string;
  is_active: boolean;
  last_used_at: string;
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
    const { fcm_token, device_info = {}, user_type = 'parent' }: TokenRequest = await req.json();

    // Validate input
    if (!fcm_token || typeof fcm_token !== 'string' || fcm_token.length < 50) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid FCM token format' }),
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

    const userId = user.id;
    const tableName = user_type === 'admin' ? 'admin_fcm_tokens' : 'parent_fcm_tokens';
    const userIdColumn = user_type === 'admin' ? 'admin_id' : 'parent_id';

    // Check if token already exists for this user
    const { data: existing } = await supabase
      .from(tableName)
      .select('*')
      .eq(userIdColumn, userId)
      .eq('fcm_token', fcm_token)
      .maybeSingle();

    const now = new Date().toISOString();

    if (existing) {
      // Reactivate if inactive and update last_used_at
      const { data: updated } = await supabase
        .from(tableName)
        .update({
          is_active: true,
          device_info: device_info,
          last_used_at: now,
          updated_at: now
        })
        .eq('id', existing.id)
        .select('id, fcm_token, is_active, last_used_at')
        .single();

      return new Response(
        JSON.stringify({
          success: true,
          data: updated
        } as { success: boolean; data: TokenResponse }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Insert new token record
    const { data: newToken, error: insertError } = await supabase
      .from(tableName)
      .insert({
        [userIdColumn]: userId,
        fcm_token,
        device_info: device_info,
        is_active: true,
        last_used_at: now
      })
      .select('id, fcm_token, is_active, last_used_at')
      .single();

    if (insertError) {
      console.error('[FCM Token Register] Insert error:', insertError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to register token' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[FCM Token Register] Token registered for ${user_type}:`, userId);

    return new Response(
      JSON.stringify({
        success: true,
        data: newToken
      } as { success: boolean; data: TokenResponse }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[FCM Token Register] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
