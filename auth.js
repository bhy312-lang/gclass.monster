// 인증 관련 함수들

// 현재 로그인된 사용자 정보
let currentUser = null;
let currentProfile = null;

// ================================================
// Redirect URL 관리 함수들
// ================================================

// URL에서 redirect 파라미터 추출
function getRedirectUrl(defaultUrl = 'index.html') {
    const params = new URLSearchParams(window.location.search);
    const redirect = params.get('redirect');
    // 외부 URL 방지: 같은 도메인인지 확인
    if (redirect) {
        try {
            const url = new URL(redirect, window.location.origin);
            if (url.origin === window.location.origin) {
                return redirect;
            }
        } catch (e) {
            // 무효한 URL이면 기본값 사용
        }
    }
    return defaultUrl;
}

// 로그인이 필요한 경우 redirect URL과 함께 login.html로 이동
function requireAuth() {
    const currentPath = window.location.pathname + window.location.search;
    window.location.href = `login.html?redirect=${encodeURIComponent(currentPath)}`;
}

// 로그인이 필요한지 확인하고 필요하면 로그인 페이지로 이동
async function checkAuthAndRedirect() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
        requireAuth();
        return false;
    }
    return true;
}

// 인증 상태 변경 리스너
supabase.auth.onAuthStateChange(async (event, session) => {
    console.log('Auth state changed:', event);

    if (session?.user) {
        currentUser = session.user;
        await loadUserProfile();
        updateAuthUI();

        // 프로필에 전화번호가 없으면 등록 페이지로 리다이렉트 (redirect URL 유지)
        if (currentProfile && !currentProfile.phone && !window.location.pathname.includes('register.html')) {
            const redirectUrl = getRedirectUrl('index.html');
            window.location.href = `register.html?redirect=${encodeURIComponent(redirectUrl)}`;
        }
    } else {
        currentUser = null;
        currentProfile = null;
        updateAuthUI();
    }
});

// 사용자 프로필 로드
async function loadUserProfile() {
    if (!currentUser) return null;

    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', currentUser.id)
        .single();

    if (error) {
        console.error('프로필 로드 실패:', error);
        return null;
    }

    currentProfile = data;
    return data;
}

// Google 로그인
async function signInWithGoogle(redirectUrl = null) {
    if (!redirectUrl) {
        redirectUrl = getRedirectUrl('index.html');
    }
    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: window.location.origin + `/register.html?redirect=${encodeURIComponent(redirectUrl)}`
        }
    });

    if (error) {
        console.error('Google 로그인 실패:', error);
        showAlert('로그인에 실패했습니다.', 'error');
        return false;
    }

    return true;
}

// Kakao 로그인
async function signInWithKakao(redirectUrl = null) {
    if (!redirectUrl) {
        redirectUrl = getRedirectUrl('index.html');
    }
    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'kakao',
        options: {
            redirectTo: window.location.origin + `/register.html?redirect=${encodeURIComponent(redirectUrl)}`
        }
    });

    if (error) {
        console.error('Kakao 로그인 실패:', error);
        showAlert('로그인에 실패했습니다.', 'error');
        return false;
    }

    return true;
}

// 로그아웃
async function signOut() {
    const { error } = await supabase.auth.signOut();

    if (error) {
        console.error('로그아웃 실패:', error);
        showAlert('로그아웃에 실패했습니다.', 'error');
        return false;
    }

    window.location.href = 'index.html';
    return true;
}

// 프로필 업데이트 (전화번호, 이름)
async function updateProfile(profileData) {
    if (!currentUser) {
        showAlert('로그인이 필요합니다.', 'error');
        return false;
    }

    // phone_last4 자동 생성
    if (profileData.phone) {
        const phoneDigits = profileData.phone.replace(/[^0-9]/g, '');
        profileData.phone_last4 = phoneDigits.slice(-4);
    }

    const { data, error } = await supabase
        .from('profiles')
        .update(profileData)
        .eq('id', currentUser.id)
        .select()
        .single();

    if (error) {
        console.error('프로필 업데이트 실패:', error);
        showAlert('프로필 저장에 실패했습니다.', 'error');
        return false;
    }

    currentProfile = data;
    return true;
}

