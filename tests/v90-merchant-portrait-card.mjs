import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../style-v900.css', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

assert.match(css, /Merchant market: vertical portrait card/);
assert.match(css, /\.merchant-shop \.merchant-card[\s\S]*width:min\(280px,72vw\)/);
assert.match(css, /\.merchant-shop \.merchant-card[\s\S]*min-height:0/);
assert.match(css, /\.merchant-shop \.merchant-card[\s\S]*max-height:min\(64dvh/);
assert.match(css, /place-items:center!important/);
assert.match(html, /style-v900\.css\?v=971/);

console.log('V9 merchant portrait card: PASS');
