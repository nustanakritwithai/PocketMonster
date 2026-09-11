import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root), 'utf8');
const bootstrap = read('launch-bootstrap.mjs');
const preloadV900 = read('entry-preload-v900.mjs');
const sceneEntryV900 = read('scene-entry-v900.mjs');
const pagesBuilder = read('scripts/build-github-pages.mjs');
const launcherBuilder = read('scripts/build-firebase-launcher.mjs');

const html = read('index.html');
const inline = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(inline, 'index.html must have an early inline launch scrubber');
assert.ok(html.indexOf(`<script>${inline}</script>`) < html.indexOf('entry-preload-v900.mjs'),
  'index.html must scrub the handoff before loading the current entry module');
assert.match(inline, /window\.name=''/, 'index.html must clear window.name before external resources');
assert.match(inline, /history\.replaceState/, 'index.html must remove the fragment before external resources');
assert.match(inline, /getAll\('ticket'\)/, 'index.html must reject duplicate ticket parameters');
const digest = crypto.createHash('sha256').update(inline).digest('base64');
assert.match(html, new RegExp(`sha256-${digest.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
  'index.html CSP hash must match its early scrubber');
assert.match(html, /name="referrer" content="no-referrer"/, 'index.html must suppress Referer');
assert.ok(html.indexOf('name="referrer"') < html.indexOf('<script>'),
  'index.html must set referrer policy before scripts');
assert.doesNotMatch(html, /src="\.\/game-v800\.js/, 'index.html must not bypass the launch gate');

assert.match(preloadV900, /await prepareLaunch[\s\S]*await import\('\.\/online-world-shell-v900\.mjs/,
  'current online shell must start only after launch authentication');
assert.doesNotMatch(sceneEntryV900, /prepareLaunch|redeemLaunchTicket|entry-preload|chat-runtime|new WebSocket/,
  'hosted scenes must not create another launch or transport runtime');
assert.match(bootstrap, /url\.searchParams\.has\('ticket'\)/, 'query-string ticket attempts must fail closed');
assert.match(bootstrap, /launch\.invalid\) clearLaunchSession/, 'malformed handoffs must clear copied tab state');
assert.match(bootstrap, /else if \(launch\.ticket\)[\s\S]*clearLaunchSession[\s\S]*redeemLaunchTicket/,
  'fresh tickets must supersede stale sessions');
assert.match(bootstrap, /event\.origin !== FIREBASE_LAUNCHER_ORIGIN \|\| event\.source !== opener/,
  'mobile context recovery must verify exact launcher origin and opener');
assert.doesNotMatch(bootstrap, /localStorage/, 'session tokens must not use persistent storage');
assert.doesNotMatch(`${bootstrap}\n${preloadV900}\n${sceneEntryV900}`, /serviceWorker\.register/,
  'launch assets must not enter a service-worker cache');
assert.match(pagesBuilder, /launch-bootstrap\.mjs/, 'GitHub Pages build must include the launch bootstrap');
assert.match(pagesBuilder, /entry-preload-v900\.mjs/, 'GitHub Pages build must include the single current gated entry module');
assert.doesNotMatch(pagesBuilder, /['"]entry-preload\.mjs['"]/,
  'GitHub Pages build must not explicitly publish the retired legacy entry module');
assert.match(launcherBuilder, /firebase-launcher-entry\.mjs/, 'Firebase launcher build must include its secure entry module');

const combined = [bootstrap, preloadV900, read('firebase-launcher-entry.mjs'), read('server-auth.mjs')].join('\n');
assert.doesNotMatch(combined, /[?&]ticket=/, 'query-string ticket serialization is forbidden');
assert.doesNotMatch(combined, /firebase(?:Id)?Token\s*[:=]\s*['"][A-Za-z0-9._-]{24,}/i, 'raw Firebase tokens must not be embedded');
assert.doesNotMatch(combined, /sessionToken\s*[:=]\s*['"][A-Za-z0-9_-]{24,}/, 'raw session tokens must not be embedded');
const gameEntry = read('game-v800.js');
assert.match(gameEntry, /logout:\(\)=>logoutMonsterLifeSession\(runtimeConfig,authProfileBridge\.sessionToken\)/,
  'game logout must revoke the Server session and clear browser launch state');
assert.doesNotMatch(gameEntry, /logout:\(\)=>logoutServerSession/, 'game logout must not use the revoke-only helper');

console.log('Single-current-version launch security artifact contract: PASS');
