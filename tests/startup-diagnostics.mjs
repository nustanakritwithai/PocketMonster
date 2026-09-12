import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = fs.readFileSync(path.join(root, 'startup-errors.mjs'), 'utf8')
  .replace('export function recordStartupDiagnostic', 'function recordStartupDiagnostic');

const listeners = new Map();
const storage = new Map();
const document = { getElementById: () => null };
const window = {
  addEventListener(type, handler) { listeners.set(type, handler); },
  POCKETMONSTER_STARTUP_DIAGNOSTICS: null,
};
const context = vm.createContext({
  window,
  document,
  location: { href: 'https://pocket.example/v900.html?ticket=secret', pathname: '/v900.html' },
  sessionStorage: {
    getItem(key) { return storage.get(key) ?? null; },
    setItem(key, value) { storage.set(key, value); },
  },
  URL,
  JSON,
  Object,
  String,
  Date,
  Set,
});
vm.runInContext(`${source}\nthis.recordStartupDiagnostic = recordStartupDiagnostic;`, context);

const first = context.recordStartupDiagnostic('phase-with-token', {
  message: 'Bearer abc ?token=secret',
  filename: 'https://cdn.example/app.js?ticket=secret&x=1',
  line: 12,
  secretField: 'must-not-be-recorded',
});
assert.equal(first.message, 'Bearer [redacted] ?token=[redacted]');
assert.equal(first.filename, '/app.js');
assert.equal(first.line, '12');
assert.equal('secretField' in first, false);
assert.equal(context.window.POCKETMONSTER_STARTUP_DIAGNOSTICS.events.length, 2);

for (let i = 0; i < 30; i += 1) context.recordStartupDiagnostic(`event-${i}`, { message: 'x'.repeat(400) });
const snapshot = context.window.POCKETMONSTER_STARTUP_DIAGNOSTICS;
assert.equal(snapshot.events.length, 24);
assert.ok(snapshot.events.every(event => Object.values(event).every(value => String(value).length <= 240)));

listeners.get('error')({ message: 'parent failure', filename: 'https://p.example/main.js?token=hidden', lineno: 7 });
listeners.get('unhandledrejection')({ reason: { message: 'rejected' } });
const phases = context.window.POCKETMONSTER_STARTUP_DIAGNOSTICS.events.map(event => event.phase);
assert.ok(phases.includes('window-error'));
assert.ok(phases.includes('unhandled-rejection'));

// Cross-origin child failures do not bubble into these parent listeners. The
// recorder must not claim child evidence without a validated bridge message.
assert.equal(listeners.has('message'), false);
assert.equal(phases.includes('child-error'), false);

const sceneEntry = fs.readFileSync(path.join(root, 'scene-entry-v900.mjs'), 'utf8');
assert.match(sceneEntry, /await import\('\.\/startup-errors\.mjs'\)/);
const sceneStartupImport = sceneEntry.indexOf("await import('./startup-errors.mjs')");
const firstSceneRecord = sceneEntry.indexOf("recordStartupDiagnostic('scene-entry-start'");
const firstSessionGate = sceneEntry.indexOf('sceneLease = registerParentSceneBoot()');
const templateGate = sceneEntry.indexOf('fetch(templateUrl');
assert.ok(sceneStartupImport >= 0 && firstSceneRecord >= 0 && firstSessionGate >= 0 && templateGate >= 0);
assert.ok(sceneStartupImport < firstSceneRecord,
  'diagnostic recorder must be installed before the first scene phase is recorded');
assert.ok(sceneStartupImport < firstSessionGate,
  'session failures must be recordable');
assert.ok(sceneStartupImport < templateGate,
  'template fetch failures must be recordable');

console.log('startup diagnostics VM contract: PASS');
