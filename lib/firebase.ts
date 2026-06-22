import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import {
  GoogleAuthProvider,
  connectAuthEmulator,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type Auth,
  type User,
} from "firebase/auth";
import {
  collection,
  connectFirestoreEmulator,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  type CollectionReference,
  type DocumentData,
  type DocumentReference,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore";
import { createSeedCharacter } from "@/lib/seed-data";
import { type CharacterData } from "@/lib/types";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const configReady = Object.values(firebaseConfig).every(Boolean);
const CHARACTER_ID = "brek-field-kit";
const SCHEMA_VERSION = 2;

const LIST_COLLECTION_KEYS = [
  "resources",
  "reminders",
  "attacks",
  "spells",
  "elixirs",
  "features",
  "tools",
  "infusionsKnown",
  "infusionsActive",
  "inventory",
  "restChecklist",
  "eventLog",
] as const;

const STATE_DOC_KEYS = ["abilities", "stats", "savingThrows", "decisionPrompts", "companion", "longRest", "ui"] as const;

type ListCollectionKey = (typeof LIST_COLLECTION_KEYS)[number];
type StateDocKey = (typeof STATE_DOC_KEYS)[number];

type CharacterRootDoc = Pick<CharacterData, "id" | "core" | "currentSessionLabel" | "notes"> & {
  schemaVersion: number;
  updatedAt: unknown;
};

type StructuredCharacterDocs = {
  root: CharacterRootDoc;
  state: Pick<CharacterData, StateDocKey>;
  lists: Pick<CharacterData, ListCollectionKey>;
};

type IndexedFirestoreDoc<T> = T & {
  _sortOrder?: number;
};

let emulatorConnected = false;
const googleProvider = new GoogleAuthProvider();

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

function characterRootRef(services: FirebaseServices, userId: string, characterId = CHARACTER_ID) {
  return doc(services.db, "users", userId, "characters", characterId);
}

function stateDocRef(rootRef: DocumentReference<DocumentData>, key: StateDocKey) {
  return doc(rootRef, "state", key);
}

function listCollectionRef(rootRef: DocumentReference<DocumentData>, key: ListCollectionKey) {
  return collection(rootRef, key) as CollectionReference<DocumentData>;
}

function isLegacyCharacterPayload(data: DocumentData | undefined): data is CharacterData {
  if (!data || typeof data !== "object") {
    return false;
  }

  return "core" in data && "stats" in data && "spells" in data && !("schemaVersion" in data);
}

function stripSortOrder<T>(data: IndexedFirestoreDoc<T>): T {
  const { _sortOrder: _ignored, ...rest } = data as IndexedFirestoreDoc<T> & Record<string, unknown>;
  return rest as T;
}

function cloneCharacter(data: CharacterData) {
  return JSON.parse(JSON.stringify(data)) as CharacterData;
}

function areEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function loadIndexedCollection<T>(rootRef: DocumentReference<DocumentData>, key: ListCollectionKey): Promise<T[]> {
  const snapshot = await getDocs(listCollectionRef(rootRef, key));
  return snapshot.docs
    .map((item) => item.data() as IndexedFirestoreDoc<T>)
    .sort((left, right) => (left._sortOrder ?? 0) - (right._sortOrder ?? 0))
    .map((item) => stripSortOrder(item));
}

async function loadStructuredCharacter(
  services: FirebaseServices,
  userId: string,
  characterId: string,
): Promise<CharacterData> {
  const seed = createSeedCharacter();
  const rootRef = characterRootRef(services, userId, characterId);

  const [rootSnapshot, ...stateSnapshots] = await Promise.all([
    getDoc(rootRef),
    ...STATE_DOC_KEYS.map((key) => getDoc(stateDocRef(rootRef, key))),
  ]);

  const rootData = (rootSnapshot.data() as Partial<CharacterRootDoc> | undefined) ?? {};

  const state = STATE_DOC_KEYS.reduce((accumulator, key, index) => {
    accumulator[key] = (stateSnapshots[index].data() as CharacterData[typeof key] | undefined) ?? seed[key];
    return accumulator;
  }, {} as Pick<CharacterData, StateDocKey>);

  const listEntries = await Promise.all(
    LIST_COLLECTION_KEYS.map(async (key) => [key, await loadIndexedCollection<CharacterData[typeof key][number]>(rootRef, key)] as const),
  );

  const lists = Object.fromEntries(listEntries) as Pick<CharacterData, ListCollectionKey>;

  return {
    ...seed,
    id: rootData.id ?? characterId,
    core: rootData.core ?? seed.core,
    currentSessionLabel: rootData.currentSessionLabel ?? seed.currentSessionLabel,
    notes: rootData.notes ?? seed.notes,
    ...state,
    ...lists,
  };
}

function splitCharacterForStorage(data: CharacterData): StructuredCharacterDocs {
  return {
    root: {
      id: data.id,
      core: data.core,
      currentSessionLabel: data.currentSessionLabel,
      notes: data.notes,
      schemaVersion: SCHEMA_VERSION,
      updatedAt: serverTimestamp(),
    },
    state: {
      abilities: data.abilities,
      stats: data.stats,
      savingThrows: data.savingThrows,
      decisionPrompts: data.decisionPrompts,
      companion: data.companion,
      longRest: data.longRest,
      ui: data.ui,
    },
    lists: {
      resources: data.resources,
      reminders: data.reminders,
      attacks: data.attacks,
      spells: data.spells,
      elixirs: data.elixirs,
      features: data.features,
      tools: data.tools,
      infusionsKnown: data.infusionsKnown,
      infusionsActive: data.infusionsActive,
      inventory: data.inventory,
      restChecklist: data.restChecklist,
      eventLog: data.eventLog,
    },
  };
}

async function syncIndexedCollection(
  rootRef: DocumentReference<DocumentData>,
  key: ListCollectionKey,
  items: Array<{ id: string }>,
) {
  const existingSnapshot = await getDocs(listCollectionRef(rootRef, key));
  const existingIds = new Set(existingSnapshot.docs.map((item) => item.id));
  const batch = writeBatch(rootRef.firestore);

  items.forEach((item, index) => {
    const ref = doc(rootRef, key, item.id);
    batch.set(ref, { ...item, _sortOrder: index });
    existingIds.delete(item.id);
  });

  existingIds.forEach((staleId) => {
    batch.delete(doc(rootRef, key, staleId));
  });

  await batch.commit();
}

function applyRootToCharacter(target: CharacterData, rootData: Partial<CharacterRootDoc>) {
  target.id = rootData.id ?? target.id;
  target.core = rootData.core ?? target.core;
  target.currentSessionLabel = rootData.currentSessionLabel ?? target.currentSessionLabel;
  target.notes = rootData.notes ?? target.notes;
}

export function listenForGoogleUser(
  services: FirebaseServices,
  onReady: (user: User) => void,
  onSignedOut: () => void,
  onError: (message: string) => void,
) {
  return onAuthStateChanged(services.auth, (user) => {
    try {
      if (!user) {
        onSignedOut();
        return;
      }

      onReady(user);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Google auth state check failed.");
    }
  });
}

export async function signInWithGoogle(services: FirebaseServices) {
  try {
    const result = await signInWithPopup(services.auth, googleProvider);
    return result.user;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google sign-in failed.";
    if (message.toLowerCase().includes("popup")) {
      await signInWithRedirect(services.auth, googleProvider);
      return null;
    }

    throw error;
  }
}

export async function signOutUser(services: FirebaseServices) {
  await signOut(services.auth);
}

export function subscribeToCharacter(
  services: FirebaseServices,
  userId: string,
  onData: (data: CharacterData) => void,
  onMissing: () => Promise<void>,
) {
  const ref = characterRootRef(services, userId, CHARACTER_ID);
  const working = cloneCharacter(createSeedCharacter());
  const unsubs: Unsubscribe[] = [];
  let childListenersReady = false;
  let missingHandled = false;
  let lastPayload = "";

  function emit() {
    const next = JSON.stringify(working);
    if (next === lastPayload) {
      return;
    }

    lastPayload = next;
    onData(cloneCharacter(working));
  }

  function attachStructuredListeners(rootRef: DocumentReference<DocumentData>) {
    if (childListenersReady) {
      return;
    }

    childListenersReady = true;

    STATE_DOC_KEYS.forEach((key) => {
      unsubs.push(
        onSnapshot(stateDocRef(rootRef, key), (snapshot) => {
          if (!snapshot.exists()) {
            return;
          }

          working[key] = snapshot.data() as CharacterData[typeof key];
          emit();
        }),
      );
    });

    LIST_COLLECTION_KEYS.forEach((key) => {
      unsubs.push(
        onSnapshot(listCollectionRef(rootRef, key), (snapshot) => {
          working[key] = snapshot.docs
            .map((item) => item.data() as IndexedFirestoreDoc<CharacterData[typeof key][number]>)
            .sort((left, right) => (left._sortOrder ?? 0) - (right._sortOrder ?? 0))
            .map((item) => stripSortOrder(item)) as CharacterData[typeof key];
          emit();
        }),
      );
    });
  }

  const rootUnsub = onSnapshot(ref, async (snapshot) => {
    if (!snapshot.exists()) {
      if (!missingHandled) {
        missingHandled = true;
        await onMissing();
      }
      return;
    }

    missingHandled = false;

    const raw = snapshot.data();
    if (isLegacyCharacterPayload(raw)) {
      await saveCharacter(services, userId, raw);
      onData(raw);
      return;
    }

    applyRootToCharacter(working, raw as Partial<CharacterRootDoc>);
    emit();
    attachStructuredListeners(ref);
  });

  return () => {
    rootUnsub();
    unsubs.forEach((unsubscribe) => unsubscribe());
  };
}

export async function saveCharacter(services: FirebaseServices, userId: string, data: CharacterData) {
  const rootRef = characterRootRef(services, userId, data.id);
  const split = splitCharacterForStorage(data);
  const batch = writeBatch(services.db);

  batch.set(rootRef, split.root);

  STATE_DOC_KEYS.forEach((key) => {
    batch.set(stateDocRef(rootRef, key), split.state[key]);
  });

  await batch.commit();

  await Promise.all(LIST_COLLECTION_KEYS.map((key) => syncIndexedCollection(rootRef, key, split.lists[key])));
}

export async function saveCharacterChanges(
  services: FirebaseServices,
  userId: string,
  previous: CharacterData,
  next: CharacterData,
) {
  if (areEqual(previous, next)) {
    return;
  }

  const previousSplit = splitCharacterForStorage(previous);
  const nextSplit = splitCharacterForStorage(next);
  const rootRef = characterRootRef(services, userId, next.id);
  const batch = writeBatch(services.db);
  let hasBatchWrites = false;

  if (
    !areEqual(previousSplit.root.id, nextSplit.root.id) ||
    !areEqual(previousSplit.root.core, nextSplit.root.core) ||
    !areEqual(previousSplit.root.currentSessionLabel, nextSplit.root.currentSessionLabel) ||
    !areEqual(previousSplit.root.notes, nextSplit.root.notes)
  ) {
    batch.set(rootRef, nextSplit.root);
    hasBatchWrites = true;
  }

  STATE_DOC_KEYS.forEach((key) => {
    if (!areEqual(previousSplit.state[key], nextSplit.state[key])) {
      batch.set(stateDocRef(rootRef, key), nextSplit.state[key]);
      hasBatchWrites = true;
    }
  });

  if (hasBatchWrites) {
    await batch.commit();
  }

  await Promise.all(
    LIST_COLLECTION_KEYS.filter((key) => !areEqual(previousSplit.lists[key], nextSplit.lists[key])).map((key) =>
      syncIndexedCollection(rootRef, key, nextSplit.lists[key]),
    ),
  );
}

export { configReady as isFirebaseConfigured };
