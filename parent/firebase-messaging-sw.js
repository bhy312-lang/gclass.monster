// Firebase Messaging Service Worker
// FCM 백그라운드 알림 처리

importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// Firebase 설정 (parent.js와 동일해야 함)
const firebaseConfig = {
  apiKey: "AIzaSyAEmXw8PFP1hPVRJE-0tLbGfpFOrIHs7uc",
  authDomain: "study-room-push.firebaseapp.com",
  projectId: "study-room-push",
  storageBucket: "study-room-push.firebasestorage.app",
  messagingSenderId: "198231754611",
  appId: "1:198231754611:web:675a173730ee251439a706"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// 백그라운드 메시지 처리
messaging.onBackgroundMessage((payload) => {
  console.log('[SW] 백그라운드 메시지 수신:', payload);

  const notificationTitle = payload.notification?.title || payload.data?.title || '꿈터공부방 알림';
  const notificationOptions = {
    body: payload.notification?.body || payload.data?.body || '',
    icon: '/parent/icons/pwa_icon_192x192.png',
    badge: '/parent/icons/pwa_icon_72x72.png',
    tag: payload.data?.type || 'attendance',
    data: payload.data,
    vibrate: [200, 100, 200],
    requireInteraction: true,
    actions: [
      { action: 'view', title: '확인하기' },
      { action: 'close', title: '닫기' }
    ]
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// 알림 클릭 처리
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] 알림 클릭:', event.action);
  event.notification.close();

  if (event.action === 'view' || !event.action) {
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        // 이미 열려있는 창이 있으면 포커스
        for (const client of clientList) {
          if (client.url.includes('/parent/') && 'focus' in client) {
            return client.focus();
          }
        }
        // 없으면 새 창 열기
        if (clients.openWindow) {
          return clients.openWindow('/parent/');
        }
      })
    );
  }
});

console.log('[SW] Firebase Messaging Service Worker 로드됨');
