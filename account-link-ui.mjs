import { establishReadOnlyBridge, linkFirebaseAccount } from './server-auth.mjs';

function setStatus(message, ok = false) {
  const node = document.getElementById('monsterLifeLinkStatus');
  if (node) { node.textContent = message; node.dataset.ok = String(ok); }
}

export async function presentAuthProfileBridge(config, firebaseUser, initialBridge) {
  const panel = document.getElementById('monsterLifeProfilePanel');
  const dialog = document.getElementById('monsterLifeLinkDialog');
  const render = bridge => {
    if (panel) {
      panel.hidden = false;
      panel.dataset.state = bridge.state;
      panel.textContent = bridge.state === 'linked'
        ? `MonsterLife: ${bridge.profile?.displayName || bridge.profile?.username || 'Linked'} · ${bridge.profile?.character?.name || 'ยังไม่มีตัวละคร'}`
        : bridge.state === 'unlinked' ? 'MonsterLife: ยังไม่ได้เชื่อมบัญชี (Firebase fallback)' : 'MonsterLife: Firebase fallback';
    }
  };
  render(initialBridge);
  if (initialBridge.state !== 'unlinked' || !config.featureFlags.accountLinking || !dialog) return initialBridge;
  dialog.showModal();
  document.getElementById('monsterLifeLinkLater')?.addEventListener('click', () => dialog.close(), { once: true });
  document.getElementById('monsterLifeLinkForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const submit = document.getElementById('monsterLifeLinkSubmit');
    submit.disabled = true;
    try {
      await linkFirebaseAccount(config, firebaseUser, {
        username: document.getElementById('monsterLifeUsername').value.trim(),
        password: document.getElementById('monsterLifePassword').value,
      });
      const bridge = await establishReadOnlyBridge(config, firebaseUser);
      if (bridge.state !== 'linked') throw Object.assign(new Error('เชื่อมบัญชีแล้วแต่ยังอ่านโปรไฟล์ไม่ได้'), { code: bridge.errorCode });
      document.getElementById('monsterLifePassword').value = '';
      render(bridge);
      setStatus('เชื่อมบัญชีสำเร็จ — เปิดอ่านโปรไฟล์เท่านั้น', true);
      setTimeout(() => dialog.close(), 700);
    } catch (error) {
      setStatus(error.code === 'LINK_TARGET_NOT_ALLOWED' ? 'บัญชีนี้ไม่ได้อยู่ในรายชื่อทดสอบ' : 'เชื่อมบัญชีไม่สำเร็จ กรุณาตรวจชื่อและรหัสผ่าน');
    } finally { submit.disabled = false; }
  }, { once: true });
  return initialBridge;
}