// 자녀 추가
async function addStudent(studentName) {
    if (!currentUser || !currentProfile) {
        showAlert('로그인이 필요합니다.', 'error');
        return null;
    }

    const { data, error } = await supabase
        .from('students')
        .insert({
            name: studentName,
            parent_id: currentUser.id,
            parent_phone_last4: currentProfile.phone_last4
        })
        .select()
        .single();

    if (error) {
        console.error('자녀 추가 실패:', error);
        showAlert('자녀 추가에 실패했습니다.', 'error');
        return null;
    }

    return data;
}

// 자녀 목록 조회
async function getStudents() {
    if (!currentUser) return [];

    const { data, error } = await supabase
        .from('students')
        .select('*')
        .eq('parent_id', currentUser.id)
        .order('created_at', { ascending: true });

    if (error) {
        console.error('자녀 목록 조회 실패:', error);
        return [];
    }

    return data || [];
}

// 자녀 삭제
async function deleteStudent(studentId) {
    const { error } = await supabase
        .from('students')
        .delete()
        .eq('id', studentId)
        .eq('parent_id', currentUser.id);

    if (error) {
        console.error('자녀 삭제 실패:', error);
        showAlert('자녀 삭제에 실패했습니다.', 'error');
        return false;
    }

    return true;
}

// UI 업데이트 (헤더 로그인 버튼 등)
function updateAuthUI() {
    const loginBtn = document.getElementById('login-btn');
    const userInfo = document.getElementById('user-info');
    const profileBtn = document.getElementById('profile-btn');
    const profileInitial = document.getElementById('profile-initial');
    const dropdownEmail = document.getElementById('dropdown-email');
    const logoutBtn = document.getElementById('logout-btn');
    const profileDropdown = document.getElementById('profile-dropdown');

    if (currentUser && currentProfile) {
        // 로그인 상태
        if (loginBtn) loginBtn.style.display = 'none';
        if (userInfo) userInfo.style.display = 'block';

        // 이메일 첫 글자 추출 (대문자)
        if (profileInitial && currentUser.email) {
            const firstLetter = currentUser.email.charAt(0).toUpperCase();
            profileInitial.textContent = firstLetter;
        }

        // 드롭다운 메뉴 이메일 표시
        if (dropdownEmail) {
            dropdownEmail.textContent = currentUser.email;
        }

        // 로그아웃 버튼
        if (logoutBtn) {
            logoutBtn.onclick = signOut;
        }

        // 프로필 버튼 클릭 시 드롭다운 토글
        if (profileBtn) {
            // 기존 리스너 제거
            const newProfileBtn = profileBtn.cloneNode(true);
            profileBtn.parentNode.replaceChild(newProfileBtn, profileBtn);

            newProfileBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                if (profileDropdown) {
                    profileDropdown.classList.toggle('hidden');
                }
            });
        }
    } else {
        // 로그아웃 상태
        if (loginBtn) {
            loginBtn.style.display = 'block';
            loginBtn.onclick = () => window.location.href = 'login.html';
        }
        if (userInfo) userInfo.style.display = 'none';
        if (profileDropdown) profileDropdown.classList.add('hidden');
    }
}

// 드롭다운 메뉴 외부 클릭 시 닫기
document.addEventListener('click', function(e) {
    const profileDropdown = document.getElementById('profile-dropdown');
    const profileBtn = document.getElementById('profile-btn');

    if (profileDropdown && !profileDropdown.classList.contains('hidden')) {
        if (!profileBtn || !profileBtn.contains(e.target)) {
            profileDropdown.classList.add('hidden');
        }
    }
});

// 알림 표시 함수
function showAlert(message, type = 'info') {
    // 기존 알림 제거
    const existingAlert = document.querySelector('.auth-alert');
    if (existingAlert) existingAlert.remove();

    const alert = document.createElement('div');
    alert.className = `auth-alert fixed top-4 right-4 px-6 py-3 rounded-lg shadow-lg z-50 ${
        type === 'error' ? 'bg-red-500 text-white' :
        type === 'success' ? 'bg-green-500 text-white' :
        'bg-blue-500 text-white'
    }`;
    alert.textContent = message;
    document.body.appendChild(alert);

    setTimeout(() => alert.remove(), 3000);
}

// 현재 세션 확인
async function checkSession() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
        currentUser = session.user;
        await loadUserProfile();
        updateAuthUI();
    }
    return session;
}

// 페이지 로드 시 세션 확인
document.addEventListener('DOMContentLoaded', checkSession);
