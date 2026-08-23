import assert from 'node:assert/strict';
import fs from 'node:fs';

const js = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} must exist`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  assert.fail(`${name} must have a balanced body`);
}

assert.match(functionSource(js, 'populateWorld'), /function populateWorld\(zone/, 'mutant 1: zone decorations still rebuild through populateWorld');
assert.match(functionSource(js, 'addDeco'), /mesh\.traverse\(obj=>\{ if\(obj\.isMesh\)\{ obj\.castShadow=true; obj\.receiveShadow=true; \} \}\)/, 'mutant 2: streamed props still receive the polish shadow flags');
assert.match(functionSource(js, 'switchZone'), /populateWorld\(zone\)/, 'mutant 3: zone changes still rebuild decorations');
assert.match(functionSource(js, 'switchZone'), /flushNearbyDecos\(player\.position,WORLD_STREAM\.zoneAttachBudget\)/, 'mutant 4: the neighborhood flush stays after the player is placed');
assert.match(functionSource(js, 'spawnZone'), /spawnRecords\(cfg\.spawn\)/, 'mutant 5: configured wilds still spawn immediately');
assert.match(functionSource(js, 'clearDecorations'), /removeAndDispose\(decorations,decorations\.children\[0\]\)/, 'mutant 6: attached props still go through removeAndDispose');
assert.match(functionSource(js, 'clearDecorations'), /disposeObject3D\(decoAttachQueue/, 'mutant 7: queued props are disposed on zone clear');
assert.match(functionSource(js, 'loop'), /updateWorldStream\(\)/, 'mutant 8: the live loop must keep streaming the neighborhood');
assert.match(functionSource(js, 'loop'), /STREAM_HITCH\.armed/, 'mutant 8b: hitch sampling stays in the live loop');
assert.match(functionSource(js, 'switchZone'), /lastSwitchZoneMs=performance\.now\(\)-switchStarted/, 'mutant 8c: zone switches keep hitch timing');
assert.doesNotMatch(functionSource(js, 'updateWorldStream'), /removeAndDispose|disposeObject3D/, 'mutant 9: walking away must not dispose reusable decorations');
assert.match(js, /loadRadius:22/, 'mutant 10: the nearby attach radius stays 22m');
assert.match(js, /zoneAttachBudget:12/, 'mutant 12: zone entry must not attach the whole neighborhood in one hitch');

console.log('V8.0 world stream mutants: PASS');
