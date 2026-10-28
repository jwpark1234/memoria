import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Tauri CLI가 beforeDev/BuildCommand 실행 시 설정하는 값. 데스크톱 빌드에는 PWA(서비스워커)가 필요 없다.
const isTauri = !!process.env.TAURI_ENV_PLATFORM

export default defineConfig({
  // 데스크톱 전용 OAuth 클라이언트 값은 웹(PWA) 번들에 싣지 않는다.
  define: isTauri
    ? {}
    : {
        'import.meta.env.VITE_GOOGLE_DESKTOP_CLIENT_ID': '""',
        'import.meta.env.VITE_GOOGLE_DESKTOP_CLIENT_SECRET': '""',
      },
  plugins: [
    react(),
    !isTauri &&
      VitePWA({
        registerType: 'autoUpdate',
        // 구글 로그인에서 돌아오는 Firebase 처리 페이지(/__/auth/handler)를 서비스워커가 index.html로 바꿔치지 않게 한다.
        workbox: { navigateFallbackDenylist: [/^\/__\//] },
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
