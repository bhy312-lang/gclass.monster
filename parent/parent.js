// 학부모 포털 메인 로직
// 전역 변수
let currentUser = null;
let childrenData = [];
let realtimeChannel = null;

// Firebase 설정
const firebaseConfig = {
  apiKey: "AIzaSyAEmXw8PFP1hPVRJE-0tLbGfpFOrIHs7uc",
  authDomain: "study-room-push.firebaseapp.com",
  projectId: "study-room-push",
  storageBucket: "study-room-push.firebasestorage.app",
  messagingSenderId: "198231754611",
  appId: "1:198231754611:web:675a173730ee251439a706"
};

// Firebase 인스턴스
let firebaseApp = null;
let messaging = null;

// 페이지 로드 시 실행
document.addEventListener('DOMContentLoaded', async () => {
  console.log('[Parent Portal] 초기화 시작...');
  await initializeParentPortal();
});

// 초기화 함수
async function initializeParentPortal() {
  try {
    // 인증 상태 확인
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      console.log('[Parent Portal] 로그인되지 않음, 로그인 페이지로 이동');
      window.location.href = '/login.html';
      return;
    }

    currentUser = session.user;
    console.log('[Parent Portal] 사용자 인증됨:', currentUser.id);

    // 로딩 오버레이 제거
    document.getElementById('loading-overlay').style.display = 'none';

    // 사용자 정보 표시
    await displayUserInfo();

    // 사전등록 학생 자동연동
    await tryClaimStudentsByPhone();

    // 자녀 데이터 로드
    await loadChildrenData();

    // 자녀가 없으면 프로필 설정 페이지로 이동
    if (childrenData.length === 0) {
      console.log('[Parent Portal] 자녀 정보 없음, 프로필 설정 페이지로 이동');
      window.location.href = '/parent/setup.html';
      return;
    }

    // Push 알림 상태 확인 및 설정
    await setupPushNotifications();

    // 실시간 업데이트 구독
    subscribeToRealtimeUpdates();

    // 학습 피드백 로드
    await loadFeedbacks();
    await renderParentContactManager();

    console.log('[Parent Portal] 초기화 완료');

  } catch (error) {
    console.error('[Parent Portal] 초기화 실패:', error);
    showError('초기화에 실패했습니다. 다시 로그인해주세요.');
  }
}

// 사용자 정보 표시

async function tryClaimStudentsByPhone() {
  try {
    const { data, error } = await supabase.rpc('parent_claim_students_by_phone');
    if (error) {
      console.warn('[Parent Portal] parent_claim_students_by_phone error:', error);
      return;
    }
    if (data?.success) {
      const linkedCount = data.linked_count || 0;
      const conflictCount = Array.isArray(data.conflict_candidates) ? data.conflict_candidates.length : 0;
      if (linkedCount > 0 || conflictCount > 0) {
        showSuccess(`자동연동 결과: 연결 ${linkedCount}건, 충돌 ${conflictCount}건`);
      }
    }
  } catch (e) {
    console.warn('[Parent Portal] parent_claim_students_by_phone exception:', e);
  }
}async function displayUserInfo() {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', currentUser.id)
      .single();

    const userName = profile?.full_name || profile?.email?.split('@')[0] || '학부모';

    // Google 프로필 이미지 또는 기본 이미지
    const avatarUrl = currentUser?.user_metadata?.avatar_url ||
                      currentUser?.user_metadata?.picture ||
                      profile?.avatar_url ||
                      `https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=ec4899&color=fff`;

    document.getElementById('user-info').innerHTML = `
      <img src="${avatarUrl}" alt="${userName}" class="w-10 h-10 rounded-full border-2 border-white shadow-md object-cover flex-shrink-0">
      <span class="text-sm font-medium hidden sm:inline">${userName}</span>
      <button onclick="logout()" class="text-xs bg-white text-pink-600 px-3 py-1 rounded-full font-medium shadow-sm hover:shadow transition-shadow flex-shrink-0">
        로그아웃
      </button>
    `;
  } catch (error) {
    console.error('[Parent Portal] 사용자 정보 표시 실패:', error);
  }
}

