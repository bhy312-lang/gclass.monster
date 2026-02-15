// 관리자 가입 신청 페이지

let currentStep = 1;
const totalSteps = 3;
let uploadedFile = null;
let uploadedImageUrl = null;

// 폼 요소
let form, academyNameInput, ownerNameInput, phoneInput, businessNumberInput, licenseFileInput;

// DOM 로드 후 실행
document.addEventListener('DOMContentLoaded', async () => {
    // 로그인 확인
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            alert('로그인이 필요합니다.');
            window.location.href = 'index.html';
            return;
        }
    } catch (error) {
        console.error('Auth check error:', error);
        window.location.href = 'index.html';
        return;
    }

    // 초기화 진행
    initPage();
});

// 페이지 초기화 함수
function initPage() {
    // 폼 요소 가져오기
    form = document.getElementById('join-form');
    academyNameInput = document.getElementById('academy-name');
    ownerNameInput = document.getElementById('owner-name');
    phoneInput = document.getElementById('phone');
    businessNumberInput = document.getElementById('business-number');
    licenseFileInput = document.getElementById('license-file');

    // 전화번호 입력 포맷
    phoneInput.addEventListener('input', formatPhoneNumber);
    businessNumberInput.addEventListener('input', formatBusinessNumber);

    // 키보드 가림 방지 - focus 시 자동 스크롤
    document.querySelectorAll('input').forEach(input => {
        input.addEventListener('focus', handleInputFocus);
    });

    // 폼 제출
    form.addEventListener('submit', handleSubmit);

    // 드래그 앤 드롭
    const uploadZone = document.getElementById('upload-zone');
    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('border-sky-500', 'bg-sky-50');
    });
    uploadZone.addEventListener('dragleave', () => {
        uploadZone.classList.remove('border-sky-500', 'bg-sky-50');
    });
    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('border-sky-500', 'bg-sky-50');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFileUpload({ target: { files } });
        }
    });
}

// 전화번호 포맷 (010-0000-0000) - 숫자만 입력해도 자동으로 하이픈 추가
function formatPhoneNumber(e) {
    let value = e.target.value.replace(/[^0-9]/g, '');

    // 010 유효성 검사 (첫 3자리가 010으로 시작하는지)
    if (value.length >= 3 && !value.startsWith('01')) {
        // 01로 시작하지 않으면 011, 016, 017 등도 허용
        if (!value.startsWith('0')) {
            value = '010' + value;
        }
    }

    // 자동으로 하이픈 추가
    let formatted = '';
    if (value.length > 0) {
        formatted = value.slice(0, 3);
    }
    if (value.length > 3) {
        formatted += '-' + value.slice(3, 7);
    }
    if (value.length > 7) {
        formatted += '-' + value.slice(7, 11);
    }

    e.target.value = formatted;
}

// 사업자등록번호 포맷 (000-00-00000) - 10자리
function formatBusinessNumber(e) {
    let value = e.target.value.replace(/[^0-9]/g, '');

    // 10자리로 제한
    if (value.length > 10) {
        value = value.slice(0, 10);
    }

    // 자동으로 하이픈 추가 (000-00-00000)
    let formatted = '';
    if (value.length > 0) {
        formatted = value.slice(0, 3);
    }
    if (value.length > 3) {
        formatted += '-' + value.slice(3, 5);
    }
    if (value.length > 5) {
        formatted += '-' + value.slice(5, 10);
    }

    e.target.value = formatted;
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
            if (!academyNameInput.value.trim()) {
                showToast('공부방/학원명을 입력해주세요.', 'error');
                academyNameInput.focus();
                return false;
            }
            if (!ownerNameInput.value.trim()) {
                showToast('대표자 성함을 입력해주세요.', 'error');
                ownerNameInput.focus();
                return false;
            }
            if (!phoneInput.value || phoneInput.value.length < 13) {
                showToast('연락처를 올바르게 입력해주세요.', 'error');
                phoneInput.focus();
                return false;
            }
            break;
        case 2:
            if (!businessNumberInput.value || businessNumberInput.value.length < 12) {
                showToast('사업자등록번호를 올바르게 입력해주세요.', 'error');
                businessNumberInput.focus();
                return false;
            }
            if (!uploadedFile) {
                showToast('사업자등록증을 첨부해주세요.', 'error');
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
    document.getElementById('confirm-academy').textContent = academyNameInput.value;
    document.getElementById('confirm-name').textContent = ownerNameInput.value;
    document.getElementById('confirm-phone').textContent = phoneInput.value;
    document.getElementById('confirm-business').textContent = businessNumberInput.value;
}

// 파일 업로드 처리
async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // 이미지 파일만 허용
    if (!file.type.startsWith('image/')) {
        showToast('이미지 파일만 업로드할 수 있습니다.', 'error');
        return;
    }

    // 파일 크기 제한 (10MB)
    if (file.size > 10 * 1024 * 1024) {
        showToast('파일 크기는 10MB 이하여야 합니다.', 'error');
        return;
    }

    uploadedFile = file;

    // 미리보기
    const reader = new FileReader();
    reader.onload = (e) => {
        const previewImg = document.getElementById('preview-img');
        previewImg.src = e.target.result;

        document.getElementById('upload-placeholder').classList.add('hidden');
        document.getElementById('upload-preview').classList.remove('hidden');
        document.getElementById('upload-zone').classList.add('has-file');
    };
    reader.readAsDataURL(file);
}

