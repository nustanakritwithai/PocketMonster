import assert from 'node:assert/strict';
import fs from 'node:fs';

const game = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const mirrorHtml = fs.readFileSync(new URL('../v800.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../style-v800.css', import.meta.url), 'utf8');

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `missing function ${name}`);
  const brace = source.indexOf('{', start);
  let depth = 0;
  for (let index = brace; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  assert.fail(`unclosed function ${name}`);
}

assert.equal(html, mirrorHtml, 'active and mirror HTML entries remain byte-identical');
assert.match(html, /id="skillItemConfirm"[^>]*role="dialog"[^>]*aria-modal="true"/);
assert.match(html, /id="skillItemConfirmCancel"/);
assert.match(html, /id="skillItemConfirmAccept"/);
assert.match(html, /Skill 1–4 ผู้เล่นกด/);

const panel = extractFunction(game, 'renderSkillItemPanel');
assert.match(panel, /SKILL_ITEM_CATALOG\.emberFruit/);
assert.match(panel, /MANUAL_SKILL_SLOTS\.map/);
assert.match(panel, /data-skill-item-slot/);
assert.match(panel, /data-use-skill-item/);
assert.match(panel, /แทนที่/);
assert.match(panel, /Mastery\/Uses/);
assert.match(panel, /resolveSkillItemUse\(/, 'UI eligibility delegates to domain resolver');

const begin = extractFunction(game, 'startSkillItemUse');
assert.match(begin, /assertCharacterMutable\(monsterId\)/);
assert.match(begin, /resolveSkillItemUse\(\{state,\.\.\.command\}\)/);
assert.match(begin, /CONFIRMATION_REQUIRED/);
assert.match(begin, /pendingSkillItemUse=Object\.freeze\(command\)/);
assert.doesNotMatch(begin, /inventory\[[^\]]+\]--|Object\.assign\(state/);

const confirm = extractFunction(game, 'confirmSkillItemUse');
assert.match(confirm, /commitSkillItemUse\(\{/);
assert.match(confirm, /persistCandidate\(nextState\)/);
assert.match(confirm, /writeStoredSave\(localStorage,\s*envelope\)/);
assert.match(confirm, /if\(!committed\.ok\)/);
assert.match(confirm, /Object\.assign\(state,candidateForPublish\)/);
assert.ok(
  confirm.indexOf('writeStoredSave(localStorage, envelope)') < confirm.indexOf('Object.assign(state,candidateForPublish)'),
  'local persistence boundary occurs before publishing candidate state',
);
assert.ok(
  confirm.indexOf('if(!committed.ok)') < confirm.indexOf('Object.assign(state,candidateForPublish)'),
  'failure returns before live mutation',
);

const feed = extractFunction(game, 'feedMonster');
assert.ok(feed.indexOf('if(skillItemById(food))') < feed.indexOf('state.inventory[food]--'), 'legacy food guard runs before decrement');
assert.doesNotMatch(game, /data-feed="emberFruit"/);
assert.match(game, /skillItemUseCommandIds:\[\]/);
assert.match(game, /state\.skillItemUseCommandIds=clean\.skillItemUseCommandIds\|\|\[\]/);
assert.match(game, /skillItemConfirmAccept'\)\.onclick=\(\)=>confirmSkillItemUse\(\)/);

assert.match(css, /\.skill-item-panel\{/);
assert.match(css, /\.skill-item-confirm\{[^}]*position:fixed/);
assert.match(css, /\.skill-item-controls button\{[^}]*min-height:44px/);
assert.match(css, /\.skill-item-confirm-actions button\{[^}]*min-height:48px/);
assert.match(css, /@media\(max-width:560px\)\{[^}]*\.skill-item-controls\{grid-template-columns:1fr\}/);

console.log('V8.9 Character Manager skill item UI: PASS (S1-S4 + confirm + persist-first)');
