import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../style-v800.css', import.meta.url), 'utf8');
const pass = css.match(/\/\* Mobile menu density pass \*\/([\s\S]*?)\/\* Mobile menu density pass end \*\//)?.[1] || '';
assert.ok(pass, 'mobile menu density pass CSS block is required');
assert.match(pass, /--menu-touch:36px/, 'menu buttons use a denser 36px tap target on mobile');
assert.match(pass, /@media \(pointer:coarse\),\(hover:none\),\(max-width:1100px\)/, 'density pass applies to phones, hoverless devices, and typical mobile landscape widths');
for (const rule of [
  '.manager-card',
  '.manager-sub,.manager-note{display:none}',
  '.character-info-tab',
  '.ranch-services-card',
  '.merchant-card,.trainer-card,.evolution-guide-card,.breeding-caretaker-card',
  '.warp-prompt-card',
  '.account-card',
  '.stage-select-card',
  '.utility-menu',
]) {
  assert.ok(pass.includes(rule), `density pass must compact ${rule}`);
}
assert.match(pass, /\.manager-head\{font-size:14px/, 'character manager title shrinks on mobile');
assert.match(pass, /\.warp-prompt-card h2\{font-size:13px/, 'warp sheet title shrinks on mobile');
assert.match(pass, /width:min\(280px,52vw\)/, 'warp sheet stays a compact chip instead of a wide stage banner');
assert.match(pass, /\.warp-prompt \.stage-select-handle,\.warp-prompt \.stage-select-kicker\{display:none\}/, 'warp sheet drops the handle and WARP POINT kicker');
assert.match(pass, /\.ranch-services-card h2,.ranch-storage-head h2\{font-size:14px/, 'ranch sheet title shrinks on mobile');
assert.match(pass, /min-height:var\(--menu-touch\)/, 'sheet actions use the denser menu tap target');
assert.match(pass, /@media \(pointer:coarse\) and \(orientation:landscape\)/, 'landscape phones get a tighter second pass');
assert.match(pass, /\.npc-btn:after\{content:none\}/, 'NPC talk chip drops the long ผู้ดูแล suffix');
assert.match(pass, /place-items:end center/, 'NPC overlays dock as bottom-centered sheets');
assert.match(pass, /\.breeding-preview-grid\{grid-template-columns:1fr 1fr/, 'breeding parent slots stay two-column after the heart is hidden');
assert.match(pass, /\.merchant-shop,\.trainer-panel,\.evolution-guide-panel,\.breeding-caretaker-panel,\.ranch-services/, 'NPC overlays dock as bottom sheets');
assert.match(pass, /\.merchant-head small,\.merchant-dialog,\.merchant-foot,\.trainer-kicker,\.trainer-head p,\.trainer-dialog/, 'verbose NPC dialogs and kickers hide on mobile');
assert.doesNotMatch(pass, /\.action\.skill|\.skill1|\.capture\{/, 'density pass must not shrink combat HUD buttons');

console.log('V8.2 mobile menu density pass: PASS');
