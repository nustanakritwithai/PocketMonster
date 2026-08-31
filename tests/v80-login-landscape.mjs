import assert from 'node:assert/strict';
import fs from 'node:fs';

const css=fs.readFileSync(new URL('../style-v800.css',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const v800=fs.readFileSync(new URL('../v800.html',import.meta.url),'utf8');

for (const entry of [html,v800]) {
  assert.match(entry,/id="accountGate"/,'Login gate exists');
  assert.match(entry,/id="loginPage" class="account-card auth-page"/,'Login uses the account card');
  assert.match(entry,/id="guestLoginBtn"/,'Guest login stays available');
}
assert.match(css,/@media \(orientation:landscape\) and \(max-height:520px\)/,'Short landscape login uses a height-based compact pass');
const pass=css.match(/@media \(orientation:landscape\) and \(max-height:520px\)\{([\s\S]*?)\n\}/)?.[1]||'';
assert.ok(pass,'short landscape login block is required');
assert.match(pass,/\.account-card\{[^}]*width:min\(640px,96vw\)/,'Login card uses landscape width instead of a tall 360px stack');
assert.match(pass,/\.account-card\{[^}]*max-height:calc\(100dvh - 8px\)/,'Login card cannot grow past the visible landscape viewport');
assert.match(pass,/\.account-card\{[^}]*grid-template-columns:1fr 1fr/,'Login fields sit side by side on short landscape');
assert.match(pass,/\.account-logo\{display:none\}/,'Logo drops so the form fits without fullscreen');
assert.match(pass,/\.account-card p\{display:none\}/,'Login tagline hides on short landscape');
assert.match(pass,/\.account-card form\{[^}]*grid-template-columns:1fr 1fr/,'Email and password share one row');
assert.match(pass,/\.auth-google\{[^}]*grid-column:1\/-1/,'Google login stays a full-width row');
assert.match(pass,/#guestLoginBtn,\.auth-guest\{[^}]*display:block/,'Guest login cannot be display:none');
assert.match(pass,/#guestLoginBtn,\.auth-guest\{[^}]*grid-column:1\/-1/,'Guest login stays a full-width row on the login card');
assert.doesNotMatch(pass,/\.action\.skill|\.skill1|\.capture\{/,'Landscape login pass must not shrink combat HUD buttons');

console.log('V8.2 short landscape login: PASS');
