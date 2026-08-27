import assert from 'node:assert/strict';
import fs from 'node:fs';

for (const file of ['.github/workflows/github-pages.yml', '.github/workflows/firebase-hosting-merge.yml']) {
  const workflow = fs.readFileSync(file, 'utf8');
  assert.match(workflow, /workflow_dispatch:[\s\S]*launch_ticket:[\s\S]*type:\s*boolean[\s\S]*default:\s*false/);
  assert.match(workflow, /MONSTERLIFE_LAUNCH_TICKET:\s*['"]?\$\{\{\s*github\.event_name == 'push' \|\| inputs\.launch_ticket\s*\}\}/, 'main pushes must preserve the approved all-authenticated launch-ticket rollout');
}

console.log('production launch workflow contract passed');
