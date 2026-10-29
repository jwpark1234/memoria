// 서비스워커에 덧붙이는 스크립트 (vite.config.ts의 workbox.importScripts).

// 앱이 꺼져 있을 때 오는 일정 푸시 (push/src/index.ts가 FCM으로 보낸다).
// FCM 웹 푸시는 {"data": {...}, "from": ..., ...} 모양으로 온다.
self.addEventListener('push', (event) => {
  let msg = {}
  try {
    msg = event.data ? event.data.json() : {}
  } catch {
    // 형식이 다르면 기본 문구로 띄운다 (iOS는 푸시마다 알림을 꼭 띄워야 한다)
  }
  const d = msg.data || msg.notification || {}
  event.waitUntil(
    self.registration.showNotification(d.title || 'Memoria', {
      body: d.body || '',
      icon: '/pwa-192x192.png',
      // 앱이 직접 띄운 같은 일정 알림과 하나로 합친다 (src/lib/alarms.ts)
      tag: d.tag || undefined,
    }),
  )
})

// 일정 알림을 누르면 열려 있는 앱으로 가거나 새로 연다.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const client = list[0]
      return client ? client.focus() : self.clients.openWindow('/')
    }),
  )
})
