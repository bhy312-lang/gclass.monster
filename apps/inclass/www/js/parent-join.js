// 학부모 가입 신청 페이지

let currentStep = 1;
const totalSteps = 3;
let selectedAcademy = null;
let searchTimeout = null;

// 폼 요소
const academySearchInput = document.getElementById('academy-search');
const studentNameInput = document.getElementById('student-name');
const birthDateInput = document.getElementById('birth-date');
const schoolNameInput = document.getElementById('school-name');
const gradeInput = document.getElementById('grade');
const phoneInput = document.getElementById('phone');

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', async () => {
    // 로그인 확인
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        showToast('로그인이 필요합니다.', 'error');
        setTimeout(() => window.location.href = 'index.html', 1500);
        return;
    }

    // 전화번호 입력 포맷
    phoneInput.addEventListener('input', formatPhoneNumber);

    // 학원 검색
    academySearchInput.addEventListener('input', handleAcademySearch);

    // 폼 제출
    document.getElementById('join-form').addEventListener('submit', handleSubmit);
});

// 전화번호 포맷 (010-0000-0000)
function formatPhoneNumber(e) {
    let value = e.target.value.replace(/[^0-9]/g, '');
    if (value.length >= 3) {
        value = value.slice(0, 3) + '-' + value.slice(3);
    }
    if (value.length >= 8) {
        value = value.slice(0, 8) + '-' + value.slice(8, 12);
    }
    e.target.value = value;
}

// 학원 검색 처리
function handleAcademySearch(e) {
    const searchTerm = e.target.value.trim();

    // 이전 타이머 취소
    if (searchTimeout) {
        clearTimeout(searchTimeout);
    }

    // 검색어가 2글자 미만이면 결과 숨김
    if (searchTerm.length < 2) {
        document.getElementById('academy-results').innerHTML = '';
        return;
    }

    // 디바운스: 300ms 후 검색
    searchTimeout = setTimeout(() => {
        searchAcademies(searchTerm);
    }, 300);
}

// 학원 검색
async function searchAcademies(searchTerm) {
    try {
        const resultsContainer = document.getElementById('academy-results');
        resultsContainer.innerHTML = '<div class="text-center py-4 text-gray-400"><span class="material-symbols-outlined animate-spin">loading</span><br>검색 중...</div>';

        const { data, error } = await supabase
            .from('profiles')
            .select('id, academy_name, business_number, full_phone')
            .eq('role', 'Admin')
            .eq('approval_status', 'approved')
            .ilike('academy_name', `%${searchTerm}%`)
            .order('academy_name')
            .limit(10);

        if (error) throw error;

        if (!data || data.length === 0) {
            resultsContainer.innerHTML = '<div class="text-center py-4 text-gray-400">검색 결과가 없습니다.</div>';
            return;
        }

        resultsContainer.innerHTML = data.map(academy => `
            <div class="academy-search-result" onclick="selectAcademy('${academy.id}', '${academy.academy_name}', '${academy.full_phone || ''}')">
                <p class="font-semibold text-gray-800">${academy.academy_name}</p>
                ${academy.full_phone ? `<p class="text-sm text-gray-500">${academy.full_phone}</p>` : ''}
            </div>
        `).join('');
    } catch (error) {
        console.error('학원 검색 에러:', error);
        document.getElementById('academy-results').innerHTML = '<div class="text-center py-4 text-red-400">검색 중 오류가 발생했습니다.</div>';
    }
}

// 학원 선택
function selectAcademy(id, name, phone) {
    selectedAcademy = { id, name, phone };

    // 선택된 학원 표시
    document.getElementById('selected-academy').classList.remove('hidden');
    document.getElementById('selected-academy-name').textContent = name;
    document.getElementById('selected-academy-phone').textContent = phone || '연락처 없음';

    // 검색 결과 숨김
    document.getElementById('academy-results').innerHTML = '';
    academySearchInput.value = name;
}

// 다음 단계
function nextStep() {
    if (!validateCurrentStep()) return;

    if (currentStep < totalSteps) {
        currentStep++;
        updateStepUI();
    }
}

// 이전 단계
function prevStep() {
    if (currentStep > 1) {
        currentStep--;
        updateStepUI();
    }
}

