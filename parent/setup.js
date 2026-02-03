// 프로필 설정 페이지 로직
let currentUser = null;
let currentProfile = null;

// 페이지 로드 시 실행
document.addEventListener('DOMContentLoaded', async () => {
  console.log('[Setup] 초기화 시작...');
  await initializeSetup();
});

// 초기화 함수
async function initializeSetup() {
  try {
    // 인증 상태 확인
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      console.log('[Setup] 로그인되지 않음, 로그인 페이지로 이동');
      window.location.href = '/login.html?redirect=' + encodeURIComponent('/parent/setup.html');
      return;
    }

    currentUser = session.user;
    console.log('[Setup] 사용자 인증됨:', currentUser.id);

    // 로딩 오버레이 제거
    document.getElementById('loading-overlay').style.display = 'none';

    // 기존 프로필 확인
    await checkExistingProfile();

    // 폼 이벤트 리스너
    setupFormListeners();

    console.log('[Setup] 초기화 완료');

  } catch (error) {
    console.error('[Setup] 초기화 실패:', error);
    showError('초기화에 실패했습니다. 다시 로그인해주세요.');
  }
}

// 기존 프로필 확인
async function checkExistingProfile() {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', currentUser.id)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('[Setup] 프로필 조회 실패:', error);
    return;
  }

  if (profile) {
    currentProfile = profile;

    // 자녀가 이미 있는지 확인
    const { data: students, error: studentsError } = await supabase
      .from('students')
      .select('*')
      .eq('parent_id', currentUser.id);

    if (!studentsError && students && students.length > 0) {
      // 이미 설정 완료됨
      console.log('[Setup] 이미 설정 완료됨, parent 페이지로 이동');
      window.location.href = '/parent/';
      return;
    }

    // 핸드폰 번호가 있으면 채우기
    if (profile.phone) {
      const phoneInput = document.getElementById('phone');
      if (phoneInput) phoneInput.value = profile.phone;
    }
  }
}

// 폼 이벤트 리스너 설정
function setupFormListeners() {
  const form = document.getElementById('setup-form');
  const phoneInput = document.getElementById('phone');

  // 핸드폰 번호 자동 포맷
  phoneInput.addEventListener('input', (e) => {
    let value = e.target.value.replace(/[^0-9]/g, '');
    if (value.length > 11) value = value.slice(0, 11);

    // 010-1234-5678 형식으로 변환
    if (value.length >= 8) {
      e.target.value = value.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
    } else if (value.length >= 4) {
      e.target.value = value.replace(/(\d{3})(\d{4})/, '$1-$2');
    } else {
      e.target.value = value;
    }
  });

  // 폼 제출
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveProfile();
  });
}

// 프로필 저장
async function saveProfile() {
  const phone = document.getElementById('phone').value.trim();
  const studentName = document.getElementById('student-name').value.trim();
  const studentGrade = document.getElementById('student-grade').value;

  // 유효성 검사
  if (!phone || phone.length < 13) {
    showError('핸드폰 번호를 올바르게 입력해주세요.');
    return;
  }

  if (!studentName || studentName.length < 1) {
    showError('자녀 이름을 입력해주세요.');
    return;
  }

  // 로딩 표시
  showLoading(true);

  try {
    // 1. 프로필 업데이트 (핸드폰 번호)
    const phoneDigits = phone.replace(/[^0-9]/g, '');
    const phoneLast4 = phoneDigits.slice(-4);

    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        phone: phone,
        phone_last4: phoneLast4
      })
      .eq('id', currentUser.id);

    if (profileError) {
      console.error('[Setup] 프로필 업데이트 실패:', profileError);
      showError('핸드폰 번호 저장에 실패했습니다.');
      showLoading(false);
      return;
    }

    // 2. 자녀 정보 저장
    const studentData = {
      name: studentName,
      parent_id: currentUser.id,
      parent_phone_last4: phoneLast4
    };

    if (studentGrade) {
      studentData.grade = studentGrade;
    }

    const { error: studentError } = await supabase
      .from('students')
      .insert(studentData);

    if (studentError) {
      console.error('[Setup] 자녀 정보 저장 실패:', studentError);
      showError('자녀 정보 저장에 실패했습니다.');
      showLoading(false);
      return;
    }

    console.log('[Setup] 프로필 설정 완료');
    showSuccess('프로필 설정이 완료되었습니다!');

    // parent 페이지로 이동
    setTimeout(() => {
      window.location.href = '/parent/';
    }, 1000);

  } catch (error) {
    console.error('[Setup] 저장 중 오류:', error);
    showError('저장 중 오류가 발생했습니다.');
    showLoading(false);
  }
}

// 로딩 표시/숨김
function showLoading(show) {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) {
    overlay.style.display = show ? 'flex' : 'none';
  }
}

// 성공 메시지
function showSuccess(message) {
  const existingAlert = document.querySelector('.setup-alert');
  if (existingAlert) existingAlert.remove();

  const alert = document.createElement('div');
  alert.className = 'setup-alert fixed top-4 left-1/2 transform -translate-x-1/2 px-6 py-3 rounded-lg shadow-lg z-50 bg-green-500 text-white font-medium';
  alert.textContent = message;
  document.body.appendChild(alert);

  setTimeout(() => alert.remove(), 3000);
}

// 에러 메시지
function showError(message) {
  const existingAlert = document.querySelector('.setup-alert');
  if (existingAlert) existingAlert.remove();

  const alert = document.createElement('div');
  alert.className = 'setup-alert fixed top-4 left-1/2 transform -translate-x-1/2 px-6 py-3 rounded-lg shadow-lg z-50 bg-red-500 text-white font-medium';
  alert.textContent = message;
  document.body.appendChild(alert);

  setTimeout(() => alert.remove(), 3000);
}
