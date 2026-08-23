import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} must exist`);
  const open = source.indexOf('{', source.indexOf(')', start) + 1);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  assert.fail(`${name} must have a complete body`);
}

export function assertLiveTargetingWiring({ js, html, versionedHtml, css, hud }) {
  assert.equal((html.match(/id="skill[1-4]Btn"/g) || []).length, 4,
    'active DOM exposes exactly four workbook manual skill buttons');
  assert.equal(html, versionedHtml, 'both active HTML entries keep the four-slot surface identical');
  assert.match(css, /\.skill4\{[^}]*width:[^}]*height:/, 'slot four has explicit touch geometry');
  assert.ok((css.match(/\.skill4\{/g) || []).length >= 3,
    'slot four keeps base, landscape, and short-height geometry');
  assert.match(hud, /Array\.from\(\{ length: 4 \}/, 'Combat HUD view model owns four skill actions');
  assert.match(hud, /skill\.currentUses\) && skill\.currentUses <= 0/, 'Combat HUD disables exhausted Uses');

  assert.match(js, /import \{ executeEquippedSkillCommand \} from '\.\/skill-command-runtime\.mjs'/);
  assert.match(js, /manualSkillLoadout\(inst\)\.map/, 'live presentation reads the canonical equipped loadout');
  assert.match(js, /skillCds:MANUAL_SKILL_SLOTS\.map\(\(\)=>0\)/, 'active runtime starts four canonical cooldown entries');
  assert.match(js, /for\(let i=0;i<MANUAL_SKILL_SLOTS\.length;i\+\+\)/, 'cooldown semantics update every manual slot');
  assert.match(js, /MANUAL_SKILL_SLOTS\.forEach\(\(_\,index\)=>\{/, 'HUD renderer visits every manual slot');
  for (let index = 0; index < 4; index += 1) {
    assert.ok(js.includes(`bindActionPress(el('skill${index + 1}Btn'),()=>dispatchSkill(${index}))`),
      `manual slot ${index + 1} has an independent pointer dispatch`);
  }

  const dispatch = functionSource(js, 'createSkillDispatchIntent');
  assert.match(dispatch, /\+\+skillCommandSequence/, 'input dispatch creates one monotonic command ID');
  assert.match(dispatch, /move\?\.targetType==='GroundPoint'\?reticleGroundPoint\(\):null/,
    'only GroundPoint input receives the unchanged reticle-ground intent');
  const useSkill = functionSource(js, 'useSkill');
  assert.match(useSkill, /slot=MANUAL_SKILL_SLOTS\[index\]/, 'manual index resolves only to a canonical slot');
  assert.match(useSkill, /executeEquippedSkillCommand\(a\.inst/, 'live cast enters the gameplay-owned atomic boundary');
  assert.match(useSkill, /commandId:intent\.commandId/, 'useSkill reuses the dispatch command ID');
  assert.match(useSkill, /groundPoint:intent\.groundPoint\?\?null/, 'GroundPoint reaches the resolver unchanged');
  assert.doesNotMatch(useSkill, /skillCommandSequence|getMonsterSkills\(|nearestWild\(|wilds\.filter|move\.range|move\.cooldown/,
    'useSkill cannot mint IDs, select legacy moves, recompute hits, range, or cooldown');

  const materialize = functionSource(js, 'materializeSkillTargets');
  assert.match(materialize, /byId\.get\(targetId\)/, 'resolved target IDs materialize by exact key');
  assert.match(materialize, /if\(!wild\|\|wild\.dead\|\|wild\.capturing\|\|!wild\.mesh\?\.position\)return \[\]/,
    'a stale target cancels the whole cast instead of substituting another enemy');
  assert.doesNotMatch(materialize, /nearestWild\(|wilds\.filter|\.find\(/,
    'materialization cannot perform a second target selection');

  const apply = functionSource(js, 'applyAcceptedSkillCommand');
  const cooldownAt = apply.indexOf('a.skillCds[index]=command.startCooldownSec');
  const sfxAt = apply.indexOf('playSFX(');
  const damageAt = apply.indexOf('damageWild(');
  assert.ok(cooldownAt >= 0 && sfxAt > cooldownAt && damageAt > sfxAt,
    'catalog cooldown starts after Uses commit and before all presentation/damage effects');
  assert.equal((apply.match(/new THREE\.Vector3\(command\.targetPoint\.x,0,command\.targetPoint\.z\)/g) || []).length, 2,
    'GroundPoint and EnemyArea presentations each use the resolver anchor point unchanged');
  assert.match(apply, /command\.radiusM/, 'area presentation uses the resolver radius');
  assert.doesNotMatch(apply, /nearestWild\(|wilds\.filter|move\.range|move\.cooldown/,
    'accepted effect cannot resolve targets or geometry again');
  const mastery = functionSource(js, 'awardAcceptedSkillMastery');
  assert.match(mastery, /getSkill\(a\.inst,move\.skillId\)/, 'mastery uses the canonical SkillID');
  assert.match(mastery, /res&&Number\.isFinite\(res\.eff\)\?res\.eff:1/,
    'immune effectiveness 0 remains zero-quality mastery input');
}

const root = new URL('../', import.meta.url);
const sources = {
  js: fs.readFileSync(new URL('game-v800.js', root), 'utf8'),
  html: fs.readFileSync(new URL('index.html', root), 'utf8'),
  versionedHtml: fs.readFileSync(new URL('v800.html', root), 'utf8'),
  css: fs.readFileSync(new URL('style-v800.css', root), 'utf8'),
  hud: fs.readFileSync(new URL('combat-ui-view-model.mjs', root), 'utf8'),
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assertLiveTargetingWiring(sources);
  console.log('V8.1 live targeting wiring: PASS (four slots, exact targets, acceptance-guarded side effects)');
}
