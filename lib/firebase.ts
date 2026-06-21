import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInAnonymously, onAuthStateChanged, type Auth, type User } from "firebase/auth";
import { connectFirestoreEmulator, doc, getFirestore, onSnapshot, setDoc, type Firestore } from "firebase/firestore";
import { CharacterData } from "@/lib/types";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const configReady = Object.values(firebaseConfig).every(Boolean);

let emulatorConnected = false;

export type FirebaseServices = {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
};

export function getFirebaseServices(): FirebaseServices | null {
  if (!configReady) {
    return null;
  }

  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  if (!emulatorConnected && process.env.NEXT_PUBLIC_FIREBASE_USE_EMULATORS === "true") {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
    emulatorConnected = true;
  }

  return { app, auth, db };
}

export function listenForAnonymousUser(
  services: FirebaseServices,
  onReady: (user: User) => void,
  onError: (message: string) => void,
) {
  return onAuthStateChanged(services.auth, async (user) => {
    try {
      if (!user) {
        const result = await signInAnonymously(services.auth);
        onReady(result.user);
        return;
      }

      onReady(user);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Anonymous sign-in failed.");
    }
  });
}

export function subscribeToCharacter(
  services: FirebaseServices,
  userId: string,
  onData: (data: CharacterData) => void,
  onMissing: () => Promise<void>,
) {
  const ref = doc(services.db, "users", userId, "characters", "brek-field-kit");

  return onSnapshot(ref, async (snapshot) => {
    if (!snapshot.exists()) {
      await onMissing();
      return;
    }

    onData(snapshot.data() as CharacterData);
  });
}

export async function saveCharacter(services: FirebaseServices, userId: string, data: CharacterData) {
  const ref = doc(services.db, "users", userId, "characters", data.id);
  await setDoc(ref, data, { merge: true });
}

export { configReady as isFirebaseConfigured };
