import assert from 'node:assert/strict';
import fs from 'node:fs';
import { activeCss as css, activeHtml as html, activeJs as js } from './active-assets.mjs';

assert.match(html, /id="ranchStoragePage"[^>]*ranch-club/, 'Storage page uses the Monster Club skin');
assert.match(html, /id="ranchClubVault"/, 'Storage vault column exists');
assert.match(html, /ranch-club-carry/, 'Party carry column is marked on the roster');
assert.match(css, /\.ranch-club \.ranch-storage-roster\{grid-column:1/, 'Party stay on the left');
assert.match(css, /\.ranch-club \.ranch-club-vault\{grid-column:2/, 'Storage stay on the right');
for (const id of ['ranchStorageRoster', 'ranchStoragePreview', 'ranchStorageDetails', 'ranchStorageCount', 'ranchActiveCount']) {
  assert.match(html, new RegExp(`id="${id}"`), `${id} mount remains`);
}
assert.match(html, /id="ranchClubPreviewCanvas"/, 'club stage hosts a 3D model canvas');
assert.match(html, /data-ranch-back/, 'back control remains on the club header');
assert.match(js, /function initRanchClubPreview3D\(/, 'club preview initializes a dedicated 3D renderer');
assert.match(js, /ranchClubPreviewRenderer=new THREE\.WebGLRenderer\(\{canvas,antialias:qualityProfile\.antialias,alpha:true,powerPreference:'low-power'\}\)/, 'club preview honors adaptive antialiasing');
assert.match(js, /ranchClubPreviewRenderer\.setPixelRatio\(Math\.min\(devicePixelRatio\|\|1,qualityProfile\.maxDpr\)\)/, 'club preview honors the adaptive DPR cap');
assert.match(js, /updateRanchClubPreview\(dt\)/, 'frame loop renders the club model while the page is open');
assert.equal(html, fs.readFileSync(new URL('../v800.html', import.meta.url), 'utf8'), 'HTML parity remains exact');

assert.match(css, /\.ranch-storage-page[\s\S]*grid-template-columns/, 'Storage page keeps a three-column layout');
assert.match(css, /@media\s*\(max-width:700px\)[\s\S]*\.ranch-storage-page/, 'Storage page keeps the narrow fallback');
const lounge = css.match(/\/\* Ranch Club lounge \*\/([\s\S]*?)\/\* Keeper \/ Ranch Storage mobile bottom sheet \*\//)?.[1] || '';
assert.ok(lounge, 'Ranch Club lounge CSS block is required');
assert.match(lounge, /grid-template-rows:auto minmax\(120px,max-content\) minmax\(0,1fr\)/, 'list row keeps a 120px floor so the preview cannot collapse it');
assert.match(lounge, /minmax\(96px,\.42fr\)/, 'short landscape keeps a list-row floor');
assert.match(lounge, /38dvh|30dvh/, 'club stage scales with viewport height');
assert.doesNotMatch(lounge, /grid-template-rows:auto minmax\(0,1fr\) auto/, 'list row must not be the unbounded leftover track');
for (const cls of ['.ranch-club-kicker', '.ranch-club-card', '.ranch-club-stage', '.ranch-club-dossier', '.ranch-club-avatar', '.ranch-club-chip', '.ranch-club-vault', '.ranch-club-carry', '.ranch-club-preview-canvas']) {
  assert.ok(lounge.includes(cls), `club lounge CSS missing ${cls}`);
}
assert.match(lounge, /#facc15|#fde68a/, 'club lounge uses a gold accent');
assert.match(lounge, /#14532d|#166534/, 'club lounge uses an emerald accent');

const start = js.indexOf('function renderRanchStoragePage(');
assert.notEqual(start, -1, 'renderRanchStoragePage exists');
const storage = js.slice(start, js.indexOf('\nfunction ', start + 1));
assert.match(storage, /state\.storage\.filter\(Boolean\)/, 'renderer still uses canonical Storage IDs');
assert.match(storage, /ranch-club-card/, 'renderer emits club member cards');
assert.match(storage, /fillColumn\(roster,'พกอยู่',partyIds/, 'Party fills the left carry column');
assert.match(storage, /fillColumn\(vault,'ในคลัง',ids/, 'Storage fills the right vault column');
assert.match(storage, /el\('ranchClubVault'\)/, 'renderer owns the Storage vault mount');
assert.match(storage, /syncRanchClubPreview\(focused\)/, 'renderer syncs the featured club 3D stage');
assert.match(storage, /ranch-club-dossier/, 'renderer emits club member details');
assert.match(storage, /Storage ว่าง/, 'empty Storage copy remains');
assert.doesNotMatch(storage, /state\.party\s*=|state\.storage\s*=|state\.selectedSlot\s*=|activeSummon\s*=/, 'read-only selection cannot mutate gameplay/combat state');

console.log('V8.2 Ranch Monster Club UI: PASS');
