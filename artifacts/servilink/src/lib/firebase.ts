import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  FacebookAuthProvider,
  signInWithPopup,
  type Auth,
  type User as FirebaseUser,
} from "firebase/auth";

interface FirebaseConfig {
  configured: boolean;
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  appId?: string;
}

let _configPromise: Promise<FirebaseConfig> | null = null;
let _auth: Auth | null = null;
let _configured: boolean | null = null;

async function fetchFirebaseConfig(): Promise<FirebaseConfig> {
  if (!_configPromise) {
    _configPromise = fetch("/api/config/firebase")
      .then((r) => r.json())
      .catch(() => ({ configured: false } as FirebaseConfig));
  }
  return _configPromise;
}

export async function initFirebase(): Promise<boolean> {
  if (_configured !== null) return _configured;

  const config = await fetchFirebaseConfig();
  const finalConfig = config.configured && config.apiKey && config.projectId && config.appId
    ? config
    : null;

  if (!finalConfig) {
    _configured = false;
    return false;
  }

  let app: FirebaseApp;
  if (getApps().length === 0) {
    app = initializeApp({
      apiKey: finalConfig.apiKey!,
      authDomain: finalConfig.authDomain!,
      projectId: finalConfig.projectId!,
      appId: finalConfig.appId!,
    });
  } else {
    app = getApps()[0];
  }

  _auth = getAuth(app);
  _configured = true;
  return true;
}

export async function isFirebaseConfigured(): Promise<boolean> {
  return initFirebase();
}

function normalizeFirebaseError(err: unknown): Error {
  const anyErr = err as any;
  const code = anyErr?.code ?? anyErr?.error?.code ?? "unknown";
  const message = anyErr?.message ?? anyErr?.error?.message ?? "Error al iniciar sesión";
  return new Error(`Firebase ${code}: ${message}`);
}

export async function signInWithGoogle(): Promise<{ idToken: string; user: FirebaseUser }> {
  const ok = await initFirebase();
  if (!ok || !_auth) throw new Error("Firebase no está configurado");

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  try {
    const result = await signInWithPopup(_auth, provider);
    const idToken = await result.user.getIdToken();
    return { idToken, user: result.user };
  } catch (err) {
    throw normalizeFirebaseError(err);
  }
}

export async function signInWithFacebook(): Promise<{ idToken: string; user: FirebaseUser }> {
  const ok = await initFirebase();
  if (!ok || !_auth) throw new Error("Firebase no está configurado");

  const provider = new FacebookAuthProvider();
  provider.addScope("email");
  provider.addScope("public_profile");

  try {
    const result = await signInWithPopup(_auth, provider);
    const idToken = await result.user.getIdToken();
    return { idToken, user: result.user };
  } catch (err) {
    throw normalizeFirebaseError(err);
  }
}
