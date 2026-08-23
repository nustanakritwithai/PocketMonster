import assert from 'node:assert/strict';
import { activeJs as js } from './active-assets.mjs';

function functionSource(source, name) {
  const start=source.indexOf(`function ${name}(`);
  assert.ok(start>=0, `${name} must exist`);
  const open=source.indexOf('{',source.indexOf(')',start)+1);
  let depth=0;
  for(let index=open;index<source.length;index+=1){
    if(source[index]==='{')depth+=1;
    else if(source[index]==='}')depth-=1;
    if(depth===0)return source.slice(start,index+1);
  }
  assert.fail(`${name} must have a complete body`);
}

const renderer=functionSource(js,'renderFocusedSkillLoadoutV2');
const skillsRenderer=functionSource(js,'renderSkills');
assert.match(js,/import \{ createCharacterSkillsViewModel \} from '\.\/character-skills-view-model\.mjs'/,
  'Phase 8 must consume the pure A37 projection');
assert.match(renderer,/createCharacterSkillsViewModel\(inst/,'focused renderer joins the exact focused instance');
assert.match(renderer,/ensureCharacterSkillsRightTabTree\(panel/,'focused renderer keeps a stable keyed subtree');
assert.match(renderer,/model\.manualSlots/,'renderer visits the canonical four-slot projection');
assert.match(renderer,/model\.systemRows/,'Basic AI, Passive and Evolution Trait remain system rows');
assert.doesNotMatch(renderer,/innerHTML|getMonsterSkills\(|state\.skillsSelectedId|activeSummon|skillCds/,
  'right-tab rendering cannot use markup injection, legacy moves, another monster or combat cooldown state');
assert.doesNotMatch(renderer,/learnSkill|equipSkill|consumeSkill|executeEquippedSkillCommand|useSkill\(/,
  'right-tab projection is presentation-only');

assert.match(skillsRenderer,/targetPanel===el\('characterInfoBody'\)/,
  'right-tab mode must be explicit');
assert.match(skillsRenderer,/focusedCharacterPresentation\(\)/,
  'right-tab mode resolves the same focused monster as Overview');
assert.match(skillsRenderer,/renderFocusedSkillLoadoutV2\(panel,inst,presentation\)/,
  'the focused instance is passed directly to the dedicated renderer');
assert.match(skillsRenderer,/renderFocusedSkillLoadoutV2\(panel,inst,presentation\);\s*return;/,
  'right-tab mode returns before the legacy selector/lower-pane renderer');
assert.doesNotMatch(skillsRenderer.match(/if\(targetPanel===el\('characterInfoBody'\)\)\{([\s\S]*?)\n\s*\}/)?.[1]||'',/state\.skillsSelectedId|monsterSelectHTML|bindMonsterSelect/,
  'right tab has one focused-monster authority and no selector');

for(const slot of ['s1','s2','s3','s4'])assert.match(js,new RegExp(`data-character-skill-slot`),`renderer must key ${slot}`);
for(const label of ['Basic AI','Passive','Evolution Trait'])assert.match(js,new RegExp(label),`renderer must label ${label}`);
assert.match(js,/\.textContent=/,'dynamic skill data must be assigned as inert text');
assert.match(js,/aria-label/,'skill cards need accessible composed labels');
assert.doesNotMatch(renderer,/(?:state\.ui\.(?:skills|skillLoadout)|inst\.skills\s*=)/,
  'loadout must not duplicate or overwrite skill data');

console.log('V8.2 Character UI Phase 8 focused Skill Loadout V2: PASS');
