// 학부모 가입 신청 페이지

let currentStep = 1;
const totalSteps = 3;
let selectedAcademy = null;
let searchTimeout = null;
let isSubmitting = false;  // 중복 제출 방지

// XSS 방지용 escapeHtml 함수
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

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
    const inputType = e.inputType;
    const isDeletion = inputType === 'deleteContentBackward' ||
                      inputType === 'deleteContentForward' ||
                      inputType === 'delete';

    // 숫자만 추출
    let value = e.target.value.replace(/[^0-9]/g, '');

    // 삭제 동작인 경우: 유연하게 포맷 적용
    if (isDeletion) {
        if (value.length === 0) {
            e.target.value = '';
            return;
        }
        if (value.length <= 3) {
            e.target.value = value;
        } else if (value.length <= 7) {
            e.target.value = value.slice(0, 3) + '-' + value.slice(3);
        } else {
            e.target.value = value.slice(0, 3) + '-' + value.slice(3, 7) + '-' + value.slice(7, 11);
        }
        return;
    }

    // 숫자 입력인 경우: 정상 포맷팅
    if (value.length >= 3 && value.length <= 7) {
        value = value.slice(0, 3) + '-' + value.slice(3);
    } else if (value.length >= 8) {
        value = value.slice(0, 3) + '-' + value.slice(3, 7) + '-' + value.slice(7, 11);
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

// 학원 검색 (RPC 사용)
async function searchAcademies(searchTerm) {
    try {
        const resultsContainer = document.getElementById('academy-results');
        resultsContainer.innerHTML = '<div class="text-center py-4 text-gray-400"><span class="material-symbols-outlined animate-spin">loading</span><br>검색 중...</div>';

        // RPC 함수 호출 (승인된 학원만 반환)
        const { data, error } = await supabase.rpc('search_academies', {
            p_search_term: searchTerm
        });

        if (error) throw error;

        if (!data || data.length === 0) {
            resultsContainer.innerHTML = '<div class="text-center py-4 text-gray-400">검색 결과가 없습니다.</div>';
            return;
        }

        // 결과 컨테이너 비우기
        resultsContainer.innerHTML = '';

        // createElement로 안전하게 생성 (XSS 방지)
        data.forEach(academy => {
            const resultDiv = document.createElement('div');
            resultDiv.className = 'academy-search-result';

            const nameP = document.createElement('p');
            nameP.className = 'font-semibold text-gray-800';
            nameP.textContent = academy.academy_name;
            resultDiv.appendChild(nameP);

            if (academy.full_phone) {
                const phoneP = document.createElement('p');
                phoneP.className = 'text-sm text-gray-500';
                phoneP.textContent = academy.full_phone;
                resultDiv.appendChild(phoneP);
            }

            // 이벤트 리스너로 안전하게 바인딩 (inline onclick 대체)
            resultDiv.addEventListener('click', () => {
                selectAcademy(academy.id, academy.academy_name, academy.full_phone || '', academy.academy_id || null);
            });

            resultsContainer.appendChild(resultDiv);
        });
    } catch (error) {
        console.error('학원 검색 에러:', error);
        document.getElementById('academy-results').innerHTML = '<div class="text-center py-4 text-red-400">검색 중 오류가 발생했습니다.</div>';
    }
}

// 학원 선택
function selectAcademy(id, name, phone, academy_id = null) {
    selectedAcademy = { id, name, phone, academy_id };

    // 선택된 학원 표시
    document.getElementById('selected-academy').classList.remove('hidden');
    document.getElementById('selected-academy-name').textContent = name;
    document.getElementById('selected-academy-phone').textContent = phone || '연락처 없음';

    // 검색 결과 숨김
    document.getElementById('academy-results').innerHTML = '';
    academySearchInput.value = name;

    // 학교 목록 로드
    loadSchools();
}

// 학교 목록 로드
async function loadSchools() {
    const schoolSelect = document.getElementById('school-name');
    const noSchoolsGuidance = document.getElementById('no-schools-guidance');

    // selectedAcademy null 가드
    if (!selectedAcademy) {
        console.error('[Parent] loadSchools: selectedAcademy is null');
        const errorOption = document.createElement('option');
        errorOption.textContent = '학원을 먼저 선택해주세요';
        schoolSelect.appendChild(errorOption);
        return;
    }

    // 초기 상태 - 옵션 모두 제거
    while (schoolSelect.firstChild) {
        schoolSelect.removeChild(schoolSelect.firstChild);
    }
    noSchoolsGuidance.classList.add('hidden');

    // 로딩 옵션 추가 (createElement 사용)
    const loadingOption = document.createElement('option');
    loadingOption.textContent = '로딩 중...';
    schoolSelect.appendChild(loadingOption);

    try {
        // RPC 함수 호출 (profile_id 기반)
        const { data, error } = await supabase.rpc('get_school_options_for_profile', {
            p_profile_id: selectedAcademy.id,
            p_academy_id: selectedAcademy.academy_id || null
        });

        if (error) throw error;

        // 옵션 모두 제거
        while (schoolSelect.firstChild) {
            schoolSelect.removeChild(schoolSelect.firstChild);
        }

        if (!data || data.length === 0) {
            const noOption = document.createElement('option');
            noOption.textContent = '등록된 학교가 없습니다';
            schoolSelect.appendChild(noOption);
            noSchoolsGuidance.classList.remove('hidden');
            return;
        }

        // 기본 옵션 추가
        const defaultOption = document.createElement('option');
        defaultOption.textContent = '학교를 선택하세요';
        defaultOption.value = '';
        schoolSelect.appendChild(defaultOption);

        // 학교 옵션 추가 (createElement 사용 - 값 깨짐/XSS 방지)
        data.forEach(school => {
            const option = document.createElement('option');
            option.value = school.name;
            option.textContent = school.name;
            schoolSelect.appendChild(option);
        });

    } catch (error) {
        // 상세 에러 로깅
        console.error('[Parent] loadSchools RPC error:', {
            message: error?.message,
            code: error?.code,
            details: error?.details,
            hint: error?.hint,
            selectedAcademy
        });

        // fallback 트리거 조건 확대
        const errorMsg = (error?.message || '').toLowerCase();
        const shouldFallback =
            error?.code === '42702'                    // ambiguous column
            || error?.code === '42883'                 // undefined function
            || errorMsg.includes('ambiguous')
            || errorMsg.includes('does not exist')
            || errorMsg.includes('function')
            || (error?.code && String(error.code).startsWith('PGRST'));       // PostgREST errors

        if (shouldFallback) {
            console.log('[Parent] RPC error detected, trying fallback query...');
            await loadSchoolsFallback();
        } else {
            // 다른 에러는 기존대로 표시
            while (schoolSelect.firstChild) {
                schoolSelect.removeChild(schoolSelect.firstChild);
            }
            const errorOption = document.createElement('option');
            errorOption.textContent = `학교 목록 로드 실패 (${error?.code || 'unknown'})`;
            schoolSelect.appendChild(errorOption);
        }
    }
}

// RPC 실패 시 fallback 직접 조회
async function loadSchoolsFallback() {
    const schoolSelect = document.getElementById('school-name');
    const noSchoolsGuidance = document.getElementById('no-schools-guidance');

    try {
        // 로딩 옵션 추가
        while (schoolSelect.firstChild) {
            schoolSelect.removeChild(schoolSelect.firstChild);
        }
        const loadingOption = document.createElement('option');
        loadingOption.textContent = '로딩 중...';
        schoolSelect.appendChild(loadingOption);

        // 직접 schools 테이블 조회
        let query = supabase.from('schools').select('id,name');

        if (selectedAcademy?.academy_id) {
            // academy_id가 있는 경우: profile_id 또는 academy_id로 검색
            query = query.or(`profile_id.eq.${selectedAcademy.id},academy_id.eq.${selectedAcademy.academy_id}`);
        } else {
            // academy_id가 없는 경우: profile_id로만 검색
            query = query.eq('profile_id', selectedAcademy.id);
        }

        const { data: fallbackData, error: fallbackError } = await query.order('name', { ascending: true });

        if (fallbackError) throw fallbackError;

        // 옵션 모두 제거
        while (schoolSelect.firstChild) {
            schoolSelect.removeChild(schoolSelect.firstChild);
        }

        // 빈 이름 제거 + 중복 제거
        const uniqueSchools = new Map();
        (fallbackData || []).forEach(school => {
            if (school.name && school.name.trim() !== '') {
                if (!uniqueSchools.has(school.name)) {
                    uniqueSchools.set(school.name, school);
                }
            }
        });

        const schoolList = Array.from(uniqueSchools.values());

        if (schoolList.length === 0) {
            const noOption = document.createElement('option');
            noOption.textContent = '등록된 학교가 없습니다';
            schoolSelect.appendChild(noOption);
            noSchoolsGuidance.classList.remove('hidden');
            return;
        }

        // 기본 옵션 추가
        const defaultOption = document.createElement('option');
        defaultOption.textContent = '학교를 선택하세요';
        defaultOption.value = '';
        schoolSelect.appendChild(defaultOption);

        // 학교 옵션 추가
        schoolList.forEach(school => {
            const option = document.createElement('option');
            option.value = school.name;
            option.textContent = school.name;
            schoolSelect.appendChild(option);
        });

        console.log('[Parent] Fallback query succeeded, loaded', schoolList.length, 'unique schools');

    } catch (fallbackError) {
        console.error('[Parent] Fallback query failed:', {
            message: fallbackError?.message,
            code: fallbackError?.code,
            details: fallbackError?.details,
            hint: fallbackError?.hint,
            selectedAcademy
        });

        while (schoolSelect.firstChild) {
            schoolSelect.removeChild(schoolSelect.firstChild);
        }
        const errorOption = document.createElement('option');
        errorOption.textContent = `학교 목록 로드 실패 (${fallbackError?.code || 'unknown'})`;
        schoolSelect.appendChild(errorOption);
    }
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
                showToast('학교를 선택해주세요.', 'error');
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

// 세션 만료 임박 확인 (초 단위)
function isSessionExpiringSoon(session, secondsThreshold = 60) {
    if (!session?.expires_at) return true;
    const expiresAt = new Date(session.expires_at);
    const now = new Date();
    const secondsLeft = (expiresAt - now) / 1000;
    return secondsLeft < secondsThreshold;
}

// Promise timeout wrapper
function withTimeout(promise, ms = 2500) {
    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            reject(new Error('PUSH_TIMEOUT:' + ms));
        }, ms);

        promise
            .then((result) => {
                clearTimeout(timeoutId);
                resolve(result);
            })
            .catch((error) => {
                clearTimeout(timeoutId);
                reject(error);
            });
    });
}