// 현재 단계 유효성 검사
function validateCurrentStep() {
    switch (currentStep) {
        case 1:
            if (!selectedAcademy) {
                showToast('학원/공부방을 선택해주세요.', 'error');
                return false;
            }
            break;
        case 2:
            if (!studentNameInput.value.trim()) {
                showToast('학생 이름을 입력해주세요.', 'error');
                studentNameInput.focus();
                return false;
            }
            if (!birthDateInput.value) {
                showToast('생일을 선택해주세요.', 'error');
                birthDateInput.focus();
                return false;
            }
            if (!schoolNameInput.value.trim()) {
                showToast('학교명을 입력해주세요.', 'error');
                schoolNameInput.focus();
                return false;
            }
            if (!gradeInput.value) {
                showToast('학년을 선택해주세요.', 'error');
                gradeInput.focus();
                return false;
            }
            if (!phoneInput.value || phoneInput.value.length < 13) {
                showToast('연락처를 올바르게 입력해주세요.', 'error');
                phoneInput.focus();
                return false;
            }
            break;
    }
    return true;
}

// 단계 UI 업데이트
function updateStepUI() {
    // 단계 표시 업데이트
    document.querySelectorAll('.step-dot').forEach((dot, index) => {
        dot.classList.remove('active', 'completed');
        if (index + 1 < currentStep) {
            dot.classList.add('completed');
        } else if (index + 1 === currentStep) {
            dot.classList.add('active');
        }
    });

    // 단계 컨텐츠 표시/숨김
    document.querySelectorAll('.step-content').forEach((content, index) => {
        content.classList.toggle('hidden', index + 1 !== currentStep);
    });

    // 버튼 상태 업데이트
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const submitBtn = document.getElementById('submit-btn');

    prevBtn.classList.toggle('hidden', currentStep === 1);

    if (currentStep === totalSteps) {
        nextBtn.classList.add('hidden');
        submitBtn.classList.remove('hidden');
        updateConfirmInfo();
    } else {
        nextBtn.classList.remove('hidden');
        submitBtn.classList.add('hidden');
    }
}

// 확인 정보 업데이트
function updateConfirmInfo() {
    document.getElementById('confirm-academy').textContent = selectedAcademy?.name || '-';
    document.getElementById('confirm-name').textContent = studentNameInput.value;
    document.getElementById('confirm-birth').textContent = birthDateInput.value;
    document.getElementById('confirm-school').textContent = schoolNameInput.value;

    const gradeText = gradeInput.options[gradeInput.selectedIndex].text;
    document.getElementById('confirm-grade').textContent = gradeText;
    document.getElementById('confirm-phone').textContent = phoneInput.value;
}

// 학년 텍스트 변환
function getGradeText(grade) {
    const gradeMap = {
        '1': '초등학교 1학년',
        '2': '초등학교 2학년',
        '3': '초등학교 3학년',
        '4': '초등학교 4학년',
        '5': '초등학교 5학년',
        '6': '초등학교 6학년',
        '7': '중학교 1학년',
        '8': '중학교 2학년',
        '9': '중학교 3학년',
        '10': '고등학교 1학년',
        '11': '고등학교 2학년',
        '12': '고등학교 3학년'
    };
    return gradeMap[grade] || grade;
}

// 폼 제출 처리
async function handleSubmit(e) {
    e.preventDefault();

    showLoading();

    try {
        const { data: { user } } = await supabase.auth.getUser();

        // 자녀 정보 저장
        const { error } = await supabase
            .from('students')
            .insert({
                name: studentNameInput.value.trim(),
                birth_date: birthDateInput.value,
                school_name: schoolNameInput.value.trim(),
                grade: parseInt(gradeInput.value),
                full_phone: phoneInput.value,
                parent_id: user.id,
                academy_id: selectedAcademy.id,
                approval_status: 'pending'
            });

        if (error) throw error;

        // 알림 생성
        await supabase
            .from('parent_registration_notifications')
            .insert({
                academy_id: selectedAcademy.id,
                student_id: null // 생성된 student_id를 모르므로 null로 처리
            });

        hideLoading();
        showToast('가입 신청이 완료되었습니다!\n승인 대기 페이지로 이동합니다.', 'success');

        setTimeout(() => {
            window.location.href = 'parent-status.html';
        }, 2000);

    } catch (error) {
        hideLoading();
        console.error('가입 신청 에러:', error);
        showToast('가입 신청에 실패했습니다: ' + error.message, 'error');
    }
}

// 로딩 표시
function showLoading() {
    document.getElementById('loading-spinner').classList.add('active');
    document.getElementById('join-form').classList.add('hidden');
}

function hideLoading() {
    document.getElementById('loading-spinner').classList.remove('active');
    document.getElementById('join-form').classList.remove('hidden');
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
