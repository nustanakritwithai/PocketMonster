import { getApp, getApps, initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import { doc, getFirestore, getDoc, serverTimestamp, setDoc } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.mjs';

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export const firebaseAuth = auth;

export async function ensureFirebaseGuest() {
  if (auth.currentUser) return auth.currentUser;
  throw new Error('ต้องเข้าสู่ระบบก่อนเล่นเกม');
}

export async function loadRemoteSave() {
  const user = await ensureFirebaseGuest();
  const snapshot = await getDoc(doc(db, 'players', user.uid, 'saves', 'current'));
  return snapshot.exists() ? snapshot.data().envelope ?? null : null;
}

export async function saveRemoteSave(envelope) {
  const user = await ensureFirebaseGuest();
  await setDoc(doc(db, 'players', user.uid, 'saves', 'current'), {
    envelope,
    updatedAt: serverTimestamp(),
    schemaVersion: envelope?.saveSchemaVersion ?? null,
  }, { merge: true });
  return user.uid;
}

export function observeFirebaseAuth(callback) {
  return onAuthStateChanged(auth, callback);
}
