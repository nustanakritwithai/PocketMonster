import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../style-v900.css', import.meta.url), 'utf8');

// ---------- Layout tokens (plan Task 7) ----------
assert.match(css, /--hud-hit-min:48px/, 'shared HUD touch target token is at least 48px');
assert.match(css, /--hud-top-budget:56px/, 'top HUD budget token exists');
assert.match(css, /--hud-side-budget:200px/, 'side HUD budget token exists');
assert.match(css, /--hud-dock-collapsed:56px/, 'collapsed dock height token exists');
assert.match(css, /--hud-dock-expanded:180px/, 'expanded dock height token exists');
assert.match(css, /--hud-control-gap:10px/, 'control gap token exists');

// ---------- Golden-reference region placement (1080x608) ----------
assert.match(css, /\.mmorpg-hud\{position:absolute;inset:0;pointer-events:none;z-index:30/, 'HUD shell covers the viewport without blocking scene input');
assert.match(css, /\.mmorpg-player-status\{[^}]*top:max\(var\(--hud-top-budget\),calc\(var\(--safe-top\) \+ 44px\)\)/, 'player status sits below the top budget at the left edge');
assert.match(css, /\.mmorpg-player-status\{[^}]*left:max\(10px,var\(--safe-left\)\)/, 'player status anchors to the safe left edge');
assert.match(css, /\.mmorpg-quest-panel\{[^}]*left:max\(10px,var\(--safe-left\)\)/, 'quest side panel keeps the left rail');
assert.match(css, /\.mmorpg-minimap\{[^}]*right:max\(10px,var\(--safe-right\)\)/, 'minimap anchors to the right edge');
assert.match(css, /\.mmorpg-roster\{[^}]*right:max\(10px,var\(--safe-right\)\)/, 'target/party roster keeps the right-middle stack');
assert.match(css, /\.mmorpg-dock\{position:absolute;left:50%;bottom:max\(var\(--hud-control-gap\),var\(--safe-bottom\)\);transform:translateX\(-50%\)/, 'dock is bottom-center between joystick and skills');
assert.match(css, /\.mmorpg-dock\{[^}]*width:min\(560px,52vw\)/, 'dock width matches the golden center console');
assert.match(css, /\.mmorpg-dock\.collapsed\{height:var\(--hud-dock-collapsed\)/, 'collapsed dock uses the token height');
assert.match(css, /\.mmorpg-dock\{[^}]*height:var\(--hud-dock-expanded\)/, 'expanded dock uses the token height');
assert.match(css, /\.mmorpg-bottom-strip\{[^}]*bottom:0/, 'bottom strip hugs the viewport bottom');
assert.match(css, /\.mmorpg-banner\{[^}]*left:50%/, 'system banner centers above the dock');

// ---------- Touch targets fail closed at 48px ----------
assert.match(css, /\.mmorpg-tab\{[^}]*min-width:var\(--hud-hit-min\)[^}]*min-height:var\(--hud-hit-min\)/, 'dock tabs keep 48px touch targets');
assert.match(css, /\.mmorpg-chat-input\{[^}]*min-height:var\(--hud-hit-min\)/, 'chat input keeps a 48px touch height');
assert.match(css, /\.mmorpg-chat-send\{[^}]*min-width:var\(--hud-hit-min\)[^}]*min-height:var\(--hud-hit-min\)/, 'chat send keeps a 48px touch target');
assert.match(css, /\.mmorpg-party-slot\{[^}]*min-height:40px/, 'party slot rows stay readable and tappable');
assert.match(css, /\.mmorpg-utility\{[^}]*min-height:var\(--hud-hit-min\)/, 'utility buttons keep 48px touch targets');
assert.match(css, /\.mmorpg-hud [^,{]*\{[^}]*pointer-events:auto/, 'HUD regions re-enable pointer events on purpose');

// ---------- Compact tiers (short landscape) ----------
assert.match(css, /@media \(max-height:420px\)\{[^]*?--hud-dock-expanded:140px/, 'compact tier shrinks the dock');
assert.match(css, /@media \(max-height:320px\)\{[^]*?--hud-dock-expanded:112px/, 'ultra-compact tier shrinks the dock further');
assert.match(css, /@media \(max-height:420px\)\{[^]*?\.mmorpg-minimap\{display:none/, 'compact tier drops the minimap before squeezing controls');

console.log('V9 unified HUD layout tokens: PASS');
