import assert from 'node:assert/strict';
import fs from 'node:fs';
import { activeCss as css, activeHtml as html, activeJs as js } from './active-assets.mjs';

assert.match(html,/id="ranchServices"/,'Keeper Services shell exists');
assert.match(html,/data-ranch-service="storage"/,'Storage service button exists');
assert.match(html,/id="ranchStoragePage"/,'dedicated Storage page exists');
for(const id of ['ranchStorageRoster','ranchStoragePreview','ranchStorageDetails'])assert.match(html,new RegExp(`id="${id}"`),`${id} mount exists`);
assert.equal(html,fs.readFileSync(new URL('../v900.html',import.meta.url),'utf8'),'HTML parity remains exact');
assert.match(css,/\.ranch-storage-page[\s\S]*grid-template-columns/,'Storage page has a three-column layout');
assert.match(css,/@media\s*\(max-width:700px\)[\s\S]*\.ranch-storage-page/,'Storage page has narrow fallback');
assert.match(js,/requestOpenRanchServices\(\{isNearNpc:isNearNpc\(\)\}\)/,'NPC opens Services through controller gate');
assert.match(js,/function showRanchStorageShell\(/,'dedicated Storage shell route exists');
assert.match(js,/openCharacterQuickTab\(/,'PR #114 Quick Panel route remains present');
console.log('V8.2 Ranch Storage Services shell + Quick Panel compatibility: PASS');
