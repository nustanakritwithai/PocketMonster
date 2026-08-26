# Browser agent handoff: launch-ticket staging E2E

## Baseline

- Client staging: `371fd20adcc76bd30653e8129db6d8da91c7d708`
- Server staging: `d11ef4c323378fd724375db8a546dc5b75b75cee`
- Client implementation source: PR #293 / commit `2eb63732f65ca7b48df9ed365c1f6e61077a2151`
- Server repository: `nustanakritwithai/MonsterLifeServer`
- Production must not be deployed, restarted, or have feature flags enabled for this task.

## Prerequisites supplied outside Git

- An authorized non-production URL running the matching server/client staging revisions.
- `launchTicket=true` only in that environment, with `qaOnly=true` and the exact QA Firebase UID allowlisted.
- QA account sign-in data supplied through the agent/environment secret channel.
- Keep `vpsWrites=false` and `playerDataWrites=false` for the launch-only pass.

Do not create a user, guess sign-in data, inspect browser credential stores, or place tokens, cookies, Firebase IDs, credentials, or player data in Git, PR comments, screenshots, logs, reports, or checkpoints.

## Launch-only E2E

- [ ] Open the authorized launcher URL and confirm the staging release identifier.
- [ ] Sign in with the supplied QA account.
- [ ] Request a one-time launch ticket.
- [ ] Confirm the redirect URL contains only the opaque ticket and permitted state data.
- [ ] Confirm the game removes handoff parameters from the address bar before normal startup.
- [ ] Redeem once successfully and verify profile read succeeds.
- [ ] Replay the same ticket and verify it is rejected.
- [ ] Verify direct GitHub Pages access does not grant an authenticated online session.
- [ ] Log out and verify server revoke plus browser session cleanup.
- [ ] Record redacted screenshots/network evidence without sensitive values.

## Save/read E2E — separate authorization gate

Run only after explicit authorization to enable both write flags for the exact QA username in non-production:

- [ ] Set `vpsWrites=true`, `playerDataWrites=true`, `qaOnly=true`, cohort `0`, exact QA username allowlisted.
- [ ] Read the initial revision and canonical profile/save.
- [ ] Perform one approved non-economic save mutation with an idempotency key.
- [ ] Verify revision increments once and replay returns the same result.
- [ ] Verify stale revision and key-reuse-with-different-payload are rejected.
- [ ] Reload and confirm canonical projection/save reconciliation.
- [ ] Disable both write flags immediately after evidence collection.

## Existing evidence

- Release build: 0 warnings / 0 errors.
- Static launch, write-gate, preflight, and security contracts pass.
- Isolated launch contract passes response-loss recovery, restart recovery, replay rejection, concurrency atomicity, and TTL boundary.
- Isolated schema 22 contract passes rollback, replay, key conflict, stale revision, concurrency, final revision, and cleanup.
- Exact candidate QA issue/redeem and allowlist contracts pass with write flags disabled.
- Isolated connectivity/security checks pass 15/15.
- Read load passes 1,000 virtual users / 2,000 requests / 0 failures at approximately 214 requests per second.

## Completion report

Post only redacted results to this PR. State the tested client/server SHAs, environment label, each checklist result, whether flags were restored to false, and any defect with reproducible non-sensitive steps.
