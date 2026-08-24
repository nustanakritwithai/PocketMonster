import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import { doc, getFirestore, getDoc, serverTimestamp, setDoc } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import { getPocketMonsterFirebaseApp } from './firebase-runtime.mjs';

function services() {
  const app = getPocketMonsterFirebaseApp(globalThis.window?.POCKETMONSTER_RUNTIME_CONFIG);
  return { auth: getAuth(app), db: getFirestore(app) };
}

export async function ensureFirebaseGuest() {
  const { auth } = services();
  if (auth.currentUser) return auth.currentUser;
  throw new Error('ต้องเข้าสู่ระบบก่อนเล่นเกม');
}

export async function loadRemoteSave() {
  const user = await ensureFirebaseGuest();
  const { db } = services();
  const snapshot = await getDoc(doc(db, 'players', user.uid, 'saves', 'current'));
  return snapshot.exists() ? snapshot.data().envelope ?? null : null;
}

export async function saveRemoteSave(envelope) {
  const user = await ensureFirebaseGuest();
  const { db } = services();
  await setDoc(doc(db, 'players', user.uid, 'saves', 'current'), {
    envelope,
    updatedAt: serverTimestamp(),
    schemaVersion: envelope?.saveSchemaVersion ?? null,
  }, { merge: true });
  return user.uid;
}

export function observeFirebaseAuth(callback) {
  const { auth } = services();
  return onAuthStateChanged(auth, callback);
}