// OCR로 사업자등록번호 추출
async function extractBusinessNumber() {
    if (!uploadedFile) {
        showToast('먼저 사업자등록증을 업로드해주세요.', 'error');
        return;
    }

    showLoading('OCR 처리 중...');

    try {
        // Tesseract.js로 OCR 처리
        const result = await Tesseract.recognize(
            uploadedFile,
            'kor',
            {
                logger: (m) => {
                    if (m.status === 'recognizing text') {
                        updateLoadingProgress(Math.round(m.progress * 100));
                    }
                }
            }
        );

        hideLoading();

        // 추출된 텍스트에서 사업자등록번호 찾기
        const text = result.data.text;
        const businessNumberMatch = text.match(/\d{3}[-.]\d{2}[-.]\d{5}/);

        if (businessNumberMatch) {
            businessNumberInput.value = businessNumberMatch[0];
            showToast('사업자등록번호가 추출되었습니다.', 'success');
        } else {
            // 숫자만으로 된 경우도 확인
            const numbersOnly = text.match(/\d{10}/);
            if (numbersOnly) {
                const num = numbersOnly[0];
                businessNumberInput.value = `${num.slice(0, 3)}-${num.slice(3, 5)}-${num.slice(5)}`;
                showToast('사업자등록번호가 추출되었습니다.', 'success');
            } else {
                showToast('사업자등록번호를 찾을 수 없습니다. 직접 입력해주세요.', 'error');
            }
        }
    } catch (error) {
        hideLoading();
        console.error('OCR 에러:', error);
        showToast('OCR 처리에 실패했습니다. 직접 입력해주세요.', 'error');
    }
}

// 폼 제출 처리
async function handleSubmit(e) {
    e.preventDefault();

    showLoading('가입 신청 처리 중...');

    try {
        // 이미지를 Blob으로 변환하여 Supabase Storage에 업로드
        const fileName = `business_licenses/${Date.now()}_${uploadedFile.name}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('documents')
            .upload(fileName, uploadedFile);

        if (uploadError) {
            // 버킷이 없는 경우 생성하거나 다른 방식으로 처리
            console.warn('Storage upload failed, trying alternative method:', uploadError);

            // Base64로 저장하는 대체 방법
            const reader = new FileReader();
            reader.onload = async (e) => {
                uploadedImageUrl = e.target.result; // Base64
                await submitRegistration();
            };
            reader.readAsDataURL(uploadedFile);
            return;
        }

        // 공개 URL 가져오기
        const { data: { publicUrl } } = supabase.storage
            .from('documents')
            .getPublicUrl(fileName);

        uploadedImageUrl = publicUrl;
        await submitRegistration();

    } catch (error) {
        hideLoading();
        console.error('가입 신청 에러:', error);
        showToast('가입 신청에 실패했습니다: ' + error.message, 'error');
    }
}

// 가입 신청 제출
async function submitRegistration() {
    try {
        const { data: { user } } = await supabase.auth.getUser();

        // 프로필 업데이트
        const { error: updateError } = await supabase
            .from('profiles')
            .update({
                academy_name: academyNameInput.value.trim(),
                business_number: businessNumberInput.value,
                name: ownerNameInput.value.trim(),
                full_phone: phoneInput.value,
                business_license_url: uploadedImageUrl,
                role: 'admin',
                approval_status: 'pending'
            })
            .eq('id', user.id);

        if (updateError) throw updateError;

        // 알림 레코드 생성
        const { error: notificationError } = await supabase
            .from('admin_registration_notifications')
            .insert({
                admin_id: user.id
            });

        if (notificationError) {
            console.warn('알림 생성 실패:', notificationError);
        }

        hideLoading();
        showToast('가입 신청이 완료되었습니다!\n승인 대기 페이지로 이동합니다.', 'success');

        setTimeout(() => {
            window.location.href = 'admin-status.html';
        }, 2000);

    } catch (error) {
        hideLoading();
        console.error('제출 에러:', error);
        showToast('가입 신청에 실패했습니다: ' + error.message, 'error');
    }
}

// 로딩 표시
function showLoading(text = '처리 중...') {
    document.getElementById('loading-spinner').classList.remove('hidden');
    document.getElementById('loading-text').textContent = text;
    document.getElementById('loading-percent').textContent = '0%';
}

function hideLoading() {
    document.getElementById('loading-spinner').classList.add('hidden');
}

function updateLoadingProgress(percent) {
    document.getElementById('loading-percent').textContent = percent + '%';
    const circle = document.getElementById('progress-circle');
    const offset = 226 - (226 * percent / 100);
    circle.style.strokeDashoffset = offset;
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

// 키보드 가림 방지 - 입력 필드 포커스 시 스크롤
function handleInputFocus(e) {
    // input이 포커스될 때 화면 중앙으로 스크롤
    setTimeout(() => {
        const input = e.target;
        // scrollIntoView 사용
        input.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
            inline: 'nearest'
        });

        // 추가적으로 Visual Viewport가 지원되면 더 정확한 계산
        if (window.visualViewport) {
            const viewportHeight = window.visualViewport.height;
            const rect = input.getBoundingClientRect();
            const inputCenter = rect.top + rect.height / 2;

            // input이 화면 하단 70% 아래에 있으면 스크롤
            if (inputCenter > viewportHeight * 0.7) {
                window.scrollBy({
                    top: inputCenter - viewportHeight * 0.4,
                    behavior: 'smooth'
                });
            }
        }
    }, 350); // 키보드가 열리는 시간을 고려한 지연
}
