import assert from 'node:assert/strict';
import { activeJs as js } from './active-assets.mjs';

assert.match(js, /function renderFocusedEvolutionBuildPreview\(\)/, 'Phase 10 needs a focused Evolution Build Preview renderer');
assert.match(js, /focusedCharacterPresentation\(\)/, 'evolution preview must resolve the focused live instance');
assert.match(js, /evaluateEvolution\(/, 'requirements must use the existing evolution evaluator');
assert.match(js, /previewEvolution\(/, 'candidate build comparison must use the existing non-mutating preview');
for (const label of ['HP', 'ATK', 'DEF', 'SPD', 'Skill Carry', 'Requirement']) assert.match(js, new RegExp(label), `preview must expose ${label}`);
const renderer=js.match(/function renderFocusedEvolutionBuildPreview\(\)\{([\s\S]*?)\n\}\nfunction renderEvolution\([^)]*\)/)?.[1]||'';
assert.ok(renderer, 'Evolution Build Preview renderer body is required');
assert.doesNotMatch(renderer, /(?:inst\.formId\s*=|inst\.evolutionProfile\s*=|commitEvolution\()/, 'preview renderer must not commit evolution state');

console.log('V8.2 Character UI Phase 10 Evolution Build Preview: PASS');
