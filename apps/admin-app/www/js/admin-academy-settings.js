// 내 학원 설정 페이지

let academyNameInput;
let phoneInput;
let saveBtn;
let currentProfile = null;
let schools = [];  // 학교 목록

// XSS 방지용 escapeHtml 함수
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

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
    loadSchools();  // 학교 목록 로드

    // 전화번호 입력 포맷
    phoneInput.addEventListener('input', formatPhoneNumber);

    // 폼 제출 이벤트
    form.addEventListener('submit', handleSave);

    // 학교 추가 버튼 이벤트
    const addSchoolBtn = document.getElementById('add-school-btn');
    if (addSchoolBtn) {
        addSchoolBtn.addEventListener('click', addSchool);
    }

    // 학교명 입력 필드 엔터키 이벤트
    const newSchoolInput = document.getElementById('new-school-name');
    if (newSchoolInput) {
        newSchoolInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addSchool();
            }
        });
    }
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


// schools.academy_id is NOT NULL. Ensure we always have one before insert.
async function ensureAcademyId() {
    if (currentProfile?.academy_id) {
        return currentProfile.academy_id;
    }

    const ownerId = currentProfile?.id;
    if (!ownerId) return null;

    const { data: existingAcademy } = await supabase
        .from('academies')
        .select('id')
        .eq('owner_id', ownerId)
        .limit(1)
        .maybeSingle();

    if (existingAcademy?.id) {
        currentProfile.academy_id = existingAcademy.id;
        await supabase
            .from('profiles')
            .update({ academy_id: existingAcademy.id })
            .eq('id', ownerId);
        return existingAcademy.id;
    }

    const academyName = (currentProfile.academy_name || '').trim() || '학원';
    const academyPhone = (currentProfile.full_phone || '').trim() || null;

    const { data: newAcademy, error: createError } = await supabase
        .from('academies')
        .insert({
            owner_id: ownerId,
            name: academyName,
            phone: academyPhone
        })
        .select('id')
        .single();

    if (createError || !newAcademy?.id) {
        throw createError || new Error('Failed to create academy');
    }

    currentProfile.academy_id = newAcademy.id;
    await supabase
        .from('profiles')
        .update({ academy_id: newAcademy.id })
        .eq('id', ownerId);

    return newAcademy.id;
}

// 학교 목록 로드
async function loadSchools() {
    try {
        const { data, error } = await supabase
            .from('schools')
            .select('id, name')
            .eq('profile_id', currentProfile.id)
            .order('name');

        if (error) throw error;
        schools = data || [];
        renderSchools();
    } catch (error) {
        console.error('학교 목록 로드 에러:', error);
    }
}

// 학교 목록 렌더링
function renderSchools() {
    const container = document.getElementById('schools-list');
    const noSchoolsMsg = document.getElementById('no-schools-msg');
    const countEl = document.getElementById('school-count');

    countEl.textContent = `${schools.length}개 학교`;

    if (schools.length === 0) {
        container.innerHTML = '';
        noSchoolsMsg.classList.remove('hidden');
        return;
    }

    noSchoolsMsg.classList.add('hidden');
    container.innerHTML = schools.map(school => `
        <div class="flex items-center gap-2 p-3 bg-gray-50 rounded-lg group">
            <span class="material-symbols-outlined text-gray-400">school</span>
            <span class="flex-1 text-gray-800">${escapeHtml(school.name)}</span>
            <button type="button" onclick="deleteSchool('${school.id}')"
                    class="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700 transition-opacity">
                <span class="material-symbols-outlined text-sm">delete</span>
            </button>
        </div>
    `).join('');
}

// 학교 추가
async function addSchool() {
    const input = document.getElementById('new-school-name');
    const name = input.value.trim();

    if (!name) {
        showToast('학교명을 입력해주세요.', 'error');
        return;
    }

    if (name.length < 2) {
        showToast('학교명은 2자 이상 입력해주세요.', 'error');
        return;
    }

    // academy_id 보장 (NOT NULL 제약조건)
    const academyId = await ensureAcademyId();
    if (!academyId) {
        showToast('학원 정보를 찾을 수 없습니다. 새로고침 후 다시 시도해주세요.', 'error');
        return;
    }

    try {
        const { data, error } = await supabase
            .from('schools')
            .insert({
                name: name,
                profile_id: currentProfile.id,
                academy_id: academyId
            })
            .select()
            .single();

        if (error) {
            if (error.code === '23505') {
                showToast('이미 등록된 학교입니다.', 'error');
            } else {
                console.error('학교 추가 에러:', error);
                showToast(`학교 추가 실패: ${error.message || error.code}`, 'error');
            }
            return;
        }

        schools.push(data);
        renderSchools();
        input.value = '';
        showToast('학교가 추가되었습니다.', 'success');
    } catch (error) {
        console.error('학교 추가 에러:', error);
        showToast(`학교 추가 실패: ${error.message || error}`, 'error');
    }
}

// 학교 삭제
async function deleteSchool(id) {
    const school = schools.find(s => s.id === id);
    if (!school) return;

    if (!confirm(`'${escapeHtml(school.name)}'을(를) 삭제하시겠습니까?`)) {
        return;
    }

    try {
        const { error } = await supabase
            .from('schools')
            .delete()
            .eq('id', id)
            .eq('profile_id', currentProfile.id);

        if (error) throw error;

        schools = schools.filter(s => s.id !== id);
        renderSchools();
        showToast('학교가 삭제되었습니다.', 'success');
    } catch (error) {
        console.error('학교 삭제 에러:', error);
        showToast('학교 삭제에 실패했습니다.', 'error');
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