// =====================================================
// 관리자 푸시 알림 전송
// =====================================================

// 관리자에게 학부모 가입 신청 푸시 알림 전송
async function notifyAdminParentJoinRequest(studentName, studentId, academyId, parentId) {
    const pushContext = {
        academy_id: String(academyId),
        student_id: String(studentId),
        parent_id: String(parentId),
        target_type: 'admin',
        message_type: 'new_parent_registration'
    };
    console.log('[PARENT_JOIN_PUSH] Starting', pushContext);

    try {
        // handleSubmit에서 갱신된 세션 사용
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
            console.error('[PARENT_JOIN_PUSH] No active session', {
                ...pushContext,
                error_code: 'NO_SESSION'
            });
            return { success: false, error_code: 'NO_SESSION', error: 'No active session' };
        }

        console.log('[PARENT_JOIN_PUSH] has_session=true, has_user_jwt=true');

        // IMPORTANT: Authorization 헤더를 오버라이드하지 않는다.
        // Supabase SDK가 현재 세션 JWT를 자동 전달한다.
        const { data, error } = await supabase.functions.invoke('fcm-send-notification', {
            body: {
                recipient_id: academyId,
                target_type: 'admin',
                type: 'new_parent_registration',
                title: '새 학부모 가입 신청',
                body: `${studentName} 학생 가입 신청이 접수되었습니다.`,
                data: {
                    type: 'new_parent_registration',
                    student_id: String(studentId),
                    academy_id: String(academyId),
                    parent_id: String(parentId)
                },
                priority: 'high'
            }
        });

        // Edge Function 호출 자체 실패
        if (error) {
            console.error('[PARENT_JOIN_PUSH] Function invoke failed', {
                ...pushContext,
                error_code: 'FUNCTION_ERROR',
                error: error.message
            });
            return { success: false, error_code: 'FUNCTION_ERROR', error: error.message };
        }

        // API 응답 실패 (MISSING_AUTH_HEADER, INVALID_USER_JWT, NO_ACTIVE_TOKEN 등)
        if (!data?.success) {
            const errorMsg = data?.error || '알 수 없는 오류';
            const errorCode = data?.error_code || 'API_ERROR';
            const messageId = data?.message_id || data?.data?.message_id || null;

            if (errorCode === 'NO_ACTIVE_TOKEN') {
                console.warn('[PARENT_JOIN_PUSH] No active admin token', {
                    ...pushContext,
                    error_code: errorCode,
                    message_id: messageId,
                    error: errorMsg
                });
            } else if (errorCode === 'INVALID_USER_JWT' || errorCode === 'MISSING_AUTH_HEADER') {
                console.error('[PARENT_JOIN_PUSH] Auth failure while sending push', {
                    ...pushContext,
                    error_code: errorCode,
                    message_id: messageId,
                    error: errorMsg
                });
            } else {
                console.error('[PARENT_JOIN_PUSH] API failed', {
                    ...pushContext,
                    error_code: errorCode,
                    message_id: messageId,
                    error: errorMsg
                });
            }

            return {
                success: false,
                error_code: errorCode,
                error: errorMsg,
                message_id: messageId
            };
        }

        // 성공
        const messageId = data?.data?.message_id || data?.message_id || null;
        console.log('[PARENT_JOIN_PUSH] Success', {
            ...pushContext,
            message_id: messageId
        });
        return { success: true, message_id: messageId };

    } catch (error) {
        // 푸시 실패해도 가입 신청은 성공 처리 (로그만 남김)
        console.error('[PARENT_JOIN_PUSH] Exception', {
            ...pushContext,
            error_code: 'EXCEPTION',
            error: error.message
        });
        return { success: false, error_code: 'EXCEPTION', error: error.message };
    }
}

