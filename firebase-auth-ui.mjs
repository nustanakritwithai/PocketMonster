import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, signOut, signInAnonymously, GoogleAuthProvider, signInWithPopup } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import { getPocketMonsterFirebaseApp } from './firebase-runtime.mjs';

let auth;

const text = (id, value, ok = false) => { const node = document.getElementById(id); if (node) { node.textContent = value; node.className = `account-status${ok ? ' ok' : ''}`; } };
const gate = () => document.getElementById('accountGate');
const show = id => { document.getElementById('loginPage')?.classList.toggle('hidden', id !== 'login'); document.getElementById('registerPage')?.classList.toggle('hidden', id !== 'register'); };

function bindAuthUi() {
  document.getElementById('guestLoginBtn')?.addEventListener('click', async () => {
    const button = document.getElementById('guestLoginBtn'); button.disabled = true;
    try { await signInAnonymously(auth); text('loginStatus', 'เข้าสู่ระบบแล้ว กำลังเปิดเกม…', true); }
    catch { text('loginStatus', 'เข้าเล่นแบบแขกไม่สำเร็จ กรุณาลองใหม่'); }
    finally { button.disabled = false; }
  });
  document.getElementById('googleLoginBtn')?.addEventListener('click', async () => {
    const button = document.getElementById('googleLoginBtn'); button.disabled = true;
    try { await signInWithPopup(auth, new GoogleAuthProvider()); text('loginStatus', 'เข้าสู่ระบบแล้ว กำลังเปิดเกม…', true); }
    catch { text('loginStatus', 'เข้าสู่ระบบ Google ไม่สำเร็จ'); }
    finally { button.disabled = false; }
  });
  document.getElementById('showRegisterBtn')?.addEventListener('click', () => { show('register'); text('registerStatus', ''); });
  document.getElementById('backToLoginBtn')?.addEventListener('click', () => { show('login'); text('loginStatus', ''); });
  document.getElementById('loginForm')?.addEventListener('submit', async event => {
    event.preventDefault(); const button = document.getElementById('loginAccountBtn'); button.disabled = true;
    try { await signInWithEmailAndPassword(auth, document.getElementById('loginEmail').value.trim(), document.getElementById('loginPassword').value); text('loginStatus', 'เข้าสู่ระบบแล้ว กำลังเปิดเกม…', true); }
    catch (error) { text('loginStatus', error.code === 'auth/invalid-credential' ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' : 'เข้าสู่ระบบไม่สำเร็จ'); }
    finally { button.disabled = false; }
  });
  document.getElementById('registerForm')?.addEventListener('submit', async event => {
    event.preventDefault(); const button = document.getElementById('registerAccountBtn'); button.disabled = true;
    const email = document.getElementById('registerEmail').value.trim(); const password = document.getElementById('registerPassword').value; const confirm = document.getElementById('registerConfirm').value; const name = document.getElementById('registerDisplayName').value.trim();
    if (password.length < 8 || password !== confirm) { text('registerStatus', 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวและตรงกัน'); button.disabled = false; return; }
    try { const result = await createUserWithEmailAndPassword(auth, email, password); if (name) await updateProfile(result.user, { displayName: name }); text('registerStatus', 'สร้างบัญชีแล้ว กำลังเปิดเกม…', true); }
    catch (error) { text('registerStatus', error.code === 'auth/email-already-in-use' ? 'อีเมลนี้ถูกใช้แล้ว' : 'สมัครสมาชิกไม่สำเร็จ'); }
    finally { button.disabled = false; }
  });
}

export function requireFirebaseLogin(runtimeConfig) {
  auth = getAuth(getPocketMonsterFirebaseApp(runtimeConfig));
  window.POCKETMONSTER_LOGIN_REQUIRED = true;
  bindAuthUi();
  return new Promise(resolve => onAuthStateChanged(auth, user => { if (user) { gate()?.classList.add('hidden'); resolve(user); } else gate()?.classList.remove('hidden'); }));
}

export async function logoutFirebase() { if (!auth) auth = getAuth(getPocketMonsterFirebaseApp()); await signOut(auth); location.reload(); }
