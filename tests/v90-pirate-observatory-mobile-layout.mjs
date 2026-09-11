import fs from 'node:fs';
import assert from 'node:assert/strict';

const css = fs.readFileSync(new URL('../pirate-observatory/dashboard-map-p1.css', import.meta.url), 'utf8');

assert.match(css, /@media\(max-width:900px\)/, 'mobile breakpoint is required');
assert.match(css, /grid-template-areas:\"top\" \"main\" \"inspector\" \"rail\"/, 'mobile layout must stay map-first with inspector above bottom navigation');
assert.match(css, /grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/, 'mobile navigation must expose three workspaces');
assert.match(css, /\.rail-spacer,\.rail-button:not\(\[data-workspace\]\)\{display:none!important\}/, 'desktop-only rail actions must stay hidden on mobile');
assert.match(css, /\.timeline\{display:none!important\}/, 'desktop timeline must not overlap the mobile inspector/navigation');
assert.match(css, /\.map-panel\{grid-area:main;[^}]*width:100%;height:100%/, 'world map must occupy the available mobile viewport');
assert.match(css, /\.map-empty\{[\s\S]*left:12px;[\s\S]*right:12px;[\s\S]*transform:none/, 'mobile empty-state must be a compact map overlay instead of a centered modal');
assert.match(css, /\.inspector\{[\s\S]*max-height:24dvh/, 'mobile inspector must remain a bounded bottom sheet');
assert.match(css, /\.inspector-actions button:disabled\{display:none\}/, 'disabled inspector actions must not consume scarce mobile space');
assert.match(css, /\.chip\[data-layer=\"performance\"\]\{display:none\}/, 'performance layer must move out of the primary mobile toolbar');

console.log('v90 Pirate World Observatory mobile layout: PASS');
