// Supabase 클라이언트 설정
// 주의: 아래 값들을 Supabase 프로젝트의 실제 값으로 변경하세요!

const SUPABASE_URL = 'YOUR_SUPABASE_URL'; // 예: https://xxxxx.supabase.co
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY'; // 예: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

// Supabase 클라이언트 생성
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 설정이 완료되었는지 확인
function isSupabaseConfigured() {
    return SUPABASE_URL !== 'YOUR_SUPABASE_URL' && SUPABASE_ANON_KEY !== 'YOUR_SUPABASE_ANON_KEY';
}

// 설정 확인 경고
if (!isSupabaseConfigured()) {
    console.warn('Supabase가 설정되지 않았습니다. supabase-config.js 파일에서 SUPABASE_URL과 SUPABASE_ANON_KEY를 설정하세요.');
}
