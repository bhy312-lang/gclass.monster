// 내 학원 설정 페이지

let academyNameInput;
let phoneInput;
let saveBtn;
let currentProfile = null;

// DOM 로드 후 실행
document.addEventListener('DOMContentLoaded', async () => {
    // 로그인 확인 및 프로필 로드
    const isAuthorized = await checkAuthAndLoadProfile();
    if (!isAuthorized) return;

    // 초기화 진행
    initPage();
});

// 페이지 초기화 함수
function initPage() {
    // 폼 요소 가져오기
    academyNameInput = document.getElementById('academy-name');
    phoneInput = document.getElementById('phone');
    saveBtn = document.getElementById('save-btn');
    const form = document.getElementById('academy-form');

    // 기존 데이터 로드
    loadAcademyData();

    // 전화번호 입력 포맷
    phoneInput.addEventListener('input', formatPhoneNumber);

    // 폼 제출 이벤트
    form.addEventListener('submit', handleSave);
}

// 인증 확인 및 프로필 로드
async function checkAuthAndLoadProfile() {
    try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError || !session) {
            alert('로그인이 필요합니다.');
            window.location.href = 'admin-main.html';
            return false;
        }

        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();

        if (profileError || !profile) {
            alert('사용자 정보를 찾을 수 없습니다.');
            window.location.href = 'admin-main.html';
            return false;
        }

        currentProfile = profile;
        return true;

    } catch (error) {
        console.error('Auth check error:', error);
        window.location.href = 'admin-main.html';
        return false;
    }
}

// 기존 데이터 로드
async function loadAcademyData() {
    if (currentProfile) {
        if (currentProfile.academy_name) {
            academyNameInput.value = currentProfile.academy_name;
        }
        if (currentProfile.full_phone) {
            phoneInput.value = currentProfile.full_phone;
        }
    }
}

// 저장 처리
async function handleSave(e) {
    e.preventDefault();

    // 유효성 검사
    if (!validateForm()) {
        return;
    }

    const academyName = academyNameInput.value.trim();
    const phoneNumber = phoneInput.value.trim();

    // 로딩 상태
    setSavingState(true);

    try {
        const { data: { user } } = await supabase.auth.getUser();

        // 프로필 업데이트 (academy_name, full_phone)
        const updateData = {
            academy_name: academyName
        };

        // 전화번호가 입력된 경우에만 저장 (선택사항)
        if (phoneNumber) {
            updateData.full_phone = phoneNumber;
        }

        const { error: updateError } = await supabase
            .from('profiles')
            .update(updateData)
            .eq('id', user.id);

        if (updateError) {
            throw updateError;
        }

        showToast('학원 정보가 저장되었습니다.', 'success');

        // 1.5초 후 메인 화면으로 이동
        setTimeout(() => {
            window.location.href = 'admin-main.html';
        }, 1500);

    } catch (error) {
        console.error('저장 에러:', error);
        showToast('저장에 실패했습니다: ' + error.message, 'error');
    } finally {
        setSavingState(false);
    }
}

// 유효성 검사
function validateForm() {
    const value = academyNameInput.value.trim();

    if (!value) {
        showToast('학원명을 입력해주세요.', 'error');
        academyNameInput.focus();
        return false;
    }

    if (value.length < 2) {
        showToast('학원명은 2자 이상 입력해주세요.', 'error');
        academyNameInput.focus();
        return false;
    }

    if (value.length > 100) {
        showToast('학원명은 100자 이내로 입력해주세요.', 'error');
        academyNameInput.focus();
        return false;
    }

    return true;
}

// 저장 상태 설정
function setSavingState(isSaving) {
    if (saveBtn) {
        saveBtn.disabled = isSaving;
        if (isSaving) {
            saveBtn.innerHTML = `
                <span class="material-symbols-outlined align-middle text-sm animate-spin">autorenew</span>
                저장 중...
            `;
        } else {
            saveBtn.innerHTML = `
                <span class="material-symbols-outlined align-middle text-sm">save</span>
                저장
            `;
        }
    }
}

// 뒤로가기
function goBack() {
    window.location.href = 'admin-main.html';
}

// 전화번호 포맷 (010-0000-0000)
function formatPhoneNumber(e) {
    let value = e.target.value.replace(/[^0-9]/g, '');

    // 010 유효성 검사 (첫 3자리가 010으로 시작하는지)
    if (value.length > 0 && !value.startsWith('010')) {
        // 010으로 시작하지 않으면 앞에 010 자동 추가
        value = '010' + value;
    }

    // 하이픈 추가
    if (value.length >= 3) {
        value = value.slice(0, 3) + '-' + value.slice(3);
    }
    if (value.length >= 8) {
        value = value.slice(0, 8) + '-' + value.slice(8, 12);
    }
    if (value.length > 13) {
        value = value.slice(0, 13);
    }

    e.target.value = value;
}

// 토스트 메시지
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type}`;
    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}
