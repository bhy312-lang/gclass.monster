// Service Worker for PWA Push Notifications
// 캐시 이름
const CACHE_NAME = 'parent-app-v1';
const urlsToCache = [
  '/parent/',
  '/parent/index.html',
  '/parent/parent.js',
  '/parent/parent.css',
  '/parent/manifest.json'
  // CDN 리소스는 캐시하지 않음 (CORS 문제 방지)
];

// 설치 이벤트 - 캐싱
self.addEventListener('install', (event) => {
  console.log('[Service Worker] 설치 중...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] 파일 캐싱:', urlsToCache);
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('[Service Worker] 설치 완료');
        return self.skipWaiting();
      })
  );
});

// 활성화 이벤트 - 오래된 캐시 삭제
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] 활성화 중...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] 오래된 캐시 삭제:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[Service Worker] 활성화 완료');
      return self.clients.claim();
    })
  );
});

// Fetch 이벤트 - 네트워크 요청 처리 (캐시 우선)
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // 캐시에 있으면 반환
        if (response) {
          return response;
        }

        // 캐시에 없으면 네트워크 요청
        return fetch(event.request).then(
          (response) => {
            // 유효한 응답인지 확인
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // 응답 복제 및 캐시 저장
            const responseToCache = response.clone();
            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              });

            return response;
          }
        ).catch((error) => {
          console.error('[Service Worker] Fetch 실패:', error);
          throw error;
        });
      })
  );
});

// Push 알림 수신
self.addEventListener('push', (event) => {
  console.log('[Service Worker] Push 알림 수신');

  let data = {
    title: '꿈터공부방',
    body: '새로운 알림이 도착했습니다',
    url: '/parent/',
    studentId: null,
    type: null
  };

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
      console.log('[Service Worker] Push 데이터:', data);
    } catch (error) {
      console.error('[Service Worker] JSON 파싱 실패:', error);
    }
  }

  const options = {
    body: data.body || '',
    icon: '/parent/icons/pwa_icon_192x192.png',
    badge: '/parent/icons/pwa_icon_72x72.png',
    vibrate: [200, 100, 200],
    tag: `attendance-${data.studentId || 'general'}`,
    data: {
      url: data.url || '/parent/',
      studentId: data.studentId,
      type: data.type,
      timestamp: data.timestamp
    },
    actions: [
      {
        action: 'view',
        title: '자세히 보기',
        icon: '/parent/icons/pwa_icon_72x72.png'
      },
      {
        action: 'close',
        title: '닫기'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// 알림 클릭 처리
self.addEventListener('notificationclick', (event) => {
  console.log('[Service Worker] 알림 클릭:', event.action);

  event.notification.close();

  if (event.action === 'view' || !event.action) {
    const url = event.notification.data.url || '/parent/';

    event.waitUntil(
      clients.matchAll({ type: 'window' }).then((clientList) => {
        // 이미 열린 창이 있는지 확인
        for (const client of clientList) {
          if (client.url === url && 'focus' in client) {
            return client.focus();
          }
        }

        // 열린 창이 없으면 새 창 열기
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
    );
  }
});

// 메시지 수신 (앱에서 Service Worker로 통신)
self.addEventListener('message', (event) => {
  console.log('[Service Worker] 메시지 수신:', event.data);

  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
