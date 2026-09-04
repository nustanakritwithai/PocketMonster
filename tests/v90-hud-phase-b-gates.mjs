import assert from 'node:assert/strict';
import fs from 'node:fs';

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const css = fs.readFileSync(new URL('../style-v900.css', import.meta.url), 'utf8');
const mobileMinimapCss = fs.readFileSync(new URL('../unified-minimap-mobile-v900.css', import.meta.url), 'utf8');
const shell = fs.readFileSync(new URL('../online-world-shell-v900.mjs', import.meta.url), 'utf8');
const hud = fs.readFileSync(new URL('../unified-mmorpg-hud-v900.mjs', import.meta.url), 'utf8');
const pirateHud = fs.readFileSync(new URL('../pirate-fruit-control-hud-v900.mjs', import.meta.url), 'utf8');
const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const scene = fs.readFileSync(new URL('../scene-v900.html', import.meta.url), 'utf8');
const runtimeConfig = JSON.parse(fs.readFileSync(new URL('../runtime-config.json', import.meta.url), 'utf8'));
const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/v90-mmorpg-hud-reference-regions.json', import.meta.url), 'utf8'));

assert.match(pkg.scripts['test:v90:hud-phase-b'], /v90-mmorpg-hud-reference-layout/, 'Phase B verification script includes the golden layout gate');
assert.match(pkg.scripts['test:v90:pirate-player'], /v90-hud-phase-b-gates/, 'pirate-player runs the Phase B verification gate');
const sceneRuntime = fs.readFileSync(new URL('./v90-unified-scene-runtime.mjs', import.meta.url), 'utf8');
assert.match(sceneRuntime, /world-presence-protocol\.mjs/, 'scene-runtime harness loads the protocol owner');

assert.equal(fixture.viewport.width, 1080);
assert.equal(fixture.viewport.height, 608);
assert.equal(fixture.tolerancePx, 4);
for (const id of ['playerStatus', 'questPanel', 'banner', 'roster', 'minimap', 'utilities', 'companions', 'chatConsole', 'bottomStrip', 'combatCluster']) {
  assert.ok(fixture.regions.some(region => region.id === id), `${id} is in the golden fixture`);
}

assert.match(shell, /createUnifiedMmorpgHud/, 'production shell owns one Dock');
assert.match(shell, /unifiedHud\?\.unmount/, 'session end tears the Dock down');
assert.match(hud, /UNIFIED_MMORPG_HUD_KIND/, 'Dock exports a single kind');
assert.doesNotMatch(css, /viewer-annotation|black-arrow-overlay/, 'reference viewer overlay is not a game HUD');
assert.match(index, /style-v900\.css\?v=966/);
assert.match(scene, /style-v900\.css\?v=966/);
assert.equal(index, fs.readFileSync(new URL('../v900.html', import.meta.url), 'utf8'));

for (const flag of ['vpsWrites', 'playerDataWrites']) {
  assert.equal(runtimeConfig.featureFlags[flag], false, `${flag} stays closed after Phase B HUD`);
}

assert.match(css, /\.mmorpg-player-status\{[^}]*left:0\.4%/, 'player status keeps the top-left golden anchor');
assert.match(css, /\.mmorpg-dock\{[^}]*left:32\.5%/, 'chat console keeps the bottom-center golden anchor');
for (const [property, value] of [
  ['left', '84\\.4%'],
  ['top', '0'],
  ['width', '15\\.4%'],
  ['height', '28\\.1%'],
  ['border-radius', '10px'],
]) {
  assert.match(css, new RegExp(`\\.mmorpg-minimap\\{[^}]*${property}:${value}`), `rectangular unified minimap keeps ${property}`);
}
assert.match(mobileMinimapCss, /@media\s*\(max-height:420px\)/, 'mobile minimap override targets short landscape phones');
assert.match(mobileMinimapCss, /\.mmorpg-hud \.mmorpg-minimap\{display:block!important\}/, 'short landscape phones keep the unified minimap visible');
assert.match(pirateHud, /\.game-minimap\s*\{[\s\S]*visibility:\s*hidden\s*!important/, 'Pirate child circular minimap is retired');
assert.match(pirateHud, /.progression-hud/, 'Pirate child HP cluster is retired');
assert.match(css, /#pirateUnifiedControls\{[^}]*--arc-r:60px/, 'combat cluster stays an arc');
assert.ok(index.indexOf('id="pirateUnifiedControls"') < index.indexOf('<div id="hud">'), 'combat cluster is not nested inside retired #hud');

console.log('V9 HUD Phase B verification gates: PASS');