// 자녀 데이터 로드
async function loadChildrenData() {
  try {
    const { data: children, error } = await supabase
      .from('students')
      .select('*')
      .eq('parent_id', currentUser.id);

    if (error) throw error;

    childrenData = children || [];
    console.log('[Parent Portal] 자녀 데이터 로드:', childrenData.length, '명');

    await renderChildrenStatus();
    await loadAttendanceHistory();
  } catch (error) {
    console.error('[Parent Portal] 자녀 데이터 로드 실패:', error);
    document.getElementById('children-status').innerHTML = `
      <div class="text-center text-gray-500 py-8">
        <p class="text-red-500">자녀 정보를 불러오는데 실패했습니다.</p>
        <button onclick="loadChildrenData()" class="mt-4 text-pink-500 font-medium">
          다시 시도
        </button>
      </div>
    `;
  }
}

// 자녀 현황 렌더링
async function renderChildrenStatus() {
  const container = document.getElementById('children-status');

  if (childrenData.length === 0) {
    container.innerHTML = `
      <div class="text-center text-gray-500 py-8">
        <svg class="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path>
        </svg>
        <p class="font-medium">등록된 자녀가 없습니다.</p>
        <p class="text-sm text-gray-400 mt-1">관리자에게 문의해주세요</p>
      </div>
    `;
    return;
  }

  container.innerHTML = '';
  const today = new Date().toISOString().split('T')[0];

  for (const child of childrenData) {
    try {
      // 오늘의 출결 정보 조회
      const { data: attendance } = await supabase
        .from('attendance')
        .select('*')
        .eq('student_id', child.id)
        .eq('date', today)
        .maybeSingle();

      const isCheckedIn = attendance && attendance.check_in && !attendance.check_out;
      const checkInTime = attendance?.check_in
        ? new Date(attendance.check_in).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
        : '-';
      const checkOutTime = attendance?.check_out
        ? new Date(attendance.check_out).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
        : '-';

      const card = document.createElement('div');
      card.className = `border rounded-xl p-4 transition-all ${
        isCheckedIn
          ? 'border-green-300 bg-gradient-to-r from-green-50 to-emerald-50'
          : 'border-gray-200 bg-gray-50'
      }`;

      card.innerHTML = `
        <div class="flex justify-between items-start">
          <div>
            <h3 class="font-bold text-lg text-gray-800">${child.name}</h3>
            <p class="text-sm text-gray-500">${child.grade || ''}학년</p>
          </div>
          <span class="px-4 py-2 rounded-full text-sm font-bold shadow-sm ${
            isCheckedIn
              ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white'
              : 'bg-gray-200 text-gray-600'
          }">
            ${isCheckedIn ? '📚 등원중' : '🏠 하원'}
          </span>
        </div>
        <div class="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div class="bg-white rounded-lg p-3 shadow-sm">
            <p class="text-gray-500 text-xs mb-1">등원 시간</p>
            <p class="font-bold text-green-600">${checkInTime}</p>
          </div>
          <div class="bg-white rounded-lg p-3 shadow-sm">
            <p class="text-gray-500 text-xs mb-1">하원 시간</p>
            <p class="font-bold text-gray-600">${checkOutTime}</p>
          </div>
        </div>
        ${isCheckedIn && child.seat_number ? `
          <div class="mt-3 flex items-center text-sm bg-pink-100 rounded-lg p-2">
            <span class="text-pink-500 mr-2">🪑</span>
            <div>
              <p class="text-gray-500 text-xs">좌석 번호</p>
              <p class="font-bold text-pink-600">${child.seat_number}번</p>
            </div>
          </div>
        ` : ''}
      `;

      container.appendChild(card);
    } catch (error) {
      console.error('[Parent Portal] 자녀 카드 렌더링 실패:', child.id, error);
    }
  }
}

