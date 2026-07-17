/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_FIREBASE_API_KEY?: string;
  readonly PUBLIC_FIREBASE_AUTH_DOMAIN?: string;
  readonly PUBLIC_FIREBASE_PROJECT_ID?: string;
  readonly PUBLIC_FIREBASE_STORAGE_BUCKET?: string;
  readonly PUBLIC_FIREBASE_APP_ID?: string;
  readonly PUBLIC_ADMIN_FIREBASE_EMAIL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
