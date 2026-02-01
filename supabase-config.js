// Supabase 클라이언트 설정
// 주의: 아래 값들을 Supabase 프로젝트의 실제 값으로 변경하세요!

const SUPABASE_URL = 'YOUR_SUPABASE_URL'; // 예: https://xxxxx.supabase.co
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY'; // 예: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

// 설정이 완료되었는지 확인
function isSupabaseConfigured() {
    return typeof SUPABASE_URL !== 'undefined' &&
           SUPABASE_URL !== 'YOUR_SUPABASE_URL' &&
           typeof SUPABASE_ANON_KEY !== 'undefined' &&
           SUPABASE_ANON_KEY !== 'YOUR_SUPABASE_ANON_KEY';
}

// 전역에서 접근 가능하도록 설정
window.isSupabaseConfigured = isSupabaseConfigured;

// Supabase 클라이언트 생성 (설정된 경우에만)
let supabase;
if (isSupabaseConfigured()) {
    if (!window.supabaseClient) {
        window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    supabase = window.supabaseClient;
} else {
    // 데모 모드: 더미 클라이언트 생성 (실제로는 사용되지 않음)
    supabase = {
        from: () => ({
            select: () => ({ data: null, error: new Error('Supabase not configured') }),
            insert: () => ({ data: null, error: new Error('Supabase not configured') }),
            update: () => ({ data: null, error: new Error('Supabase not configured') }),
            delete: () => ({ data: null, error: new Error('Supabase not configured') })
        })
    };
}

// 설정 확인 경고
if (!isSupabaseConfigured()) {
    console.warn('Supabase가 설정되지 않았습니다. 데모 모드로 실행됩니다.');
}
