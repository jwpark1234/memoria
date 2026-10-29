import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Tauri CLI가 beforeDev/BuildCommand 실행 시 설정하는 값. 데스크톱 빌드에는 PWA(서비스워커)가 필요 없다.
const isTauri = !!process.env.TAURI_ENV_PLATFORM
const { version } = JSON.parse(readFileSync('package.json', 'utf-8'))

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
    // 데스크톱 전용 OAuth 클라이언트 값은 웹(PWA) 번들에 싣지 않는다.
    ...(!isTauri && {
      'import.meta.env.VITE_GOOGLE_DESKTOP_CLIENT_ID': '""',
      'import.meta.env.VITE_GOOGLE_DESKTOP_CLIENT_SECRET': '""',
    }),
  },
  plugins: [
    react(),
    VitePWA({
      // 데스크톱에서는 꺼 둔다. 꺼져 있어도 virtual:pwa-register는 아무 일도 안 하는 모듈로 남아 import할 수 있다.
      disable: isTauri,
      // 새 버전을 바로 적용하지 않고 기다렸다가, 사용자가 업데이트 버튼을 누르면 적용한다 (lib/update.ts).
      registerType: 'prompt',
      // 구글 로그인에서 돌아오는 Firebase 처리 페이지(/__/auth/handler)를 서비스워커가 index.html로 바꿔치지 않게 한다.
      // sw-notify.js: 일정 알림을 누르면 앱을 연다 (lib/alarms.ts)
      workbox: { navigateFallbackDenylist: [/^\/__\//], importScripts: ['sw-notify.js'] },
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'icon.svg'],
      manifest: {
        name: 'Memoria',
        short_name: 'Memoria',
        description: '가볍고 빠른 동기화 메모',
        lang: 'ko',
        display: 'standalone',
        start_url: '/',
        theme_color: '#1c1c1e',
        background_color: '#1c1c1e',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  clearScreen: false,
  server: { port: 5173, strictPort: true },
  build: { target: 'es2022' },
})
