// Supabase 클라이언트 설정
// 주의: 아래 값들을 Supabase 프로젝트의 실제 값으로 변경하세요!

const SUPABASE_URL = 'https://xpgvtkakbyxbhwuyqpxg.supabase.co'; // 예: https://xxxxx.supabase.co
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhwZ3Z0a2FrYnl4Ymh3dXlxcHhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4NTE0MDMsImV4cCI6MjA4NTQyNzQwM30.iiKr9NjysYVibwWLjPTD6wcfEGA6OzCH_bNmVjSMwgo'; // 예: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

// 앱 환경인지 웹 환경인지 확인
function isCapacitorApp() {
    return window.Capacitor && window.Capacitor.getPlatform && window.Capacitor.getPlatform() !== 'web';
}

// OAuth 콜백 URL인지 확인
function hasOAuthCallback() {
    return window.location.hash.includes('access_token=') ||
           window.location.hash.includes('code=') ||
           window.location.search.includes('access_token=') ||
           window.location.search.includes('code=');
}

// Supabase 클라이언트 생성 및 전역 노출 (즉시 실행)
(function() {
    // supabase 라이브러리 참조 저장
    const supabaseLib = window.supabase;

    // 웹 환경에서 OAuth 콜백이 있으면 자동 감지, 앱에서는 수동 처리
    const detectSessionInUrl = !isCapacitorApp() && hasOAuthCallback();

    const supabaseClient = supabaseLib.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        db: {
            schema: 'public'
        },
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: detectSessionInUrl,
            flowType: 'implicit'
        },
        realtime: {
            params: {
                eventsPerSecond: 2
            }
        }
    });
    window.supabaseClient = supabaseClient;
    window.supabase = supabaseClient;

    console.log('[Supabase Config] 클라이언트 초기화 완료 (detectSessionInUrl:', detectSessionInUrl, ')');
})();

// 설정이 완료되었는지 확인
function isSupabaseConfigured() {
    return SUPABASE_URL !== 'YOUR_SUPABASE_URL' && SUPABASE_ANON_KEY !== 'YOUR_SUPABASE_ANON_KEY';
}

// 전역에서 접근 가능하도록 설정
window.isSupabaseConfigured = isSupabaseConfigured;

// 설정 확인 경고
if (!isSupabaseConfigured()) {
    console.warn('Supabase가 설정되지 않았습니다. supabase-config.js 파일에서 SUPABASE_URL과 SUPABASE_ANON_KEY를 설정하세요.');
}
