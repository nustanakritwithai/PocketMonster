import assert from 'node:assert/strict';
import fs from 'node:fs';
import { activeCss as css, activeHtml as html, activeJs as js } from './active-assets.mjs';

assert.match(html, /id="breedingPanel"[^>]*breeding-salon/, 'NPC overlay uses the Breeding Salon skin');
assert.match(html, /id="breedingClose"/, 'salon close control remains');
assert.match(html, /id="breedingOpenManager"/, 'lab entry control remains');
assert.match(html, /class="breeding-caretaker-card"/, 'caretaker card mount remains');
assert.match(html, /class="breeding-preview-grid"/, 'parent pairing grid remains');
assert.match(html, /class="breeding-heart"/, 'pairing heart remains for desktop');
assert.match(html, /class="breeding-safety-list"/, 'safety checklist remains');
assert.match(html, /class="breeding-kicker"/, 'salon kicker remains');
assert.match(html, /id="breedingSalonParentA"/, 'Parent A salon pod exists');
assert.match(html, /id="breedingSalonParentB"/, 'Parent B salon pod exists');
assert.match(html, /id="breedingSalonCompat"/, 'live compatibility chip exists');
assert.match(html, /id="breedingSalonIncubator"/, 'salon incubator strip exists');
assert.match(html, /id="parentABtn"/, 'manager Parent A picker remains');
assert.match(html, /id="parentBBtn"/, 'manager Parent B picker remains');
assert.match(html, /id="breedBtn"/, 'manager create-egg control remains');
assert.match(html, /id="eggList"/, 'manager incubator list remains');
assert.equal(html, fs.readFileSync(new URL('../v800.html', import.meta.url), 'utf8'), 'HTML parity remains exact');

const lounge = css.match(/\/\* Breeding Salon lounge \*\/([\s\S]*?)\/\* Mobile NPC interaction pass:/)?.[1] || '';
assert.ok(lounge, 'Breeding Salon lounge CSS block is required');
for (const cls of ['.breeding-salon-brand', '.breeding-salon-stats', '.breeding-salon-orb', '.breeding-salon-compat', '.breeding-salon-incubator', '.breeding-parent-pod', '.breeding-salon .breeding-heart']) {
  assert.ok(lounge.includes(cls), `salon lounge CSS missing ${cls}`);
}
assert.match(lounge, /#fde68a|#facc15/, 'salon lounge uses a gold accent');
assert.match(lounge, /#f472b6|#f9a8d4|#db2777|#9f1239/, 'salon lounge uses a rose accent');

assert.match(js, /function openBreedingCaretaker\(/, 'breeding NPC still opens the caretaker overlay');
assert.match(js, /function renderBreedingSalon\(/, 'salon renderer exists');
assert.match(js, /function salonParentPodHTML\(/, 'salon parent pods share a presenter');
const open = js.slice(js.indexOf('function openBreedingCaretaker('), js.indexOf('\nfunction ', js.indexOf('function openBreedingCaretaker(') + 1));
assert.match(open, /renderBreedingSalon\(\)/, 'opening the NPC refreshes the salon');
const render = js.slice(js.indexOf('function renderBreeding('), js.indexOf('\nfunction ', js.indexOf('function renderBreeding(') + 1));
assert.match(render, /renderBreedingSalon\(\)/, 'manager breeding refresh also syncs the salon');
assert.match(js, /openMonsterPicker\('parentA'\)/, 'Parent A still uses the canonical picker');
assert.match(js, /el\('breedingSalonParentA'\)\?\.addEventListener\('click'/, 'salon Parent A opens the picker');
assert.match(js, /el\('breedingSalonParentB'\)\?\.addEventListener\('click'/, 'salon Parent B opens the picker');
assert.match(js, /openRanchBreeding\(\)/, 'farm-keeper breeding route remains');
assert.match(js, /closeBreedingCaretaker\(\);openManager\(\{source:'npc'\}\);setManagerTab\('breeding'\)/, 'salon CTA still opens the manager lab');
assert.doesNotMatch(js, /id="parentABtn"|id="breedBtn"|id="eggList"/, 'salon does not steal manager lab IDs');

console.log('V8.2 Breeding Salon NPC UI: PASS');
