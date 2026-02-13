import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Google OAuth2 액세스 토큰 생성
async function getAccessToken(serviceAccount: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const exp = now + 3600

  // JWT 헤더
  const header = {
    alg: 'RS256',
    typ: 'JWT'
  }

  // JWT 페이로드
  const payload = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: exp
  }

  // Base64URL 인코딩
  const base64url = (data: any) => {
    const json = JSON.stringify(data)
    const base64 = btoa(json)
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
  }

  const headerB64 = base64url(header)
  const payloadB64 = base64url(payload)
  const unsignedToken = `${headerB64}.${payloadB64}`

  // RSA-SHA256 서명
  const privateKey = serviceAccount.private_key
  const encoder = new TextEncoder()
  const data = encoder.encode(unsignedToken)

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    pemToBinary(privateKey),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, data)
  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

  const jwt = `${unsignedToken}.${signatureB64}`

  // 액세스 토큰 요청
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  })

  const tokenData = await tokenResponse.json()
  return tokenData.access_token
}

// PEM을 바이너리로 변환
function pemToBinary(pem: string): ArrayBuffer {
  const lines = pem.split('\n')
  const base64 = lines.filter(line => !line.includes('-----')).join('')
  const binary = atob(base64)
  const buffer = new ArrayBuffer(binary.length)
  const view = new Uint8Array(buffer)
  for (let i = 0; i < binary.length; i++) {
    view[i] = binary.charCodeAt(i)
  }
  return buffer
}

serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { student_id, parent_phone, type, student_name } = await req.json()

    // 하이픈 제거 (010-1234-5678 → 01012345678)
    const phoneNumber = parent_phone ? parent_phone.replace(/-/g, '') : ''

    console.log('Push request:', { student_id, parent_phone, phoneNumber, type, student_name })

    // Supabase 클라이언트 생성
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // 하이픈 제거된 전화번호로 토큰 조회
    const { data: tokenData, error: tokenError } = await supabase
      .from('push_tokens')
      .select('token')
      .eq('phone_number', phoneNumber)
      .single()

    if (tokenError || !tokenData?.token) {
      console.log('Token not found for phone_number:', phoneNumber)
      return new Response(JSON.stringify({ error: 'Token not found', phone: phoneNumber }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 404
      })
    }

    // 서비스 계정 정보
    const serviceAccount = {
      project_id: Deno.env.get('FCM_PROJECT_ID'),
      client_email: Deno.env.get('FCM_CLIENT_EMAIL'),
      private_key: Deno.env.get('FCM_PRIVATE_KEY')?.replace(/\\n/g, '\n')
    }

    if (!serviceAccount.project_id || !serviceAccount.client_email || !serviceAccount.private_key) {
      console.error('FCM credentials not configured')
      return new Response(JSON.stringify({ error: 'FCM not configured' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      })
    }

    // 액세스 토큰 생성
    const accessToken = await getAccessToken(serviceAccount)

    // 알림 메시지 구성
    const title = type === 'check_in' ? '등원 알림' : '하원 알림'
    const body = type === 'check_in'
      ? `${student_name} 학생이 등원했습니다.`
      : `${student_name} 학생이 하원했습니다.`

    // FCM v1 API 호출
    const fcmUrl = `https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`

    const fcmResponse = await fetch(fcmUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: {
          token: tokenData.token,
          notification: {
            title: title,
            body: body
          },
          android: {
            priority: 'high'
          }
        }
      })
    })

    const fcmResult = await fcmResponse.json()
    console.log('FCM response:', fcmResult)

    if (!fcmResponse.ok) {
      return new Response(JSON.stringify({ error: 'FCM send failed', details: fcmResult }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      })
    }

    return new Response(JSON.stringify({ success: true, result: fcmResult }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    })
  }
})
