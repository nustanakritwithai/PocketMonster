# Browser Agent Production Test: VPS Monster/Progress Read Preview

## Target

- Web app: https://pocketmonster-game.web.app/
- VPS API: https://157.85.96.139
- Runtime mode: `hybrid`
- Authentication authority: Firebase Auth
- Data-write authority: Firebase/Firestore (unchanged)

## Safety constraints

- Do not enable `vpsWrites`, `playerDataWrites`, `accountMigration`,
  `saveMigration`, or `economyMutation`.
- Do not create, delete, trade, hatch, evolve, or modify monsters while testing.
- Do not change inventory, currency, quests, or account linking.
- Use an existing non-guest Firebase test account with known monster data.
- Stop if the client shows different monster ownership or progress after the VPS
  overlay; capture evidence before refreshing.

## Preconditions

1. Open `runtime-config.json` from the deployed site and verify:
   - `environment` is `hybrid`.
   - `firebaseAuthBridge`, `profileReads`, and `playerStateReads` are `true`.
   - `vpsWrites` and `playerDataWrites` are `false`.
   - `firebaseFallback` is `true`.
2. Verify `GET https://157.85.96.139/api/health` returns HTTP 200 with
   `ready: true`.
3. Start with DevTools Network and Console recording enabled. Preserve logs
   across navigation.

## Test flow

1. Open the production game with a cache-busting query parameter.
2. Sign in using Firebase email/password with the existing test account. Do not
   use guest login.
3. Confirm the login screen clears and the game reaches the playable world.
4. In Network, verify the Firebase identity exchange request succeeds and that
   its `Authorization` request header contains a Bearer token. Never copy the
   token into the report.
5. Verify the authenticated request to `/api/player/state` is sent to the VPS
   and record its HTTP status.
6. Confirm there are no CORS, mixed-content, certificate, module-load, or
   uncaught JavaScript errors.
7. Open the monster roster and compare monster count, species, level, active
   placement, and visible progress with the known Firebase state.
8. Reload once and confirm the same account and state load consistently.
9. Temporarily block the `/api/player/state` request in DevTools, reload, and
   confirm Firebase fallback still lets the game load. Remove the block after
   the check.
10. Sign out and confirm returning to the login screen. Verify a subsequent
    unauthenticated `/api/player/state` request is absent or returns HTTP 401.

## Expected results

- Firebase remains the login provider.
- The identity exchange and `/api/player/state` both succeed for the signed-in
  test account.
- VPS data overlays only monster placement/progress fields when records exist.
- Missing or unavailable VPS state does not prevent Firebase data from loading.
- No write request is sent for player state, monsters, inventory, economy, or
  quests.
- No Firebase ID token or MonsterLife session token is included in screenshots,
  console output, or the PR report.

## Evidence to attach to the PR

- Browser/device and test timestamp (Asia/Bangkok).
- Pass/fail for every numbered step.
- HTTP status and request path only; redact authorization values.
- Screenshot of the playable world and monster roster with private account data
  obscured.
- Console error summary.
- Firebase fallback result.
- Any mismatch in monster count, species, level, placement, or progress.
