import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);

function functionSource(source, name) {
  return source.match(new RegExp(`function ${name}\\([\\s\\S]*?\\n\\}`))?.[0] ?? '';
}

export function assertSkillLoadoutLiveWiring({ source, css }) {
  const render = functionSource(source, 'renderSkills');
  const command = functionSource(source, 'setMonsterSkillLoadout');
  const evolution = functionSource(source, 'evolveMonster');
  assert.match(source, /setManualSkillSlot/);
  assert.match(render, /data-skill-loadout=/, 'learned canonical skills expose one slot selector');
  assert.match(render, /MANUAL_SKILL_SLOTS\.map/);
  assert.match(render, /select\.onchange=.*setMonsterSkillLoadout/);
  assert.match(command, /assertCharacterMutable\(id\)/, 'active summon remains read-only');
  assert.match(command, /setManualSkillSlot\(inst,\{skillId,slot:requestedSlot\}\)/);
  assert.match(command, /setManualSkillSlot\(inst,\{skillId:null,slot:currentSlot\}\)/);
  assert.match(command, /saveGame\(false\)/, 'accepted loadout changes persist');
  assert.match(evolution, /committed\.unlockedSkill\?\.newlyLearned/);
  assert.match(evolution, /ยังไม่ติดตั้ง/);
  assert.match(css, /\.skill-loadout-control\{/);
  assert.match(css, /\.skill-loadout-control select\{/);
}

const current = Object.freeze({
  source: fs.readFileSync(new URL('game-v800.js', root), 'utf8'),
  css: fs.readFileSync(new URL('style-v800.css', root), 'utf8'),
});

assertSkillLoadoutLiveWiring(current);
console.log('V8.7 editable learned-skill loadout live wiring: PASS');