// 출결 기록 로드
async function loadAttendanceHistory() {
  const container = document.getElementById('attendance-history');

  try {
    const { data: history, error } = await supabase
      .from('attendance')
      .select('*, students(name)')
      .in('student_id', childrenData.map(c => c.id))
      .order('date', { ascending: false })
      .order('check_in', { ascending: false })
      .limit(20);

    if (error) throw error;

    if (!history || history.length === 0) {
      container.innerHTML = `
        <div class="text-center text-gray-500 py-8">
          <p class="text-sm">출결 기록이 없습니다.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = history.map(record => {
      const checkInTime = record.check_in
        ? new Date(record.check_in).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
        : '-';
      const checkOutTime = record.check_out
        ? new Date(record.check_out).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
        : '-';
      const dateObj = new Date(record.date);
      const dateStr = `${dateObj.getMonth() + 1}/${dateObj.getDate()} (${['일', '월', '화', '수', '목', '금', '토'][dateObj.getDay()]})`;

      return `
        <div class="flex justify-between items-center py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors rounded-lg px-2">
          <div>
            <p class="font-medium text-gray-800">${record.students?.name || 'Unknown'}</p>
            <p class="text-xs text-gray-500">${dateStr}</p>
          </div>
          <div class="text-right text-sm">
            <p class="text-green-600 font-medium">입 ${checkInTime}</p>
            <p class="text-gray-600">출 ${checkOutTime}</p>
          </div>
        </div>
      `;
    }).join('');
  } catch (error) {
    console.error('[Parent Portal] 출결 기록 로드 실패:', error);
    container.innerHTML = `
      <div class="text-center text-red-500 py-4">
        <p class="text-sm">출결 기록을 불러오는데 실패했습니다.</p>
      </div>
    `;
  }
}

// Firebase 초기화
async function initializeFirebase() {
  try {
    if (typeof firebase === 'undefined') {
      console.error('[FCM] Firebase SDK가 로드되지 않음');
      return false;
    }

    // Firebase 앱 초기화
    if (!firebaseApp) {
      firebaseApp = firebase.initializeApp(firebaseConfig);
      console.log('[FCM] Firebase 앱 초기화 완료');
    }

    // Messaging 초기화
    if (!messaging) {
      messaging = firebase.messaging();
      console.log('[FCM] Firebase Messaging 초기화 완료');
    }

    // Service Worker 등록
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.register('/parent/firebase-messaging-sw.js');
      console.log('[FCM] Service Worker 등록 완료:', registration.scope);
    }

    // 포그라운드 메시지 수신 핸들러
    messaging.onMessage((payload) => {
      console.log('[FCM] 포그라운드 메시지 수신:', payload);

      // 인앱 알림 표시
      showNotificationPopup({
        title: payload.notification?.title || payload.data?.title,
        body: payload.notification?.body || payload.data?.body,
        type: payload.data?.type || 'check_in'
      });
    });

    return true;
  } catch (error) {
    console.error('[FCM] Firebase 초기화 실패:', error);
    return false;
  }
}

// FCM 토큰 요청 및 저장
async function requestFCMToken() {
  try {
    console.log('[FCM] 토큰 요청 시작...');

    if (!messaging) {
      const error = 'Messaging이 초기화되지 않음';
      console.error('[FCM]', error);
      alert('FCM 오류: ' + error);
      return null;
    }

    // VAPID 키 (Firebase 콘솔 > 프로젝트 설정 > 클라우드 메시징 > 웹 푸시 인증서)
    const vapidKey = 'BG9QNW0L5qLDNPizKL2cGoM9azrRCqzqmBAlyNkboHM6__XdBLtzge3dqkzp2VbZxORbMulRDGyCooCAPKTAhUE';

    console.log('[FCM] getToken() 호출 중...');

    const token = await messaging.getToken({ vapidKey });
    console.log('[FCM] 토큰 획득 성공:', token ? token.substring(0, 20) + '...' : 'null');

    // Supabase에 토큰 저장
    const { error } = await supabase
      .from('profiles')
      .update({
        fcm_token: token,
        push_notification_enabled: true
      })
      .eq('id', currentUser.id);

    if (error) {
      console.error('[FCM] 토큰 저장 실패:', error);
      alert('토큰 저장 실패: ' + error.message);
      return null;
    }

    console.log('[FCM] 토큰이 DB에 저장됨');
    return token;
  } catch (error) {
    console.error('[FCM] 토큰 요청 실패:', error);
    console.error('[FCM] 에러 이름:', error.name);
    console.error('[FCM] 에러 메시지:', error.message);
    console.error('[FCM] 에러 스택:', error.stack);

    // 화면에 에러 표시
    const errorMsg = `FCM 토큰 획득 실패\n\n${error.name}: ${error.message}`;
    alert(errorMsg);

    return null;
  }
}

// FCM 토큰 삭제
async function deleteFCMToken() {
  try {
    if (messaging) {
      await messaging.deleteToken();
      console.log('[FCM] 토큰 삭제됨');
    }

    // DB에서 토큰 제거
    await supabase
      .from('profiles')
      .update({
        fcm_token: null,
        push_notification_enabled: false
      })
      .eq('id', currentUser.id);

    return true;
  } catch (error) {
    console.error('[FCM] 토큰 삭제 실패:', error);
    return false;
  }
}

// Push 알림 설정
async function setupPushNotifications() {
  const permissionStatus = document.getElementById('permission-status');
  const pushToggle = document.getElementById('push-toggle');

  if (!permissionStatus || !pushToggle) {
    console.error('[Parent Portal] Push 알림 UI 요소를 찾을 수 없음');
    return;
  }

  // Firebase 초기화
  const firebaseReady = await initializeFirebase();
  if (!firebaseReady) {
    permissionStatus.textContent = 'Firebase 초기화 실패';
    permissionStatus.className = 'text-sm text-red-500';
    pushToggle.disabled = true;
    return;
  }

  // 알림 권한 상태 확인
  const permission = Notification.permission;
  console.log('[Parent Portal] 알림 권한 상태:', permission);

  switch (permission) {
    case 'granted':
      permissionStatus.textContent = '알림 허용됨 ✓';
      permissionStatus.className = 'text-sm text-green-600 font-medium';

      const { data: profile } = await supabase
        .from('profiles')
        .select('push_notification_enabled, fcm_token')
        .eq('id', currentUser.id)
        .single();

      pushToggle.checked = profile?.push_notification_enabled || false;

      // 토큰이 없으면 자동으로 요청
      if (profile?.push_notification_enabled && !profile?.fcm_token) {
        await requestFCMToken();
      }
      break;

    case 'denied':
      permissionStatus.textContent = '알림 차단됨 (브라우저 설정에서 변경)';
      permissionStatus.className = 'text-sm text-red-500';
      pushToggle.disabled = true;
      pushToggle.checked = false;
      break;

    case 'default':
      permissionStatus.textContent = '알림 미설정';
      permissionStatus.className = 'text-sm text-gray-500';
      pushToggle.checked = false;
      break;
  }

  // 토글 이벤트 리스너
  pushToggle.addEventListener('change', async (e) => {
    if (e.target.checked) {
      // 알림 권한 요청
      const permission = await Notification.requestPermission();

      if (permission === 'granted') {
        const token = await requestFCMToken();
        if (token) {
          permissionStatus.textContent = '알림 허용됨 ✓';
          permissionStatus.className = 'text-sm text-green-600 font-medium';
          showSuccess('알림이 활성화되었습니다!');
        } else {
          e.target.checked = false;
          showError('FCM 토큰 획득에 실패했습니다.');
        }
      } else {
        e.target.checked = false;
        showError('알림 권한이 거부되었습니다.');
      }
    } else {
      const success = await deleteFCMToken();
      if (success) {
        permissionStatus.textContent = '알림 미설정';
        permissionStatus.className = 'text-sm text-gray-500';
        showSuccess('알림이 비활성화되었습니다.');
      } else {
        e.target.checked = true;
      }
    }
  });
}

// 실시간 업데이트 구독
function subscribeToRealtimeUpdates() {
  if (childrenData.length === 0) {
    console.log('[Parent Portal] 자녀가 없어 실시간 업데이트 건너뜀');
    return;
  }

  if (realtimeChannel) {
    console.log('[Parent Portal] 기존 채널 정리');
    supabase.removeChannel(realtimeChannel);
  }

  realtimeChannel = supabase
    .channel('parent-updates')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'attendance',
        filter: `student_id=in.(${childrenData.map(c => c.id).join(',')})`
      },
      async (payload) => {
        console.log('[Parent Portal] 출결 변경 감지:', payload);
        await renderChildrenStatus();
        await loadAttendanceHistory();

        // 변경 알림 토스트
        if (payload.eventType === 'INSERT') {
          showSuccess('새로운 출결 기록이 추가되었습니다.');
        }
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `parent_id=eq.${currentUser.id}`
      },
      (payload) => {
        console.log('[Parent Portal] 새 알림 수신:', payload);
        showNotificationPopup(payload.new);
      }
    )
    .subscribe((status) => {
      console.log('[Parent Portal] 실시간 구독 상태:', status);
    });
}

// 알림 팝업 표시
function showNotificationPopup(notification) {
  // 알림 사운드 재생 (선택적)
  try {
    const audio = new Audio('/sounds/notification.mp3');
    audio.volume = 0.5;
    audio.play().catch(() => {});
  } catch (e) {}

  // 팝업 생성
  const popup = document.createElement('div');
  popup.className = 'fixed top-4 right-4 left-4 md:left-auto md:w-96 bg-white rounded-2xl shadow-2xl border border-pink-200 p-4 z-50 animate-slide-in';
  popup.innerHTML = `
    <div class="flex items-start gap-3">
      <div class="w-12 h-12 rounded-full flex items-center justify-center text-2xl ${
        notification.type === 'check_in'
          ? 'bg-green-100'
          : 'bg-orange-100'
      }">
        ${notification.type === 'check_in' ? '📚' : '🏠'}
      </div>
      <div class="flex-1">
        <h4 class="font-bold text-gray-800">${notification.title}</h4>
        <p class="text-gray-600 text-sm">${notification.body}</p>
        <p class="text-gray-400 text-xs mt-1">${new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</p>
      </div>
      <button onclick="this.parentElement.parentElement.remove()" class="text-gray-400 hover:text-gray-600">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
        </svg>
      </button>
    </div>
  `;

  document.body.appendChild(popup);

  // 알림 읽음 처리
  markNotificationAsRead(notification.id);

  // 5초 후 자동 제거
  setTimeout(() => {
    popup.style.opacity = '0';
    popup.style.transform = 'translateX(100%)';
    setTimeout(() => popup.remove(), 300);
  }, 5000);

  // 자녀 상태 새로고침
  renderChildrenStatus();
  loadAttendanceHistory();
}

// 알림 읽음 처리
async function markNotificationAsRead(notificationId) {
  try {
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', notificationId);
  } catch (error) {
    console.error('[Parent Portal] 알림 읽음 처리 실패:', error);
  }
}

// 로그아웃

async function renderParentContactManager() {
  const container = document.getElementById('parent-contact-manager');
  if (!container) return;

  if (!childrenData || childrenData.length === 0) {
    container.innerHTML = '<p class="text-sm text-gray-500">연결된 학생이 없습니다.</p>';
    return;
  }

  const blocks = [];
  for (const child of childrenData) {
    const { data: contacts, error } = await supabase
      .from('student_notification_contacts')
      .select('id,contact_name,relationship,phone,receive_check_in,receive_check_out')
      .eq('student_id', child.id)
      .order('created_at', { ascending: true });

    if (error) {
      blocks.push(`
        <div class="border border-red-200 rounded-lg p-3 bg-red-50">
          <p class="text-sm font-semibold text-red-600">${child.name}</p>
          <p class="text-xs text-red-500 mt-1">연락처 조회 실패: ${error.message}</p>
        </div>
      `);
      continue;
    }

    const relationLabel = (relation) => {
      const map = {
        father: '아버지',
        mother: '어머니',
        grandfather: '할아버지',
        grandmother: '할머니',
        other: '기타'
      };
      return map[relation] || relation || '기타';
    };

    const rows = (contacts || []).map((c) => `
      <div class="border border-gray-200 rounded-lg p-2 bg-white">
        <div class="flex items-center justify-between gap-2">
          <div>
            <p class="text-sm font-medium text-gray-800">${c.contact_name} (${relationLabel(c.relationship)})</p>
            <p class="text-xs text-gray-500">${c.phone || ''}</p>
          </div>
          <div class="flex items-center gap-3">
            <label class="inline-flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
              <span>등/하원 알림</span>
              <span class="relative inline-flex items-center">
                <input type="checkbox" class="peer sr-only" ${(c.receive_check_in && c.receive_check_out) ? 'checked' : ''} onchange="parentToggleNotificationContact('${c.id}', this.checked)">
                <span class="w-9 h-5 bg-gray-300 peer-checked:bg-emerald-500 rounded-full transition-colors"></span>
                <span class="absolute left-0.5 w-4 h-4 bg-white rounded-full shadow peer-checked:translate-x-4 transition-transform"></span>
              </span>
            </label>
            <button onclick="parentRemoveNotificationContact('${c.id}')" class="text-xs text-red-500 hover:underline">삭제</button>
          </div>
        </div>
      </div>
    `).join('') || '<p class="text-xs text-gray-400">등록된 연락처가 없습니다.</p>';

    blocks.push(`
      <div class="border border-pink-100 rounded-xl p-3 bg-pink-50/50">
        <p class="font-semibold text-gray-800 mb-2">${child.name}</p>
        <div class="space-y-2">${rows}</div>
        <div class="flex gap-2 mt-2 items-center">
          <input id="contact-name-${child.id}" type="text" placeholder="이름" class="w-[24%] px-2 py-1.5 border border-gray-300 rounded-lg text-xs">
          <select id="contact-rel-${child.id}" class="w-[24%] px-2 py-1.5 border border-gray-300 rounded-lg text-xs bg-white">
            <option value="father">아버지</option>
            <option value="mother">어머니</option>
            <option value="grandfather">할아버지</option>
            <option value="grandmother">할머니</option>
            <option value="other">기타</option>
          </select>
          <input id="contact-phone-${child.id}" type="tel" placeholder="010-0000-0000" class="w-[32%] px-2 py-1.5 border border-gray-300 rounded-lg text-xs">
          <button onclick="parentAddNotificationContact('${child.id}')" class="w-[20%] bg-pink-500 hover:bg-pink-600 text-white rounded-lg text-xs py-1.5">추가</button>
        </div>
      </div>
    `);
  }

  container.innerHTML = blocks.join('');
}

async function parentAddNotificationContact(studentId) {
  const nameEl = document.getElementById(`contact-name-${studentId}`);
  const relEl = document.getElementById(`contact-rel-${studentId}`);
  const phoneEl = document.getElementById(`contact-phone-${studentId}`);
  const name = nameEl?.value?.trim();
  const relationship = relEl?.value || 'other';
  const phone = phoneEl?.value?.trim();

  if (!name || !phone) {
    showError('연락처 이름과 전화번호를 입력해주세요.');
    return;
  }

  const { data, error } = await supabase.rpc('parent_add_student_notification_contact', {
    p_student_id: studentId,
    p_contact_name: name,
    p_relationship: relationship,
    p_phone: phone,
    p_receive_check_in: false,
    p_receive_check_out: false
  });

  if (error || data?.success === false) {
    showError(data?.error || error?.message || '연락처 추가 실패');
    return;
  }

  if (nameEl) nameEl.value = '';
  if (relEl) relEl.value = 'father';
  if (phoneEl) phoneEl.value = '';
  await renderParentContactManager();
}

async function parentToggleNotificationContact(contactId, checked) {
  const { data: rowData } = await supabase
    .from('student_notification_contacts')
    .select('contact_name,relationship,phone,is_active,receive_check_in,receive_check_out')
    .eq('id', contactId)
    .limit(1);
  const row = rowData?.[0];
  if (!row) return;

  const { data, error } = await supabase.rpc('parent_update_student_notification_contact', {
    p_contact_id: contactId,
    p_contact_name: row.contact_name,
    p_relationship: row.relationship,
    p_phone: row.phone,
    p_receive_check_in: checked,
    p_receive_check_out: checked,
    p_is_active: !!row.is_active
  });

  if (error || data?.success === false) {
    showError(data?.error || error?.message || '연락처 토글 저장 실패');
    await renderParentContactManager();
  }
}

async function parentRemoveNotificationContact(contactId) {
  const { data, error } = await supabase.rpc('parent_remove_student_notification_contact', {
    p_contact_id: contactId
  });
  if (error || data?.success === false) {
    showError(data?.error || error?.message || '연락처 삭제 실패');
    return;
  }
  await renderParentContactManager();
}

async function logout() {
  try {
    await supabase.auth.signOut();
    window.location.href = '/index.html';
  } catch (error) {
    console.error('[Parent Portal] 로그아웃 실패:', error);
    showError('로그아웃에 실패했습니다.');
  }
}

// 탭 전환
function showTab(tabName) {
  console.log('[Parent Portal] 탭 전환:', tabName);

  // 현재 활성 탭 스타일 제거
  const tabs = document.querySelectorAll('nav button');
  tabs.forEach(tab => {
    tab.classList.remove('text-pink-500');
    tab.classList.add('text-gray-400');
  });

  // 클릭한 탭 활성화
  event.currentTarget.classList.remove('text-gray-400');
  event.currentTarget.classList.add('text-pink-500');

  // TODO: 탭별 화면 구현
  switch (tabName) {
    case 'dashboard':
      // 이미 메인 화면
      break;
    case 'children':
      showInfo('자녀 관리 기능은 준비 중입니다.');
      break;
    case 'history':
      showInfo('상세 기록 기능은 준비 중입니다.');
      break;
    case 'settings':
      showInfo('설정 기능은 준비 중입니다.');
      break;
  }
}

// 유틸리티 함수: 성공 메시지 표시
function showSuccess(message) {
  console.log('[Parent Portal] 성공:', message);
  // TODO: 토스트 알림 구현
  // 간단하게 alert 사용 (나중에 개선)
  // alert(message);
}

// 유틸리티 함수: 오류 메시지 표시
function showError(message) {
  console.error('[Parent Portal] 오류:', message);
  alert(message);
}

// 유틸리티 함수: 정보 메시지 표시
function showInfo(message) {
  console.log('[Parent Portal] 정보:', message);
  alert(message);
}

// 학습 피드백 로드
async function loadFeedbacks() {
  const container = document.getElementById('feedback-list');
  if (!container) return;

  try {
    const { data: feedbacks, error } = await supabase
      .from('student_feedbacks')
      .select('id, feedback_period, generated_message, sent_at, created_at, students(name)')
      .in('student_id', childrenData.map(c => c.id))
      .eq('send_status', 'sent')
      .order('sent_at', { ascending: false })
      .limit(10);

    if (error) throw error;

    if (!feedbacks || feedbacks.length === 0) {
      container.innerHTML = `
        <div class="text-center text-gray-500 py-6">
          <svg class="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
          </svg>
          <p class="text-sm">아직 피드백이 없습니다.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = feedbacks.map(feedback => {
      const date = feedback.sent_at
        ? new Date(feedback.sent_at).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })
        : '';
      const shortMessage = feedback.generated_message
        ? feedback.generated_message.substring(0, 80) + '...'
        : '피드백 내용';

      return `
        <div class="border border-pink-100 rounded-xl p-4 cursor-pointer hover:bg-pink-50 transition-colors"
             onclick="showFeedbackDetail('${feedback.id}')">
          <div class="flex justify-between items-start mb-2">
            <span class="font-bold text-gray-800">${feedback.students?.name || '학생'}</span>
            <span class="text-xs text-gray-500">${date}</span>
          </div>
          <p class="text-xs text-pink-600 mb-2">${feedback.feedback_period || ''}</p>
          <p class="text-sm text-gray-600 line-clamp-2">${shortMessage}</p>
        </div>
      `;
    }).join('');

  } catch (error) {
    console.error('[Parent Portal] 피드백 로드 실패:', error);
    container.innerHTML = `
      <div class="text-center text-red-500 py-4">
        <p class="text-sm">피드백을 불러오는데 실패했습니다.</p>
      </div>
    `;
  }
}

