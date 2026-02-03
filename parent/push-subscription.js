// Web Push API 구독 관리
// VAPID Public Key - 나중에 환경 변수로 대체해야 함
const VAPID_PUBLIC_KEY = 'BPuip6W5Rje9e5VvjFwo3PCIDVxzT-RKd2xDXqK0EloiJDW55IUN0r78sF-A9odNFkRzwLBkVRHezGVr8NtDnBA';

// URL-safe Base64 디코딩
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Push 알림 권한 요청 및 구독
async function subscribeToPushNotifications() {
  if (!('serviceWorker' in navigator)) {
    console.error('[Push] Service Worker를 지원하지 않는 브라우저입니다.');
    alert('이 브라우저는 Service Worker를 지원하지 않습니다.\n최신 Chrome 또는 Safari를 사용해주세요.');
    return false;
  }

  if (!('PushManager' in window)) {
    console.error('[Push] Push API를 지원하지 않는 브라우저입니다.');
    alert('이 브라우저는 Push 알림을 지원하지 않습니다.\n최신 Chrome 또는 Safari(iOS 16.4+)를 사용해주세요.');
    return false;
  }

  try {
    // Service Worker 등록
    console.log('[Push] Service Worker 등록 시도...');
    const registration = await navigator.serviceWorker.register('/parent/sw.js');
    console.log('[Push] Service Worker 등록 완료:', registration);

    // 기존 구독 확인
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      // 새로운 구독 생성
      console.log('[Push] 새로운 Push 구독 생성...');
      const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);

      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey
      });

      console.log('[Push] Push 구독 생성 완료:', subscription);
    } else {
      console.log('[Push] 기존 Push 구독 확인됨:', subscription);
    }

    // Supabase에 구독 정보 저장
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error('[Push] 사용자 정보 가져오기 실패:', userError);
      return false;
    }

    console.log('[Push] Supabase에 구독 정보 저장...');

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        web_push_subscription: subscription.toJSON(),
        push_notification_enabled: true
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('[Push] 구독 정보 저장 실패:', updateError);
      return false;
    }

    console.log('[Push] Push 알림 구독 완료!');
    return true;

  } catch (error) {
    console.error('[Push] Push 알림 구독 실패:', error);

    // 사용자에게 친절한 오류 메시지
    if (error.name === 'NotAllowedError') {
      alert('알림 권한이 거부되었습니다.\n브라우저 설정에서 알림을 허용해주세요.');
    } else if (error.message && error.message.includes('VAPID')) {
      alert('VAPID 키가 설정되지 않았습니다.\n관리자에게 문의해주세요.');
    } else {
      alert('Push 알림 구독에 실패했습니다.\n다시 시도해주세요.');
    }

    return false;
  }
}

// Push 알림 구독 취소
async function unsubscribeFromPushNotifications() {
  try {
    console.log('[Push] Push 구독 취소 시도...');

    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) {
      console.warn('[Push] Service Worker 등록되지 않음');
      return false;
    }

    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      await subscription.unsubscribe();
      console.log('[Push] Push 구독 취소 완료');
    }

    // Supabase에서 구독 정보 삭제
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      const { error } = await supabase
        .from('profiles')
        .update({
          web_push_subscription: null,
          push_notification_enabled: false
        })
        .eq('id', user.id);

      if (error) {
        console.error('[Push] 구독 정보 삭제 실패:', error);
        return false;
      }
    }

    console.log('[Push] Supabase 구독 정보 삭제 완료');
    return true;

  } catch (error) {
    console.error('[Push] 구독 취소 실패:', error);
    return false;
  }
}

// 알림 권한 상태 확인
async function getNotificationPermission() {
  if (!('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

// 알림 권한 요청
async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    return false;
  }

  try {
    const permission = await Notification.requestPermission();
    console.log('[Push] 알림 권한:', permission);
    return permission === 'granted';
  } catch (error) {
    console.error('[Push] 알림 권한 요청 실패:', error);
    return false;
  }
}

// Service Worker가 준비될 때까지 대기
async function waitForServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.ready;
      console.log('[Push] Service Worker 준비 완료:', registration);
      return registration;
    } catch (error) {
      console.error('[Push] Service Worker 준비 실패:', error);
      return null;
    }
  }
  return null;
}

// 초기화 함수 - 페이지 로드 시 호출
async function initPushNotifications() {
  console.log('[Push] Push 알림 초기화 시작...');

  // Service Worker 준비 대기
  await waitForServiceWorker();

  // 현재 권한 상태 확인
  const permission = await getNotificationPermission();
  console.log('[Push] 현재 알림 권한 상태:', permission);

  return permission;
}

// 전역 네임스페이스 내보내기
window.PushNotification = {
  subscribe: subscribeToPushNotifications,
  unsubscribe: unsubscribeFromPushNotifications,
  getPermission: getNotificationPermission,
  requestPermission: requestNotificationPermission,
  init: initPushNotifications
};

// 페이지 로드 시 초기화
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPushNotifications);
} else {
  initPushNotifications();
}
