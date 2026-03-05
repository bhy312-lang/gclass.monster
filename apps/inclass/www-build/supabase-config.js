// Supabase 클라이언트 설정
const SUPABASE_URL = 'https://xpgvtkakbyxbhwuyqpxg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhwZ3Z0a2FrYnl4Ymh3dXlxcHhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4NTE0MDMsImV4cCI6MjA4NTQyNzQwM30.iiKr9NjysYVibwWLjPTD6wcfEGA6OzCH_bNmVjSMwgo';

// 앱 환경인지 확인
function isCapacitorApp_Config() {
    return window.Capacitor && window.Capacitor.getPlatform && window.Capacitor.getPlatform() !== 'web';
}

// Supabase 클라이언트 생성 (CDN의 window.supabase 사용)
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    db: {
        schema: 'public'
    },
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,  // 수동 처리 (appUrlOpen + exchangeCodeForSession)
        flowType: 'pkce',
        storage: window.localStorage
    },
    realtime: {
        params: {
            eventsPerSecond: 2
        }
    }
});

// 전역으로 내보내기
window.supabaseClient = supabaseClient;
window.supabase = supabaseClient;
window.isCapacitorApp_Config = isCapacitorApp_Config;

console.log('[Supabase Config] 클라이언트 초기화 완료 (isApp:', isCapacitorApp_Config(), ')');
