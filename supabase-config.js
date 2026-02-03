// Supabase 클라이언트 설정
// 주의: 아래 값들을 Supabase 프로젝트의 실제 값으로 변경하세요!

const SUPABASE_URL = 'https://xpgvtkakbyxbhwuyqpxg.supabase.co'; // 예: https://xxxxx.supabase.co
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhwZ3Z0a2FrYnl4Ymh3dXlxcHhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4NTE0MDMsImV4cCI6MjA4NTQyNzQwM30.iiKr9NjysYVibwWLjPTD6wcfEGA6OzCH_bNmVjSMwgo'; // 예: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

// Supabase 클라이언트 생성 및 전역 노출
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
window.supabase = supabaseClient;

// 전역 변수로도 할당 (kiosk.html 등에서 사용)
window.supabaseClient = supabaseClient;

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