// 폼 제출 처리
async function handleSubmit(e) {
    e.preventDefault();

    // 중복 제출 방지
    if (isSubmitting) {
        console.log('[PARENT_JOIN] Already submitting, ignoring duplicate click');
        return;
    }
    isSubmitting = true;

    const submitBtn = document.getElementById('submit-btn');
    submitBtn.disabled = true;

    showLoading();

    try {
        // 1. 조건부 세션 갱신 (만료 1분 미만 또는 없을 때만)
        console.log('[PARENT_JOIN] Checking session...');
        const { data: { session } } = await supabase.auth.getSession();

        if (!session || isSessionExpiringSoon(session, 60)) {
            console.log('[PARENT_JOIN] Session expired or expiring soon, refreshing...');
            const { data: { session: newSession }, error: refreshError } = await supabase.auth.refreshSession();
            if (refreshError || !newSession?.access_token) {
                console.error('[PARENT_JOIN] Session refresh failed:', refreshError?.message);
                throw new Error('세션 갱신 실패. 다시 로그인해 주세요.');
            }
            console.log('[PARENT_JOIN] Session refreshed successfully');
        } else {
            console.log('[PARENT_JOIN] Session is valid, skipping refresh');
        }

        // 2. RPC 호출로 students + notifications 한 번에 처리 (RLS 우회)
        console.log('[PARENT_JOIN] Calling submit_parent_registration RPC...');

        const { data: rpcData, error: rpcError } = await supabase.rpc('submit_parent_registration', {
            p_student_name: studentNameInput.value.trim(),
            p_birth_date: birthDateInput.value,
            p_school_name: schoolNameInput.value.trim(),
            p_grade: parseInt(gradeInput.value),
            p_full_phone: phoneInput.value,
            p_academy_id: selectedAcademy.id
        });

        if (rpcError || !rpcData?.success) {
            console.error('[PARENT_JOIN] RPC failed:', rpcError || rpcData);
            throw new Error(rpcError?.message || rpcData?.message || '가입 신청 실패');
        }

        const studentId = rpcData.student_id;
        console.log('[PARENT_JOIN] RPC success: student_id=', studentId);

        // 3. 성공 UI 즉시 표시
        hideLoading();
        showToast('가입 신청이 완료되었습니다!\n승인 대기 페이지로 이동합니다.', 'success');
        // 4. FCM 전송 시도 완료 후 이동 (중간 취소 방지)
        const { data: { user } } = await supabase.auth.getUser();
        const pushMeta = {
            academy_id: String(selectedAcademy.id),
            student_id: String(studentId),
            parent_id: String(user?.id || ''),
            timeout_ms: 2500
        };

        console.log('[PARENT_JOIN_PUSH] Attempting push before redirect', pushMeta);
        try {
            const result = await withTimeout(
                notifyAdminParentJoinRequest(
                    studentNameInput.value.trim(),
                    studentId,
                    selectedAcademy.id,
                    user.id
                ),
                2500
            );

            if (!result?.success) {
                console.log('[PARENT_JOIN_PUSH] Push attempt finished with failure', {
                    ...pushMeta,
                    error_code: result?.error_code || 'UNKNOWN',
                    message_id: result?.message_id || null,
                    error: result?.error || 'Unknown push error'
                });
            } else {
                console.log('[PARENT_JOIN_PUSH] Push attempt finished with success', {
                    ...pushMeta,
                    message_id: result.message_id || null
                });
            }
        } catch (pushError) {
            const rawMessage = pushError?.message || String(pushError);
            const timeout = rawMessage.startsWith('PUSH_TIMEOUT:');
            const timeoutMs = timeout ? Number(rawMessage.split(':')[1] || 2500) : null;

            console.error('[PARENT_JOIN_PUSH] Push attempt exception', {
                ...pushMeta,
                error_code: timeout ? 'PUSH_TIMEOUT' : 'EXCEPTION',
                timeout_ms: timeoutMs || pushMeta.timeout_ms,
                error: rawMessage
            });
        }

        // 5. 푸시 시도 완료 후 즉시 이동
        window.location.href = 'parent-status.html';

    } catch (error) {
        isSubmitting = false;
        submitBtn.disabled = false;
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

// =====================================================
// 로그아웃 유틸리티
// =====================================================

// 인증 스토리지 정리
function clearAuthStorage() {
    const authKeys = ['isLoggedIn', 'userId', 'userName', 'userEmail',
                      'userPhoto', 'userPhone'];
    authKeys.forEach(key => localStorage.removeItem(key));

    // Supabase 세션 키 제거 (키를 먼저 수집 후 삭제 - 인덱스 꼬임 방지)
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.match(/(^sb-.*-auth-token$)|code-verifier|^supabase\./)) {
            keysToRemove.push(key);
        }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
}

// 로그아웃 (global -> local fallback)
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
        // 인증 스토리지 정리 (항상 실행)
        clearAuthStorage();
    }
}

// 홈으로 돌아가기 (로그아웃 후 로그인 화면으로)
let isLoggingOut = false;  // 중복 실행 방지 플래그
async function handleGoHome() {
    if (isLoggingOut) return;  // 이미 로그아웃 중이면 무시
    isLoggingOut = true;

    try {
        await performLogout();
        window.location.href = './index.html?logout=true';
    } finally {
        isLoggingOut = false;
    }
}
