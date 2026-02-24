// Kakao Native Token -> Supabase Session Edge Function
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface KakaoUser {
  id: number;
  properties: {
    nickname: string;
    profile_image: string;
  };
  kakao_account: {
    email?: string;
  };
}

Deno.serve(async (req) => {
  // CORS handling
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  try {
    const { kakaoAccessToken } = await req.json();

    if (!kakaoAccessToken) {
      throw new Error('kakaoAccessToken is required');
    }

    // 1. Kakao 토큰 검증 및 사용자 정보 가져오기
    const kakaoResponse = await fetch('https://kapi.kakao.com/v2/user/me', {
      headers: {
        'Authorization': `Bearer ${kakaoAccessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!kakaoResponse.ok) {
      throw new Error('Invalid Kakao token');
    }

    const kakaoUser: KakaoUser = await kakaoResponse.json();
    console.log('Kakao user:', kakaoUser.id);

    // 2. Supabase Admin 클라이언트 생성
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // 3. Kakao ID로 사용자 생성/조회
    const email = kakaoUser.kakao_account?.email || `${kakaoUser.id}@kakao.local`;

    // 먼저 사용자가 있는지 확인
    const { data: existingUsers } = await supabase
      .from('profiles')
      .select('id, email, user_id')
      .eq('kakao_id', kakaoUser.id)
      .limit(1);

    let userId;

    if (existingUsers && existingUsers.length > 0) {
      // 기존 사용자 있음
      userId = existingUsers[0].user_id;
      console.log('Existing user found:', userId);
    } else {
      // 신규 사용자 생성
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: {
          kakao_id: kakaoUser.id,
          full_name: kakaoUser.properties.nickname,
          avatar_url: kakaoUser.properties.profile_image,
          provider: 'kakao',
        },
      });

      if (createError) {
        // 사용자가 이미 존재할 수 있음 (이메일로 검색)
        const { data: { users } } = await supabase.auth.admin.listUsers();
        const existingUser = users.find(u => u.email === email);
        if (existingUser) {
          userId = existingUser.id;
          console.log('User already exists:', userId);
        } else {
          throw createError;
        }
      } else {
        userId = newUser.user.id;
        console.log('New user created:', userId);

        // profiles 테이블에 kakao_id 저장
        await supabase
          .from('profiles')
          .upsert({
            user_id: userId,
            kakao_id: kakaoUser.id,
            email: email,
            full_name: kakaoUser.properties.nickname,
            avatar_url: kakaoUser.properties.profile_image,
            provider: 'kakao',
          });
      }
    }

    // 4. OTP 링크 생성 (매직링크 타입) - 브라우저 없이 세션 생성
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: email,
      options: {
        redirectTo: 'inclassadmin://auth/callback',
      }
    });

    if (linkError) {
      console.error('generateLink error:', linkError);
      throw linkError;
    }

    // action_link에서 token_hash 추출
    // URL 형식: https://.../auth/v1/verify?token_hash=xxx&type=magiclink
    const props = linkData?.properties ?? {};
    const actionLink = props.action_link || '';
    let tokenHash =
      props.hashed_token ||
      props.email_otp ||
      null;

    if (!tokenHash && actionLink) {
      try {
        const parsed = new URL(actionLink);
        tokenHash =
          parsed.searchParams.get('token_hash') ||
          parsed.searchParams.get('token') ||
          null;
      } catch (e) {
        console.error('Failed to parse action_link URL:', actionLink, e);
      }
    }

    if (!tokenHash) {
      console.error('Failed to extract token_hash. linkData:', JSON.stringify(linkData));
      throw new Error('Failed to extract token_hash from generated link');
    }

    console.log('Generated OTP for user:', userId);

    return new Response(JSON.stringify({
      ok: true,
      email: email,
      token_hash: tokenHash,
      type: 'email',
      user_metadata: {
        kakao_id: kakaoUser.id,
        full_name: kakaoUser.properties.nickname,
        avatar_url: kakaoUser.properties.profile_image,
        provider: 'kakao',
      }
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (error) {
    console.error('Kakao auth error:', error);
    return new Response(JSON.stringify({
      error: error.message || 'Unknown error',
    }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
});
