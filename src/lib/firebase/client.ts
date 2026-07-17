import {
  getApp,
  getApps,
  initializeApp,
  type FirebaseOptions,
} from "firebase/app";

export interface PublicFirebaseEnvironment {
  PUBLIC_FIREBASE_API_KEY?: string;
  PUBLIC_FIREBASE_AUTH_DOMAIN?: string;
  PUBLIC_FIREBASE_PROJECT_ID?: string;
  PUBLIC_FIREBASE_STORAGE_BUCKET?: string;
  PUBLIC_FIREBASE_APP_ID?: string;
  PUBLIC_ADMIN_FIREBASE_EMAIL?: string;
}

export function firebaseConfigFromEnvironment(
  environment: PublicFirebaseEnvironment,
): FirebaseOptions {
  const config = {
    apiKey: environment.PUBLIC_FIREBASE_API_KEY,
    authDomain: environment.PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: environment.PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: environment.PUBLIC_FIREBASE_STORAGE_BUCKET,
    appId: environment.PUBLIC_FIREBASE_APP_ID,
  };
  const missing = Object.entries(config)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length)
    throw new Error(
      `Missing Firebase build configuration: ${missing.join(", ")}`,
    );
  if (config.projectId !== "lexigo-b2aee")
    throw new Error("Firebase project ID must be lexigo-b2aee.");
  return config as FirebaseOptions;
}

export function adminEmailFromEnvironment(
  environment: PublicFirebaseEnvironment,
): string {
  const email = environment.PUBLIC_ADMIN_FIREBASE_EMAIL?.trim();
  if (!email)
    throw new Error("Missing PUBLIC_ADMIN_FIREBASE_EMAIL build configuration.");
  return email;
}

export const firebaseEnvironment: PublicFirebaseEnvironment = import.meta.env;

export function getFirebaseApp() {
  return getApps().length
    ? getApp()
    : initializeApp(firebaseConfigFromEnvironment(firebaseEnvironment));
}
