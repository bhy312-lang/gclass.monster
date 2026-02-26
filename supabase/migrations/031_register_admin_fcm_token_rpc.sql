-- 031: Robust admin FCM token registration RPC
-- 실행일: 2025-02-26
-- 목적: 관리자 FCM 토큰 등록을 원자적인 RPC로 처리하여 RLS/unique 충돌을 회피

-- 기존 함수가 있으면 삭제
DROP FUNCTION IF EXISTS public.register_admin_fcm_token(text, text);

-- 관리자 FCM 토큰 등록 RPC
create or replace function public.register_admin_fcm_token(
  p_fcm_token text,
  p_device_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_row_id uuid;
begin
  -- 인증 확인
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'UNAUTHENTICATED');
  end if;

  -- 토큰 값 확인
  if p_fcm_token is null or length(trim(p_fcm_token)) = 0 then
    return jsonb_build_object('success', false, 'error', 'EMPTY_TOKEN');
  end if;

  -- 1) 같은 토큰이 다른 admin에 붙어 있으면 비활성화 (토큰 takeover)
  update public.admin_fcm_tokens
  set is_active = false,
      updated_at = v_now
  where fcm_token = p_fcm_token
    and admin_id <> v_uid
    and is_active = true;

  -- 2) 내 토큰 row 있으면 활성화+갱신
  update public.admin_fcm_tokens
  set admin_id = v_uid,
      device_name = coalesce(p_device_name, device_name),
      is_active = true,
      last_used_at = v_now,
      updated_at = v_now
  where fcm_token = p_fcm_token
  returning id into v_row_id;

  -- 3) 없으면 insert
  if v_row_id is null then
    insert into public.admin_fcm_tokens (
      admin_id, fcm_token, device_name, is_active, last_used_at, updated_at
    ) values (
      v_uid, p_fcm_token, p_device_name, true, v_now, v_now
    )
    returning id into v_row_id;
  end if;

  return jsonb_build_object('success', true, 'token_id', v_row_id);
end;
$$;

-- 인증된 사용자에게 실행 권한 부여
grant execute on function public.register_admin_fcm_token(text, text) to authenticated;

-- 코멘트 추가
comment on function public.register_admin_fcm_token(text, text) is
'관리자 FCM 토큰을 원자적으로 등록/갱신합니다. 토큰 takeover 처리를 포함합니다.';
