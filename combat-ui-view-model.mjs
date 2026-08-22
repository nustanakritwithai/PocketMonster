function action(state, disabled, statusText, reason = '') {
  return Object.freeze({ state, disabled, statusText, reason });
}

function disabledAction(reason) {
  return action('disabled', true, 'ใช้ไม่ได้', reason);
}

function readyAction(statusText = 'พร้อม') {
  return action('ready', false, statusText);
}

function createSummonAction({ activeMonster, pendingSummon, selectedMonster, zoneIsWild, summonCooldownSeconds }) {
  if (activeMonster) return disabledAction('มีคู่หูในสนามแล้ว • Recall ตัวเดิมก่อน');
  if (pendingSummon) return disabledAction('กำลังเรียกคู่หู • รอให้ลงสนามก่อน');
  if (!selectedMonster) return disabledAction('Party ช่องนี้ว่าง • เลือกมอนก่อน');
  if (selectedMonster?.fainted) return disabledAction('Fainted • Heal ฟรีที่ Ranch/NPC ก่อน');
  if (!zoneIsWild) return disabledAction('อยู่ Ranch • ออกไป Wild Zone ก่อน');
  if (summonCooldownSeconds > 0) {
    const seconds = Math.ceil(summonCooldownSeconds * 10) / 10;
    return action('cooldown', true, `คูลดาวน์ ${seconds.toFixed(1)}s`, 'Switch cooldown • รอสักครู่');
  }
  return readyAction(`พร้อมเรียก ${selectedMonster.name}`);
}

function createRecallAction({ activeMonster, pendingSummon }) {
  if (pendingSummon) return disabledAction('กำลังเรียกคู่หู • รอให้ลงสนามก่อน');
  if (!activeMonster) return disabledAction('ยังไม่มีคู่หูในสนาม');
  if (activeMonster.fainted) return disabledAction('Fainted • กำลัง Auto Recall');
  return readyAction(`พร้อม Recall ${activeMonster.name}`);
}

function createCaptureAction({ activeMonster, pendingSummon, zoneIsWild, captureBalls, captureAiming }) {
  if (activeMonster) return disabledAction('Recall คู่หูก่อน');
  if (pendingSummon) return disabledAction('กำลังเรียกคู่หู • Recall ก่อนปาจับ');
  if (!zoneIsWild) return disabledAction('อยู่ Ranch • ออกไป Wild Zone ก่อน');
  if (captureBalls <= 0) return disabledAction('Capture Ball หมด • กลับ Ranch เพื่อเติม');
  if (captureAiming) return action('aiming', false, 'กำลังเล็ง', 'ปล่อยปุ่มเพื่อขว้าง • ใช้บอล 1 ลูก');
  return readyAction('พร้อมปาจับ');
}

function createSkillAction(skill, activeMonster) {
  if (!activeMonster) return disabledAction('เรียกคู่หูก่อน');
  if (activeMonster.fainted) return disabledAction('Fainted • Heal ก่อน');
  if (!skill) return disabledAction('ยังไม่มีสกิลช่องนี้');
  if (skill.effectAvailable === false) return disabledAction(skill.unavailableReason || 'เอฟเฟกต์สกิลนี้ยังไม่เปิดใช้');
  if (Number.isFinite(skill.currentUses) && skill.currentUses <= 0) {
    return disabledAction(`${skill.name} Uses หมด • กลับ Ranch เพื่อฟื้นฟู`);
  }
  const cooldownSeconds = Number.isFinite(skill.cooldownSeconds) ? Math.max(0, skill.cooldownSeconds) : 0;
  if (cooldownSeconds > 0) {
    const seconds = Math.ceil(cooldownSeconds * 10) / 10;
    return action('cooldown', true, `คูลดาวน์ ${seconds.toFixed(1)}s`, `${skill.name} ยังไม่พร้อม`);
  }
  const uses = Number.isFinite(skill.currentUses) && Number.isFinite(skill.maxUses)
    ? ` • Uses ${skill.currentUses}/${skill.maxUses}`
    : '';
  return readyAction(`พร้อมใช้${uses}`);
}

export function createCombatHudViewModel(input = {}) {
  const activeMonster = input.activeMonster ?? null;
  const pendingSummon = Boolean(input.pendingSummon);
  const selectedMonster = input.selectedMonster ?? null;
  const zoneIsWild = Boolean(input.zoneIsWild);
  const captureBalls = Number.isFinite(input.captureBalls) ? Math.max(0, input.captureBalls) : 0;
  const summonCooldownSeconds = Number.isFinite(input.summonCooldownSeconds) ? Math.max(0, input.summonCooldownSeconds) : 0;
  const shared = { activeMonster, pendingSummon, selectedMonster, zoneIsWild, captureBalls, captureAiming: Boolean(input.captureAiming), summonCooldownSeconds };
  const actions = Object.freeze({
    summon: createSummonAction(shared),
    recall: createRecallAction(shared),
    capture: createCaptureAction(shared),
  });
  const skills = Object.freeze(Array.from({ length: 4 }, (_, index) => createSkillAction(input.skills?.[index] ?? null, activeMonster)));
  let actionReason = actions.capture.reason || actions.summon.reason || actions.recall.reason || 'พร้อมใช้คำสั่ง';
  if (activeMonster && !activeMonster.fainted) actionReason = 'Capture ถูกปิด • Recall คู่หูก่อน';
  else if (selectedMonster?.fainted) actionReason = `${selectedMonster.name} Fainted • Heal ฟรีที่ Ranch/NPC ก่อน`;
  else if (actions.capture.state === 'ready') actionReason = 'พร้อมปาจับ • Attempt จะใช้บอล 1 ลูก';
  const activeLabel = activeMonster?.name ?? (pendingSummon ? 'กำลังเรียก…' : 'ยังไม่เรียก');
  return Object.freeze({ activeLabel, actionReason, actions, skills });
}

export function createPartySlotViewModel({ monster = null, index = 0, selectedSlot = -1, activeInstanceId = null } = {}) {
  if (!monster) {
    const states = index === selectedSlot ? Object.freeze(['selected']) : Object.freeze([]);
    const stateText = states.length ? 'เลือกช่องว่างแล้ว' : 'ช่องว่าง';
    return Object.freeze({ states, stateText, ariaPressed: states.length > 0, ariaLabel: `Party ช่อง ${index + 1} ว่าง • ${stateText}` });
  }
  const states = [];
  if (index === selectedSlot) states.push('selected');
  if (activeInstanceId && monster.instanceId === activeInstanceId) states.push('active');
  if (monster.fainted || monster.hp <= 0) states.push('fainted');
  const labels = [];
  if (states.includes('selected')) labels.push('เลือกแล้ว');
  if (states.includes('active')) labels.push('กำลังต่อสู้');
  if (states.includes('fainted')) labels.push('Fainted • Heal ก่อน');
  if (!labels.length) labels.push('พร้อมเลือก');
  const stateText = labels.join(' • ');
  return Object.freeze({
    states: Object.freeze(states),
    stateText,
    ariaPressed: states.includes('selected'),
    ariaLabel: `Party ช่อง ${index + 1} ${monster.name} • ${stateText}`,
  });
}
