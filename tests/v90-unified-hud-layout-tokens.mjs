import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../style-v900.css', import.meta.url), 'utf8');

// ---------- Layout tokens (plan Task 7) ----------
assert.match(css, /--hud-hit-min:48px/, 'shared HUD touch target token is at least 48px');
assert.match(css, /--hud-top-budget:56px/, 'top HUD budget token exists');
assert.match(css, /--hud-side-budget:200px/, 'side HUD budget token exists');
assert.match(css, /--hud-dock-collapsed:56px/, 'collapsed dock height token exists');
assert.match(css, /--hud-dock-expanded:96px/, 'expanded dock height token exists');
assert.match(css, /--hud-control-gap:10px/, 'control gap token exists');

// ---------- Golden-reference region placement (1080x608) ----------
assert.match(css, /\.mmorpg-hud\{position:absolute;inset:0;pointer-events:none;z-index:30/, 'HUD shell covers the viewport without blocking scene input');
assert.match(css, /\.mmorpg-player-status\{[^}]*top:0\.7%/, 'player status sits top-left');
assert.match(css, /\.mmorpg-player-status\{[^}]*left:0\.4%/, 'player status anchors to the left edge');
assert.match(css, /\.mmorpg-quest-panel\{[^}]*left:2\.6%/, 'quest side panel keeps the left rail');
assert.match(css, /\.mmorpg-minimap\{[^}]*left:84\.4%/, 'minimap anchors to the right edge');
assert.match(css, /\.mmorpg-roster\{[^}]*left:62\.5%/, 'target/party roster keeps the right-middle stack');
assert.match(css, /\.mmorpg-dock\{position:absolute;left:32\.5%;bottom:0;transform:none/, 'dock is the bottom-center chat console');
assert.match(css, /\.mmorpg-dock\{[^}]*width:32\.7%/, 'dock width matches the golden center console');
assert.match(css, /\.mmorpg-dock\.collapsed\{height:var\(--hud-dock-collapsed\)/, 'collapsed dock uses the token height');
assert.match(css, /\.mmorpg-dock\{[^}]*height:var\(--hud-dock-expanded\)/, 'expanded dock uses the token height');
assert.match(css, /\.mmorpg-bottom-strip\{[^}]*bottom:0/, 'bottom strip hugs the viewport bottom');
assert.match(css, /\.mmorpg-banner\{[^}]*left:29\.4%/, 'system banner sits top-center');

// ---------- Touch targets fail closed at 48px ----------
assert.match(css, /\.mmorpg-tab\{[^}]*min-width:var\(--hud-hit-min\)/, 'dock tabs keep a 48px wide hit strip');
assert.match(css, /\.mmorpg-tab\{[^}]*min-height:0/, 'dock tabs hug แชท/เควส/Party with no extra height');
assert.doesNotMatch(css, /\.mmorpg-tab\{[^}]*min-height:var\(--hud-hit-min\)/, 'dock tabs are not 48px tall');
assert.match(css, /\.mmorpg-chat-form\{[^}]*flex:0 0 auto/, 'chat compose sits on the dock bottom');
assert.match(css, /\.mmorpg-chat-input\{[^}]*min-height:0/, 'chat input hugs the text row');
assert.match(css, /\.mmorpg-chat-send\{[^}]*min-height:0/, 'chat send hugs the text row');
assert.match(css, /\.mmorpg-dock\{[^}]*rgba\(36,24,12,\.38\)/, 'dock glass is transparent');
assert.doesNotMatch(css, /\.mmorpg-chat-input\{[^}]*min-height:var\(--hud-hit-min\)/, 'chat input is not a 48px bar');
assert.match(css, /\.mmorpg-party-slot\{[^}]*min-height:40px/, 'party slot rows stay readable and tappable');
assert.match(css, /\.mmorpg-utility\{[^}]*min-height:var\(--hud-hit-min\)/, 'utility buttons keep 48px touch targets');
assert.match(css, /\.mmorpg-hud [^,{]*\{[^}]*pointer-events:auto/, 'HUD regions re-enable pointer events on purpose');

// ---------- Compact tiers (short landscape) ----------
assert.match(css, /@media \(max-height:420px\)\{[^]*?--hud-dock-expanded:80px/, 'compact tier shrinks the dock');
assert.match(css, /@media \(max-height:320px\)\{[^]*?--hud-dock-expanded:64px/, 'ultra-compact tier shrinks the dock further');
assert.match(css, /@media \(max-height:420px\)\{[^]*?\.mmorpg-minimap\{display:none/, 'compact tier drops the minimap before squeezing controls');

console.log('V9 unified HUD layout tokens: PASS');
