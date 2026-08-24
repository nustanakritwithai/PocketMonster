import assert from 'node:assert/strict';
import { activeHtml as html, activeJs as js } from './active-assets.mjs';
import fs from 'node:fs';
const sync=fs.readFileSync(new URL('../firebase-game-sync.mjs',import.meta.url),'utf8');
assert.match(html,/<script\s+type="module"\s+src="\.\/game-v800\.js\?v=810"/,'game must remain the declared active module entry');
assert.match(js,/import \{ requireFirebaseLogin \} from '\.\/firebase-auth-ui\.mjs';/,'game boot must own the login gate');
assert.match(js,/await requireFirebaseLogin\(runtimeConfig\);/,'game boot must use the runtime Firebase project');
assert.match(sync,/getPocketMonsterFirebaseApp\(globalThis\.window\?\.POCKETMONSTER_RUNTIME_CONFIG\)/,'Firebase sync must use the runtime-selected shared app');
console.log('V8.2 Firebase login active-entry contract: PASS');
