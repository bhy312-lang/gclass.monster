// Supabase 클라이언트 설정
// 주의: 아래 값들을 Supabase 프로젝트의 실제 값으로 변경하세요!

const SUPABASE_URL = 'https://xpgvtkakbyxbhwuyqpxg.supabase.co'; // 예: https://xxxxx.supabase.co
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhwZ3Z0a2FrYnl4Ymh3dXlxcHhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4NTE0MDMsImV4cCI6MjA4NTQyNzQwM30.iiKr9NjysYVibwWLjPTD6wcfEGA6OzCH_bNmVjSMwgo'; // 예: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

// Supabase 클라이언트 생성 및 전역 노출 (즉시 실행)
(function() {
    // 타임아웃이 있는 fetch 래퍼 함수 (기존 signal 존중)
    function createFetchWithTimeout(timeoutMs) {
        return async (url, options = {}) => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

            // 기존 signal과 타임아웃 signal을 병합
            const originalSignal = options.signal;
            const signals = [controller.signal];
            if (originalSignal) {
                signals.push(originalSignal);
            }

            //任何一个 signal 中止时中止
            function abortOnAny(signal) {
                signal.addEventListener('abort', () => {
                    controller.abort();
                });
            }

            signals.forEach(abortOnAny);

            try {
                const response = await fetch(url, {
                    ...options,
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
                return response;
            } catch (error) {
                clearTimeout(timeoutId);
                // 기존 signal에 의한 중단인지 타임아웃인지 구분
                if (error.name === 'AbortError') {
                    // originalSignal이 이미 중단되었는지 확인
                    if (originalSignal && originalSignal.aborted) {
                        throw error; // 기존 signal에 의한 중단은 그대로 전파
                    }
                    throw new Error(`Request timeout after ${timeoutMs}ms`);
                }
                throw error;
            }
        };
    }

    const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        db: {
            schema: 'public'
        },
        auth: {
            persistSession: true,
            autoRefreshToken: true
        },
        global: {
            fetch: createFetchWithTimeout(60000) // 60초 타임아웃으로 증가
        }
    });
    window.supabaseClient = supabaseClient;
    window.supabase = supabaseClient;

    console.log('[Supabase Config] 클라이언트 초기화 완료 (타임아웃: 60초)');
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
