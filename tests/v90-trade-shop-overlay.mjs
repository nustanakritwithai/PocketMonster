import assert from 'node:assert/strict';
import fs from 'node:fs';

const pirateHud = fs.readFileSync(new URL('../pirate-fruit-control-hud-v900.mjs', import.meta.url), 'utf8');
const presentation = fs.readFileSync(new URL('../pirate-fruit-offline/pocket-presentation.mjs', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../style-v900.css', import.meta.url), 'utf8');

assert.match(presentation, /OVERLAY_ROOTS[\s\S]*\.trade-shop-root/, 'trade shop stands parent HUD down while open');
assert.match(presentation, /pirate-fruit-control-hud-v900\.mjs\?v=22/, 'presentation cache-busts trade-shop HUD policy');
assert.match(pirateHud, /\.trade-shop-root[\s\S]*z-index: 90/, 'trade shop root stacks above iframe chrome');
assert.match(pirateHud, /\.trade-shop[\s\S]*width: min\(560px, 96vw\)[\s\S]*max-height: min\(78vh/, 'trade shop keeps a readable maritime market panel');
assert.doesNotMatch(css, /Merchant market: vertical portrait card/, 'wrong #591 merchant portrait card CSS is gone');
assert.match(html, /style-v900\.css\?v=978/, 'active HTML cache-busts after removing merchant portrait CSS');

console.log('V9 maritime trade shop overlay: PASS');
