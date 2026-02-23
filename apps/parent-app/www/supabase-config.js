// Supabase 클라이언트 설정
// 주의: 아래 값들을 Supabase 프로젝트의 실제 값으로 변경하세요!

const SUPABASE_URL = 'https://xpgvtkakbyxbhwuyqpxg.supabase.co'; // 예: https://xxxxx.supabase.co
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhwZ3Z0a2FrYnl4Ymh3dXlxcHhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4NTE0MDMsImV4cCI6MjA4NTQyNzQwM30.iiKr9NjysYVibwWLjPTD6wcfEGA6OzCH_bNmVjSMwgo'; // 예: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

// 앱 환경인지 확인
function isCapacitorApp_Config() {
    return window.Capacitor && window.Capacitor.getPlatform && window.Capacitor.getPlatform() !== 'web';
}

// 로컬 개발 환경인지 확인 (localhost, 127.0.0.1, 192.168.x.x 등)
function isLocalDev() {
    const hostname = window.location.hostname;
    return hostname === 'localhost' ||
           hostname === '127.0.0.1' ||
           hostname.startsWith('192.168.') ||
           hostname.startsWith('10.') ||
           hostname.startsWith('172.');
}

// Supabase 클라이언트 생성 및 전역 노출 (즉시 실행)
(function() {
    const supabaseLib = window.supabase;

    // 로컬 개발 환경에서는 implicit, 프로덕션에서는 pkce 사용
    const flowType = isLocalDev() ? 'implicit' : 'pkce';
    console.log('[Supabase Config] 환경:', isLocalDev() ? '로컬 개발 (implicit)' : '프로덕션 (pkce)');

    const supabaseClient = supabaseLib.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        db: {
            schema: 'public'
        },
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,  // 웹/앱 모두 true (Supabase v2가 자동 처리)
            flowType: flowType,  // 로컬: implicit, 프로덕션: pkce
            storage: window.localStorage  // 명시적으로 localStorage 사용
        },
        realtime: {
            params: {
                eventsPerSecond: 2
            }
        }
    });
    window.supabaseClient = supabaseClient;
    window.supabase = supabaseClient;

    console.log('[Supabase Config] 클라이언트 초기화 완료 (flowType:', flowType + ')');
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
