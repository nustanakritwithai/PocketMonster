import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root), 'utf8');
const bootstrap = read('launch-bootstrap.mjs');
const preload = read('entry-preload.mjs');
const pagesBuilder = read('scripts/build-github-pages.mjs');
const launcherBuilder = read('scripts/build-firebase-launcher.mjs');

for (const name of ['index.html', 'v800.html']) {
  const html = read(name);
  const inline = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(inline, `${name} must have an early inline launch scrubber`);
  assert.ok(html.indexOf(`<script>${inline}</script>`) < html.indexOf('entry-preload.mjs'), `${name} must scrub the handoff before loading modules`);
  assert.match(inline, /window\.name=''/, `${name} must clear window.name before external resources`);
  assert.match(inline, /history\.replaceState/, `${name} must remove the fragment before external resources`);
  assert.match(inline, /getAll\('ticket'\)/, `${name} must reject duplicate ticket parameters`);
  const digest = crypto.createHash('sha256').update(inline).digest('base64');
  assert.match(html, new RegExp(`sha256-${digest.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), `${name} CSP hash must match its early scrubber`);
  assert.match(html, /name="referrer" content="no-referrer"/, `${name} must suppress Referer`);
  assert.ok(html.indexOf('name="referrer"') < html.indexOf('<script>'), `${name} must set referrer policy before scripts`);
  assert.doesNotMatch(html, /src="\.\/game-v800\.js/, `${name} must not bypass the launch gate`);
}

assert.match(preload, /await prepareLaunch[\s\S]*await import\('\.\/game-v800\.js/, 'game import must occur after launch authentication');
assert.match(bootstrap, /url\.searchParams\.has\('ticket'\)/, 'query-string ticket attempts must fail closed');
assert.match(bootstrap, /launch\.invalid\) clearLaunchSession/, 'malformed handoffs must clear copied tab state');
assert.match(bootstrap, /else if \(launch\.ticket\)[\s\S]*clearLaunchSession[\s\S]*redeemLaunchTicket/, 'fresh tickets must supersede stale sessions');
assert.match(bootstrap, /event\.origin !== FIREBASE_LAUNCHER_ORIGIN \|\| event\.source !== opener/, 'mobile context recovery must verify exact launcher origin and opener');
assert.doesNotMatch(bootstrap, /localStorage/, 'session tokens must not use persistent storage');
assert.doesNotMatch(`${bootstrap}\n${preload}`, /serviceWorker\.register/, 'launch assets must not enter a service-worker cache');
assert.match(pagesBuilder, /launch-bootstrap\.mjs/, 'GitHub Pages build must include the launch bootstrap');
assert.match(pagesBuilder, /entry-preload\.mjs/, 'GitHub Pages build must include the gated entry module');
assert.match(launcherBuilder, /firebase-launcher-entry\.mjs/, 'Firebase launcher build must include its secure entry module');

const combined = [bootstrap, preload, read('firebase-launcher-entry.mjs'), read('server-auth.mjs')].join('\n');
assert.doesNotMatch(combined, /[?&]ticket=/, 'query-string ticket serialization is forbidden');
assert.doesNotMatch(combined, /firebase(?:Id)?Token\s*[:=]\s*['"][A-Za-z0-9._-]{24,}/i, 'raw Firebase tokens must not be embedded');
assert.doesNotMatch(combined, /sessionToken\s*[:=]\s*['"][A-Za-z0-9_-]{24,}/, 'raw session tokens must not be embedded');
const gameEntry = read('game-v800.js');
assert.match(gameEntry, /logout:\(\)=>logoutMonsterLifeSession\(runtimeConfig,authProfileBridge\.sessionToken\)/, 'game logout must revoke the Server session and clear browser launch state');
assert.doesNotMatch(gameEntry, /logout:\(\)=>logoutServerSession/, 'game logout must not use the revoke-only helper');

console.log('Launch security artifact contract: PASS');
