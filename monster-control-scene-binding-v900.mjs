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
  let throwActionInFlight = false;
  const isPiratePlayerMode = () => isPirate()
    && mobile?.diagnostics?.().pirateControlMode !== 'boat';
  const activeCanonicalSlot = snapshot => Array.isArray(snapshot?.slots)
    ? snapshot.slots.find(slot => slot?.available === true && slot?.active === true
      && typeof slot.instanceId === 'string' && slot.instanceId.length > 0) || null
    : null;
  const pirateThrowButtonState = snapshot => {
    if (snapshot?.pending === true) {
      const pendingLabel = snapshot.pendingKind === 'recall' ? 'กำลังเก็บมอนสเตอร์'
        : snapshot.pendingKind === 'switch' ? 'กำลังสลับมอนสเตอร์'
          : 'กำลังเรียกมอนสเตอร์';
      return { hidden: false, disabled: true, action: null, icon: '…', label: pendingLabel };
    }
    const active = activeCanonicalSlot(snapshot);
    if (snapshot?.held) {
      if (active && snapshot.capabilities?.switch !== true) {
        return { hidden: false, disabled: true, action: null, icon: '⛔', label: 'ยังสลับมอนสเตอร์ไม่ได้' };
      }
      return { hidden: false, disabled: false, action: 'throw', icon: 'ปา',
        label: active ? 'ปาสลับมอนสเตอร์' : 'ปามอนสเตอร์' };
    }
    if (active && snapshot?.capabilities?.recall === true && typeof controller.recallActive === 'function') {
      return { hidden: false, disabled: false, action: 'recall', icon: 'Recall', label: `Recall ${active.name || 'มอนสเตอร์'}` };
    }
    return { hidden: true, disabled: true, action: null, icon: '🎯', label: 'ปามอนสเตอร์' };
  };
  const paintPirateThrowButton = (button, snapshot) => {
    const state = pirateThrowButtonState(snapshot);
    button.hidden = state.hidden;
    button.disabled = state.disabled;
    button.dataset.pirateIcon = state.icon;
    button.setAttribute?.('data-pirate-icon', state.icon);
    button.setAttribute?.('aria-label', state.label);
    button.setAttribute?.('aria-disabled', String(state.disabled));
    button.title = state.label;
  };
  const refreshThrowButtonForControlMode = () => {
    if (!isPirate()) return;
    const button = documentLike.getElementById('monsterThrowBtn');
    if (!button) return;
    const snapshot = controller.snapshot?.();
    if (isPiratePlayerMode()) paintPirateThrowButton(button, snapshot);
    else {
      button.hidden = true;
      button.disabled = true;
    }
  };
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
      if (isPiratePlayerMode()) paintPirateThrowButton(throwButton, snapshot);
      else if (isPirate()) {
        throwButton.hidden = true;
        throwButton.disabled = true;
      }
      else {
        throwButton.hidden = snapshot.held === null || snapshot.pending === true;
        throwButton.disabled = snapshot.held === null || snapshot.pending === true;
      }
    }
    for (const { button, slot } of buttons) {
      if (!Number.isInteger(slot)) continue;
      const entry = snapshot.slots?.[slot];
      if (entry) { button.dataset.pirateIcon = `${entry.icon || '🐾'}\n${(entry.name || 'ว่าง').slice(0, 12)}`; button.title = entry.name || 'ช่องว่าง'; }
      const opened = snapshot.controlPanel?.mode === 'monster' && snapshot.controlPanel.instanceId === entry?.instanceId;
      const pirate = isPirate();
      const held = pirate
        ? snapshot.held?.index === slot && snapshot.held?.instanceId === entry?.instanceId
        : Boolean(entry?.held);
      const actionLabel = pirate
        ? (opened ? 'กลับไปสกิลตัวละคร' : held ? 'พร้อมปามอนสเตอร์' : entry?.active ? 'เปิดสกิลมอนสเตอร์' : 'เตรียมมอนสเตอร์')
        : (opened ? 'กลับไปสกิลตัวละคร' : entry?.active ? 'เปิดสกิลมอนสเตอร์' : entry?.held ? 'พร้อมปามอนสเตอร์' : 'เตรียมมอนสเตอร์');
      button.setAttribute('aria-label', !entry?.available ? 'ช่องมอนสเตอร์ว่าง'
        : `${entry.name || 'มอนสเตอร์'} • ${actionLabel}`);
      button.setAttribute('aria-pressed', String(pirate ? opened || held : opened));
      // Pirate owns these three scene buttons. Keep held/active state on the
      // canonical slot instead of exposing a second selected-monster button.
      if (pirate) {
        button.dataset.held = String(held);
        button.dataset.active = String(Boolean(entry?.active));
        button.dataset.fainted = String(Boolean(entry?.fainted));
        button.classList?.toggle?.('selected', held);
        button.classList?.toggle?.('active-monster', Boolean(entry?.active));
        button.classList?.toggle?.('fainted-slot', Boolean(entry?.fainted));
      }
      button.classList?.toggle?.('monster-control-open', opened);
    }
  });
  const throwButton = documentLike.getElementById('monsterThrowBtn');
  if (throwButton) {
    const reportFailure = (actionName, result = {}) => {
      const rawReason = typeof result.reason === 'string' ? result.reason : '';
      const reason = /^[a-z0-9_-]{1,80}$/i.test(rawReason) ? rawReason : 'control-error';
      const rawCode = typeof result.code === 'string' ? result.code : '';
      const code = /^[A-Z0-9_]{1,80}$/.test(rawCode)
        ? rawCode
        : reason.toUpperCase().replace(/-/g, '_');
      const message = actionName === 'recall'
        ? `เก็บมอนสเตอร์ไม่สำเร็จ: ${reason}`
        : `ปามอนสเตอร์ไม่สำเร็จ: ${reason}`;
      const failure = { ok: false, reason, code, message };
      try {
        const hud = controlWindow.POCKETMONSTER_UNIFIED_HUD
          || controlWindow.parent?.POCKETMONSTER_UNIFIED_HUD;
        hud?.showCommandFailure?.(failure, { monsterCommand: true });
      } catch {}
      const status = documentLike.getElementById('actionReason');
      if (status) status.textContent = `${message} (${code})`;
    };
    const click = async event => {
      event.preventDefault?.();
      event.stopImmediatePropagation?.();
      if (throwActionInFlight) return;
      const snapshot = controller.snapshot?.();
      if (isPirate()) {
        if (!isPiratePlayerMode()) return;
        const state = pirateThrowButtonState(snapshot);
        if (state.hidden || state.disabled || !state.action) return;
      } else if (snapshot?.pending === true || !snapshot?.held) return;
      throwActionInFlight = true;
      const action = isPirate() && !snapshot?.held ? controller.recallActive : controller.throwHeld;
      const actionName = action === controller.recallActive ? 'recall' : 'throw';
      try {
        const result = await Promise.resolve(action?.call(controller));
        if (result?.ok === false) reportFailure(actionName, result);
      } catch (error) {
        reportFailure(actionName, { reason: error?.code || 'control-error', code: error?.code });
      } finally {
        throwActionInFlight = false;
      }
    };
    throwButton.addEventListener('click', click, true);
    buttons.push({ button: throwButton, click });
  }
  const onPirateControlModeChange = () => refreshThrowButtonForControlMode();
  controlWindow.addEventListener?.('pocketmonster:pirate-control-mode-v1', onPirateControlModeChange);
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
    controlWindow.removeEventListener?.('pocketmonster:pirate-control-mode-v1', onPirateControlModeChange);
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
