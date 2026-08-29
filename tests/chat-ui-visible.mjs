import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildFirebaseLauncher } from '../scripts/build-firebase-launcher.mjs';

const root = new URL('../', import.meta.url);
const html = fs.readFileSync(new URL('index.html', root), 'utf8');
const css = fs.readFileSync(new URL('style-v800.css', root), 'utf8');
const preload = fs.readFileSync(new URL('entry-preload.mjs', root), 'utf8');
const chat = fs.readFileSync(new URL('chat-runtime.mjs', root), 'utf8');
const launcher = fs.readFileSync(new URL('firebase-launcher-entry.mjs', root), 'utf8');

const hudStart = html.indexOf('<div id="hud">');
const chatToggle = html.indexOf('id="chatToggleBtn"');
const chatPanel = html.indexOf('id="gameChat"');
assert.ok(chatToggle >= 0 && chatPanel >= 0, 'index.html must include chat toggle and panel markup');
assert.ok(hudStart >= 0, 'index.html must include #hud');
assert.ok(chatToggle < hudStart && chatPanel < hudStart, 'chat markup must sit outside #hud so pointer-events:none cannot swallow taps');

const toggleRule = css.match(/\.chat-toggle\{[^}]+\}/)?.[0] || '';
const panelRule = css.match(/\.game-chat\{[^}]+\}/)?.[0] || '';
assert.match(toggleRule, /z-index:15000/, 'chat toggle must stay above login/immersive gates on every viewport, not only max-width:700px');
assert.match(panelRule, /z-index:15001/, 'chat panel must stay above the toggle and login overlays');
assert.match(css, /@media \(orientation:landscape\) and \(max-height:560px\)\{\.chat-toggle\{[^}]*z-index:15000/, 'landscape phones must keep the raised chat stacking context');

const chatImportAt = preload.indexOf("import('./chat-runtime.mjs?v=8.4.0-chat-visible')");
const gameImportAt = preload.indexOf("await import('./game-v800.js?v=810')");
assert.ok(chatImportAt >= 0, 'preload must cache-bust chat-runtime');
assert.ok(gameImportAt >= 0, 'preload must still load the v800 runtime after the launch gate');
assert.ok(chatImportAt < gameImportAt, 'chat runtime must start before the heavy game module so 💬 binds during login/token load');
assert.match(preload, /if \(launch\.state === 'authenticated'\) document\.getElementById\('accountGate'\)\?\.classList\.add\('hidden'\)/, 'authenticated launch must hide the login gate before waiting on game-v800.js');

assert.match(chat, /function ensureChatMarkup\(\)/);
assert.match(chat, /ensureChatMarkup\(\);/);
assert.match(chat, /async function start\(\) \{\s*mount\(\);/s, 'chat UI must mount before waiting for a session token');
assert.match(chat, /querySelector\('#chatChannel'\)/, 'message pulls must read the mounted channel select');
assert.doesNotMatch(chat, /#mlChatChannel/, 'stale channel id would silently drop the selected room');
assert.match(chat, /z-index:15000!important/, 'runtime CSS must raise the toggle even when style-v800.css is cached');

assert.match(launcher, /chat-runtime\.mjs\?v=8\.4\.0-chat-visible/, 'Firebase launcher must bind 💬 from the GitHub Pages asset base');
assert.match(html, /src="\.\/entry-preload\.mjs\?v=8\.4\.0-chat-visible"/, 'HTML must cache-bust the preload that starts chat');

const output = fs.mkdtempSync(path.join(os.tmpdir(), 'pocketmonster-chat-launcher-'));
try {
  buildFirebaseLauncher({ root: path.resolve('.'), output });
  const launcherHtml = fs.readFileSync(path.join(output, 'index.html'), 'utf8');
  assert.match(launcherHtml, /firebase-launcher-entry\.mjs\?v=/, 'launcher build must rewrite the cache-busted preload script');
  assert.doesNotMatch(launcherHtml, /entry-preload\.mjs/, 'launcher HTML must not keep the game preload');
  assert.match(launcherHtml, /id="chatToggleBtn"/, 'launcher page keeps the chat toggle for the login screen');
} finally {
  fs.rmSync(output, { recursive: true, force: true });
}

console.log('Chat UI visibility contract: PASS');
