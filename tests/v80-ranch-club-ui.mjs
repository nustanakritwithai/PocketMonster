import assert from 'node:assert/strict';
import fs from 'node:fs';
import { activeCss as css, activeHtml as html, activeJs as js } from './active-assets.mjs';

assert.match(html, /id="ranchStoragePage"[^>]*ranch-club/, 'Storage page uses the Monster Club skin');
assert.match(html, /class="ranch-club-kicker">MONSTER CLUB/, 'Club kicker brands the Storage header');
for (const id of ['ranchStorageRoster', 'ranchStoragePreview', 'ranchStorageDetails', 'ranchStorageCount', 'ranchActiveCount']) {
  assert.match(html, new RegExp(`id="${id}"`), `${id} mount remains`);
}
assert.match(html, /data-ranch-back/, 'back control remains on the club header');
assert.equal(html, fs.readFileSync(new URL('../v800.html', import.meta.url), 'utf8'), 'HTML parity remains exact');

assert.match(css, /\.ranch-storage-page[\s\S]*grid-template-columns/, 'Storage page keeps a three-column layout');
assert.match(css, /@media\s*\(max-width:700px\)[\s\S]*\.ranch-storage-page/, 'Storage page keeps the narrow fallback');
const lounge = css.match(/\/\* Ranch Club lounge \*\/([\s\S]*?)\/\* Keeper \/ Ranch Storage mobile bottom sheet \*\//)?.[1] || '';
assert.ok(lounge, 'Ranch Club lounge CSS block is required');
for (const cls of ['.ranch-club-kicker', '.ranch-club-card', '.ranch-club-stage', '.ranch-club-dossier', '.ranch-club-avatar', '.ranch-club-chip']) {
  assert.ok(lounge.includes(cls), `club lounge CSS missing ${cls}`);
}
assert.match(lounge, /#facc15|#fde68a/, 'club lounge uses a gold accent');
assert.match(lounge, /#14532d|#166534/, 'club lounge uses an emerald accent');

const start = js.indexOf('function renderRanchStoragePage(');
assert.notEqual(start, -1, 'renderRanchStoragePage exists');
const storage = js.slice(start, js.indexOf('\nfunction ', start + 1));
assert.match(storage, /state\.storage\.filter\(Boolean\)/, 'renderer still uses canonical Storage IDs');
assert.match(storage, /ranch-club-card/, 'renderer emits club member cards');
assert.match(storage, /ranch-club-stage/, 'renderer emits the featured club stage');
assert.match(storage, /ranch-club-dossier/, 'renderer emits club member details');
assert.match(storage, /Storage ว่าง/, 'empty Storage copy remains');
assert.doesNotMatch(storage, /state\.party\s*=|state\.storage\s*=|state\.selectedSlot\s*=|activeSummon\s*=/, 'read-only selection cannot mutate gameplay/combat state');

console.log('V8.2 Ranch Monster Club UI: PASS');
