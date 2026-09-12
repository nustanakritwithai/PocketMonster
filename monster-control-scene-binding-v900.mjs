// เชื่อมปุ่มใน realm ของฉากเข้ากับตัวควบคุมเดียวใน parent
export function bindMonsterControlScene({ sceneWindow, controller } = {}) {
  const documentLike = sceneWindow?.document;
  if (!documentLike || !controller) return () => {};
  const controlWindow = sceneWindow;
  const isPirate = () => documentLike.body?.dataset?.combinedWorld === 'pirate-fruit';
  const mobile = sceneWindow.POCKETMONSTER_UNIFIED_MOBILE_CONTROLS;
  mobile?.setMonsterController?.(controller);
  controlWindow.POCKETMONSTER_MONSTER_CONTROL_CONTROLLER = controller;
  const buttons = [];
  for (let slot = 0; slot < 3; slot += 1) {
    const button = documentLike.getElementById(`monsterSlot${slot + 1}Btn`);
    if (!button) continue;
    let suppressCompatibilityClick = false;
    const activate = event => {
      event.preventDefault?.();
      event.stopImmediatePropagation?.();
      void Promise.resolve(controller.activatePartySlot(slot)).then(result => {
        const status = documentLike.getElementById('actionReason');
        if (status && result?.ok === false) status.textContent = 'ยังใช้มอนสเตอร์ไม่ได้ กรุณารอการเชื่อมต่อระบบมอนสเตอร์';
      });
    };
    const pointerdown = event => {
      if (!isPirate() || (event.button !== undefined && event.button !== 0)) return;
      suppressCompatibilityClick = true;
      activate(event);
    };
    const click = event => {
      // Touch/pointer activation already happened on pointerdown. Preserve
      // click for keyboard accessibility (detail === 0).
      if (suppressCompatibilityClick && event.detail > 0) {
        suppressCompatibilityClick = false;
        event.preventDefault?.();
        event.stopImmediatePropagation?.();
        return;
      }
      suppressCompatibilityClick = false;
      activate(event);
    };
    button.addEventListener('pointerdown', pointerdown, true);
    button.addEventListener('click', click, true);
    buttons.push({ button, slot, pointerdown, click });
  }
  const unsubscribe = controller.subscribe(snapshot => {
    if (!isPirate()) controlWindow.POCKETMONSTER_HELD_MONSTER_VISUAL?.(snapshot.held, snapshot);
    try {
      const EventCtor = controlWindow.CustomEvent || CustomEvent;
      controlWindow.dispatchEvent?.(new EventCtor('pocketmonster-held-monster', { detail: snapshot.held }));
    } catch {}
    const throwButton = documentLike.getElementById('monsterThrowBtn');
    if (throwButton) {
      throwButton.hidden = isPirate() || snapshot.held === null || snapshot.pending === true;
      throwButton.disabled = isPirate() || snapshot.held === null || snapshot.pending === true;
    }
    for (const { button, slot } of buttons) {
      if (!Number.isInteger(slot)) continue;
      const entry = snapshot.slots?.[slot];
      if (entry) { button.dataset.pirateIcon = `${entry.icon || '🐾'}\n${(entry.name || 'ว่าง').slice(0, 12)}`; button.title = entry.name || 'ช่องว่าง'; }
      const opened = snapshot.controlPanel?.mode === 'monster' && snapshot.controlPanel.instanceId === entry?.instanceId;
      button.setAttribute('aria-label', !entry?.available ? 'ช่องมอนสเตอร์ว่าง'
        : `${entry.name || 'มอนสเตอร์'} • ${opened ? 'กลับไปสกิลตัวละคร' : entry.active ? 'เปิดสกิลมอนสเตอร์' : entry.held ? 'พร้อมปามอนสเตอร์' : 'เตรียมมอนสเตอร์'}`);
      button.setAttribute('aria-pressed', String(opened));
      button.classList?.toggle?.('monster-control-open', opened);
    }
  });
  const throwButton = documentLike.getElementById('monsterThrowBtn');
  if (throwButton) {
    const click = event => {
      event.preventDefault?.();
      event.stopImmediatePropagation?.();
      void Promise.resolve(controller.throwHeld?.()).then(result => {
        const status = documentLike.getElementById('actionReason');
        if (status && result?.ok === false) status.textContent = 'ยังปามอนสเตอร์ไม่ได้ กรุณาเตรียมมอนสเตอร์ก่อน';
      });
    };
    throwButton.addEventListener('click', click, true);
    buttons.push({ button: throwButton, click });
  }
  for (const id of ['monsterRecallBtn', 'monsterReleaseBtn', 'monsterStoreBtn']) {
    const button = documentLike.getElementById(id);
    if (!button) continue;
    const click = event => {
      event.preventDefault?.();
      event.stopImmediatePropagation?.();
      void Promise.resolve(controller.recallActive?.()).then(result => {
        const status = documentLike.getElementById('actionReason');
        if (status && result?.ok === false) status.textContent = 'ยังเก็บมอนไม่ได้ กรุณารอการเชื่อมต่อระบบมอนสเตอร์';
      });
    };
    button.addEventListener('click', click, true);
    buttons.push({ button, click });
  }
  return () => {
    unsubscribe?.();
    if (!isPirate()) controlWindow.POCKETMONSTER_HELD_MONSTER_VISUAL?.(null);
    for (const { button, pointerdown, click } of buttons) {
      pointerdown && button.removeEventListener('pointerdown', pointerdown, true);
      button.removeEventListener('click', click, true);
    }
    mobile?.setMonsterController?.(null);
    if (controlWindow.POCKETMONSTER_MONSTER_CONTROL_CONTROLLER === controller) delete controlWindow.POCKETMONSTER_MONSTER_CONTROL_CONTROLLER;
  };
}

// ใช้ระยะปาเดิม 4 หน่วย; พิกัดนี้เป็นเพียงความตั้งใจ เซิร์ฟเวอร์ตรวจพื้น/ระยะอีกครั้ง
export function monsterThrowAimFromPose(pose) {
  if (!pose || !['x', 'z', 'dir'].every(key => Number.isFinite(pose[key]))) return null;
  if (pose.y !== undefined && !Number.isFinite(pose.y)) return null;
  // Presence รุ่นเดิมไม่มี y; ศูนย์เป็นเพียงค่าคำขอ ไม่ใช่ผลตัดสินความสูงพื้น
  return { targetPoint: { x: pose.x + Math.sin(pose.dir) * 4, y: pose.y ?? 0, z: pose.z + Math.cos(pose.dir) * 4 } };
}
