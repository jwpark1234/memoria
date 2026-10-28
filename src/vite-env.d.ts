/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

// package.json의 version (vite.config.ts에서 넣는다)
declare const __APP_VERSION__: string

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string
  readonly VITE_FIREBASE_AUTH_DOMAIN: string
  readonly VITE_FIREBASE_PROJECT_ID: string
  readonly VITE_FIREBASE_APP_ID: string
  readonly VITE_GOOGLE_DESKTOP_CLIENT_ID: string
  readonly VITE_GOOGLE_DESKTOP_CLIENT_SECRET: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
