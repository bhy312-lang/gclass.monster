// FCM Token Cleanup Edge Function
// Mark inactive tokens and delete old tokens
// Run this function daily via cron or scheduled task

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const INACTIVE_DAYS = 90;
const HARD_DELETE_DAYS = 180;
const RECENT_FAILURE_DAYS = 7;
const CONSECUTIVE_FAILURE_THRESHOLD = 3;

serve(async (_req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  console.log('[Token Cleanup] Starting token cleanup process');

  const now = new Date().toISOString();
  const inactiveThreshold = new Date(Date.now() - INACTIVE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const hardDeleteThreshold = new Date(Date.now() - HARD_DELETE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const recentFailureThreshold = new Date(Date.now() - RECENT_FAILURE_DAYS * 24 * 60 * 60 * 1000).toISOString();

  let parentTokensMarkedInactive = 0;
  let adminTokensMarkedInactive = 0;
  let parentTokensDeleted = 0;
  let adminTokensDeleted = 0;

  // =====================================================
  // 1. Mark parent tokens inactive
  // =====================================================

  // 1a. Mark tokens not used in INACTIVE_DAYS
  const { data: oldParentTokens } = await supabase
    .from('parent_fcm_tokens')
    .select('id')
    .eq('is_active', true)
    .lt('last_used_at', inactiveThreshold);

  if (oldParentTokens && oldParentTokens.length > 0) {
    const { error } = await supabase
      .from('parent_fcm_tokens')
      .update({ is_active: false, updated_at: now })
      .in('id', oldParentTokens.map(t => t.id));

    if (!error) {
      parentTokensMarkedInactive = oldParentTokens.length;
      console.log(`[Token Cleanup] Marked ${parentTokensMarkedInactive} old parent tokens inactive`);
    }
  }

  // 1b. Mark tokens with 3+ consecutive failures in recent days
  const { data: failedTokensResult } = await supabase
    .from('fcm_message_recipients')
    .select('fcm_token_id')
    .eq('status', 'failed')
    .gt('created_at', recentFailureThreshold);

  if (failedTokensResult) {
    // Count failures per token
    const failureCounts = new Map<string, number>();
    for (const record of failedTokensResult) {
      if (record.fcm_token_id) {
        failureCounts.set(
          record.fcm_token_id,
          (failureCounts.get(record.fcm_token_id) || 0) + 1
        );
      }
    }

    // Mark tokens with threshold+ failures
    const tokensToMark = Array.from(failureCounts.entries())
      .filter(([_, count]) => count >= CONSECUTIVE_FAILURE_THRESHOLD)
      .map(([tokenId, _]) => tokenId);

    if (tokensToMark.length > 0) {
      const { error } = await supabase
        .from('parent_fcm_tokens')
        .update({ is_active: false, updated_at: now })
        .in('id', tokensToMark);

      if (!error) {
        parentTokensMarkedInactive += tokensToMark.length;
        console.log(`[Token Cleanup] Marked ${tokensToMark.length} failed parent tokens inactive`);
      }
    }
  }

  // =====================================================
  // 2. Mark admin tokens inactive
  // =====================================================

  const { data: oldAdminTokens } = await supabase
    .from('admin_fcm_tokens')
    .select('id')
    .eq('is_active', true)
    .lt('last_used_at', inactiveThreshold);

  if (oldAdminTokens && oldAdminTokens.length > 0) {
    const { error } = await supabase
      .from('admin_fcm_tokens')
      .update({ is_active: false, updated_at: now })
      .in('id', oldAdminTokens.map(t => t.id));

    if (!error) {
      adminTokensMarkedInactive = oldAdminTokens.length;
      console.log(`[Token Cleanup] Marked ${adminTokensMarkedInactive} old admin tokens inactive`);
    }
  }

  // =====================================================
  // 3. Hard delete very old inactive tokens
  // =====================================================

  const { data: oldParentTokensToDelete } = await supabase
    .from('parent_fcm_tokens')
    .select('id')
    .eq('is_active', false)
    .lt('updated_at', hardDeleteThreshold);

  if (oldParentTokensToDelete && oldParentTokensToDelete.length > 0) {
    const { error } = await supabase
      .from('parent_fcm_tokens')
      .delete()
      .in('id', oldParentTokensToDelete.map(t => t.id));

    if (!error) {
      parentTokensDeleted = oldParentTokensToDelete.length;
      console.log(`[Token Cleanup] Deleted ${parentTokensDeleted} old parent tokens`);
    }
  }

  const { data: oldAdminTokensToDelete } = await supabase
    .from('admin_fcm_tokens')
    .select('id')
    .eq('is_active', false)
    .lt('updated_at', hardDeleteThreshold);

  if (oldAdminTokensToDelete && oldAdminTokensToDelete.length > 0) {
    const { error } = await supabase
      .from('admin_fcm_tokens')
      .delete()
      .in('id', oldAdminTokensToDelete.map(t => t.id));

    if (!error) {
      adminTokensDeleted = oldAdminTokensToDelete.length;
      console.log(`[Token Cleanup] Deleted ${adminTokensDeleted} old admin tokens`);
    }
  }

  // =====================================================
  // 4. Cleanup old message records (optional)
  // =====================================================

  const messageRetentionDays = 90;
  const messageCutoff = new Date(Date.now() - messageRetentionDays * 24 * 60 * 60 * 1000).toISOString();

  // Delete old messages
  const { data: oldMessages } = await supabase
    .from('fcm_messages')
    .select('id')
    .lt('created_at', messageCutoff)
    .in('status', ['delivered', 'read', 'failed']);

  if (oldMessages && oldMessages.length > 0) {
    const { error } = await supabase
      .from('fcm_messages')
      .delete()
      .in('id', oldMessages.map(m => m.id));

    if (!error) {
      console.log(`[Token Cleanup] Deleted ${oldMessages.length} old message records`);
    }
  }

  // Delete old acknowledgments
  const { data: oldAcks } = await supabase
    .from('fcm_acknowledgments')
    .select('id')
    .lt('created_at', messageCutoff);

  if (oldAcks && oldAcks.length > 0) {
    const { error } = await supabase
      .from('fcm_acknowledgments')
      .delete()
      .in('id', oldAcks.map(a => a.id));

    if (!error) {
      console.log(`[Token Cleanup] Deleted ${oldAcks.length} old acknowledgment records`);
    }
  }

  // =====================================================
  // 5. Return summary
  // =====================================================

  const summary = {
    success: true,
    data: {
      parent_tokens_marked_inactive: parentTokensMarkedInactive,
      admin_tokens_marked_inactive: adminTokensMarkedInactive,
      parent_tokens_deleted: parentTokensDeleted,
      admin_tokens_deleted: adminTokensDeleted,
      total_marked_inactive: parentTokensMarkedInactive + adminTokensMarkedInactive,
      total_deleted: parentTokensDeleted + adminTokensDeleted,
      cleanup_timestamp: now
    }
  };

  console.log('[Token Cleanup] Completed:', summary.data);

  return new Response(
    JSON.stringify(summary),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