// 피드백 상세 보기
async function showFeedbackDetail(feedbackId) {
  try {
    const { data: feedback, error } = await supabase
      .from('student_feedbacks')
      .select('*, students(name)')
      .eq('id', feedbackId)
      .single();

    if (error) throw error;

    // 모달로 상세 내용 표시
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';
    modal.onclick = (e) => {
      if (e.target === modal) modal.remove();
    };

    const date = feedback.sent_at
      ? new Date(feedback.sent_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
      : '';

    modal.innerHTML = `
      <div class="bg-white rounded-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto shadow-2xl">
        <div class="sticky top-0 bg-gradient-to-r from-pink-500 to-pink-600 text-white p-4 rounded-t-2xl">
          <div class="flex justify-between items-center">
            <div>
              <h3 class="font-bold text-lg">${feedback.students?.name || '학생'} 학습 피드백</h3>
              <p class="text-sm text-pink-100">${feedback.feedback_period || ''} · ${date}</p>
            </div>
            <button onclick="this.closest('.fixed').remove()" class="p-2 hover:bg-white/20 rounded-full">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>
        </div>
        <div class="p-5">
          <div class="prose prose-sm max-w-none text-gray-700 leading-relaxed whitespace-pre-wrap">
            ${feedback.generated_message || '피드백 내용이 없습니다.'}
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

  } catch (error) {
    console.error('[Parent Portal] 피드백 상세 로드 실패:', error);
    showError('피드백을 불러오는데 실패했습니다.');
  }
}

// 페이지 언로드 시 채널 정리
window.addEventListener('beforeunload', () => {
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel);
  }
});

