// 인증 관련 스토리지 정리 공용 함수
function clearAuthStorage() {
    // 앱 인증 키
    const authKeys = ['isLoggedIn', 'userId', 'userName', 'userEmail',
                      'userPhoto', 'userPhone'];
    authKeys.forEach(key => localStorage.removeItem(key));

    // Supabase 세션 키 제거 (키를 먼저 수집 후 삭제 - 인덱스 꼬임 방지)
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        // sb-...-auth-token 패턴, code-verifier, supabase.* 키 제거
        if (key?.match(/(^sb-.*-auth-token$)|code-verifier|^supabase\./)) {
            keysToRemove.push(key);
        }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
}

// 로그아웃 함수 (global + local fallback)
async function performLogout() {
    // supabase 미초기화 상황 대비
    if (!window.supabase?.auth) {
        clearAuthStorage();
        return;
    }

    try {
        // global 로그아웃 시도 (서버 토큰 무효화)
        await window.supabase.auth.signOut();
    } catch (error) {
        console.warn('Global logout failed, trying local only:', error);
        try {
            // 실패 시 local만 로그아웃
            await window.supabase.auth.signOut({ scope: 'local' });
        } catch (localError) {
            console.error('Local logout also failed:', localError);
        }
    } finally {
        // 인증 스토리지 정리
        clearAuthStorage();
    }
}
