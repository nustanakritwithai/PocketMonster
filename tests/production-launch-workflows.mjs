import assert from 'node:assert/strict';
import fs from 'node:fs';

const pages = fs.readFileSync('.github/workflows/github-pages.yml', 'utf8');
const firebase = fs.readFileSync('.github/workflows/firebase-hosting-merge.yml', 'utf8');

function assertOrder(source, before, after, message) {
  const beforeIndex = source.indexOf(before);
  const afterIndex = source.indexOf(after);
  assert.ok(beforeIndex >= 0, `missing workflow marker: ${before}`);
  assert.ok(afterIndex >= 0, `missing workflow marker: ${after}`);
  assert.ok(beforeIndex < afterIndex, message);
}

assert.match(pages, /workflow_dispatch:/, 'manual Production deployment remains available through the single release workflow');
for (const workflow of [pages, firebase]) {
  assert.doesNotMatch(workflow, /inputs\.launch_ticket|launch_ticket:/, 'live deployment cannot opt back into the legacy local-session path');
  assert.match(workflow, /MONSTERLIFE_LAUNCH_TICKET:\s*'true'/, 'every live deployment must require one authenticated Monster Life launch session');
  assert.match(workflow, /MONSTERLIFE_READONLY_ORIGIN:\s*'https:\/\/157\.85\.96\.139'/, 'both hosts must use the same immutable read-only Server origin');
  assert.match(workflow, /MONSTERLIFE_EXPECTED_API_BASE_URL:\s*'https:\/\/157\.85\.96\.139'/, 'live verifier must enforce the exact shared Server origin');
  assert.match(workflow, /node tests\/v90-deployment-gates\.mjs/, 'deployment probe contracts must run before a Production mutation');
}

const pagesConcurrencyGroup = pages.match(/concurrency:[\s\S]*?group:\s*([^\r\n]+)/)?.[1]?.trim();
assert.equal(pagesConcurrencyGroup, 'pocketmonster-production-release');
assert.match(pages, /cancel-in-progress:\s*false/, 'the complete Pages-to-Firebase release must finish before another release can run');
assert.doesNotMatch(firebase, /concurrency:/, 'the called Firebase workflow inherits the caller release lifetime instead of opening another lock window');
assert.doesNotMatch(firebase, /vars\.MONSTERLIFE_READONLY_ORIGIN/, 'Firebase cannot drift to a mutable Server origin');

assert.match(pages, /push:\s*\r?\n\s*branches:\s*\r?\n\s*- main/, 'main pushes must enter the Pages release pipeline');
assert.match(pages, /MONSTERLIFE_RELEASE_VERSION:\s*'8\.4\.0-github\.\$\{\{ github\.sha \}\}'/);
assertOrder(pages, 'verify-live-v9-deployment.mjs backend', 'uses: actions/deploy-pages@v4', 'backend health/version must pass before Pages mutation');
assertOrder(pages, 'uses: actions/deploy-pages@v4', 'Verify deployed GitHub Pages release', 'Pages must be deployed before its live release is verified');
assert.match(pages, /verify-live-v9-deployment\.mjs pages/);
assert.match(pages, /deploy-firebase:[\s\S]*needs:\s*deploy[\s\S]*uses:\s*\.\/\.github\/workflows\/firebase-hosting-merge\.yml[\s\S]*release_sha:\s*\$\{\{ github\.sha \}\}[\s\S]*secrets:\s*inherit/, 'one caller run must hold the release lock through the Firebase reusable workflow');

const firebaseTriggers = firebase.slice(firebase.indexOf('on:'), firebase.indexOf('permissions:'));
assert.doesNotMatch(firebaseTriggers, /^\s*push:/m, 'Firebase must not race Pages on a main push');
assert.doesNotMatch(firebaseTriggers, /workflow_run:|workflow_dispatch:/, 'Firebase cannot be started outside the locked caller release');
assert.match(firebaseTriggers, /workflow_call:[\s\S]*release_sha:[\s\S]*required:\s*true[\s\S]*type:\s*string/, 'Firebase accepts only the caller release SHA');
assert.match(firebase, /FIREBASE_SERVICE_ACCOUNT_POCKETMONSTER_GAME:[\s\S]*required:\s*true/, 'the reusable deployment declares its required hosting credential');
assert.match(firebase, /RELEASE_SHA:\s*\$\{\{ inputs\.release_sha \}\}/);
assert.match(firebase, /ref:\s*\$\{\{ env\.RELEASE_SHA \}\}/, 'Firebase must checkout the exact Pages release SHA');
assert.match(firebase, /MONSTERLIFE_RELEASE_VERSION:\s*'8\.4\.0-github\.\$\{\{ env\.RELEASE_SHA \}\}'/);
assertOrder(firebase, 'Verify matching GitHub Pages release', 'Deploy to Firebase Hosting', 'Firebase must wait for the exact live Pages SHA and safe flags');
assertOrder(firebase, 'verify-live-v9-deployment.mjs backend', 'Deploy to Firebase Hosting', 'backend health/version must pass before Firebase mutation');
assertOrder(firebase, 'Deploy to Firebase Hosting', 'Verify deployed Firebase launcher', 'Firebase must pass a live smoke test after deployment');
assert.match(firebase, /verify-live-v9-deployment\.mjs pages/);
assert.match(firebase, /verify-live-v9-deployment\.mjs firebase/);

console.log('production launch workflow contract passed');
