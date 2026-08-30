import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const css = fs.readFileSync(new URL('style-v800.css', root), 'utf8');
const chat = fs.readFileSync(new URL('chat-runtime.mjs', root), 'utf8');
const preload = fs.readFileSync(new URL('entry-preload.mjs', root), 'utf8');
const html = fs.readFileSync(new URL('index.html', root), 'utf8');

const toggleRule = css.match(/\.chat-toggle\{[^}]+\}/)?.[0] || '';
const panelRule = css.match(/\.game-chat\{[^}]+\}/)?.[0] || '';
assert.match(toggleRule, /top:max\(8px,var\(--safe-top\)\)/, 'chat toggle docks under the top safe inset');
assert.match(toggleRule, /right:max\(86px,calc\(var\(--safe-right\) \+ 74px\)\)/, 'chat toggle sits left of the version badge, not on the joystick');
assert.match(toggleRule, /left:auto/, 'chat toggle must not keep a left anchor over the joystick');
assert.match(toggleRule, /bottom:auto/, 'chat toggle must not keep a bottom anchor over movement controls');
assert.match(panelRule, /top:max\(58px,calc\(var\(--safe-top\) \+ 50px\)\)/, 'open chat hangs from the top-right');
assert.match(panelRule, /right:max\(10px,var\(--safe-right\)\)/, 'open chat stays on the right edge');
assert.match(panelRule, /max-height:calc\(100dvh - 58px - 220px\)/, 'open chat must leave the bottom skill cluster free');
assert.doesNotMatch(toggleRule, /left:16px/, 'legacy bottom-left toggle must be gone');
assert.doesNotMatch(panelRule, /bottom:72px/, 'legacy bottom-left panel must be gone');

const mobile = css.match(/@media \(max-width:700px\)\{[\s\S]*?\.chat-toggle\{[^}]+\}/)?.[0] || '';
assert.match(mobile, /left:auto;bottom:auto/, 'portrait phones cannot drop chat onto the joystick');
assert.doesNotMatch(css, /@media \(max-width:700px\)\{[^}]*\.chat-toggle\{[^}]*bottom:max\(10px/, 'portrait media query must not pin chat to the bottom');

assert.match(chat, /left:auto!important;bottom:auto!important/, 'runtime CSS must override a cached bottom-left stylesheet');
assert.match(css, /@media \(orientation:landscape\) and \(max-height:560px\)\{[^]*?\.game-chat\{[^}]*left:50%/, 'short landscape chat panel centers between joystick and skills');
assert.match(css, /@media \(orientation:landscape\) and \(max-height:560px\)\{[^]*?transform:translateX\(-50%\)/, 'short landscape chat panel is centered');
assert.match(chat, /@media \(orientation:landscape\) and \(max-height:560px\)\{\.game-chat\{left:50%!important/, 'runtime CSS must center the landscape panel even if stylesheet is cached');
assert.match(preload, /chat-runtime\.mjs\?v=8\.4\.0-chat-top-right/, 'chat layout change must cache-bust');
assert.match(preload, /chat-runtime\.mjs\?v=8\.4\.0-chat-top-right[\s\S]*game-v800\.js\?v=813/, 'chat must bind before game overlays');
assert.ok(html.indexOf('id="chatToggleBtn"') < html.indexOf('<div id="hud">'), 'chat stays outside #hud');

console.log('Chat control-clearance layout: PASS');
