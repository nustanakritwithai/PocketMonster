# PocketMonster full migration and MonsterLife integration plan

Status: proposal for review only

Assessment date: 2026-08-24 (Asia/Bangkok)

## Target outcome

Move PocketMonster authentication, player data, saves, progression, economy,
realtime features, administration, and static game delivery to the MonsterLife
.NET server and MySQL. Perform the migration incrementally, with a tested
rollback at every phase.

At completion, Firebase retains only the existing Hosting URL as the public
entry point. That URL redirects to the HTTPS game origin on MonsterLife. The
client must no longer use Firebase Authentication, Firestore, Storage, or their
SDKs.

No production migration is authorized merely by merging this document.
Sensitive host addresses, credentials, firewall rules, and backup locations
belong in private operations documentation.

## Target architecture

```text
Player
  |
  | HTTPS: existing Firebase Hosting URL
  v
Firebase Hosting redirect / maintenance page only
  |
  | HTTPS
  v
MonsterLife game origin
  +-- versioned immutable PocketMonster release
  +-- runtime environment manifest
  |
  +-- HTTPS REST API
  +-- WSS realtime connection
          |
          v
MonsterLife .NET server
  +-- account, session, roles and bans
  +-- save, profile, character and progression
  +-- inventory, monsters, equipment and skills
  +-- wallet, shop, orders, mailbox and rewards
  +-- quests, events, chat and moderation
  +-- GM/Admin API, audit, backup and monitoring
          |
          v
MySQL (private network/local host only)
```

The browser must never connect directly to MySQL. The server is authoritative
for identity, progression validation, currency, items, rewards, purchases and
administrative actions. Client calculations are presentation or prediction
only.

## Verified implementation starting points

The supplied MonsterLife system already exposes endpoints for account/session,
save/load, wallet, mall, mailbox, chat, remote events, auto quests and combat.
It supports bearer tokens, WebSocket authentication, request rate limits and
save revision checks through `X-Save-Revision`.

The game-side `server-sync.mjs` already contains account calls, authenticated
requests, save/load, timeout handling, queued saves and conflict signalling.
The current deployment manifest targets `http://localhost:5000`; this must
become environment-specific before staging or production.

These are starting points, not proof of production readiness. Every contract,
authorization rule and transaction path must be verified.

## Ownership rules

- MonsterLife is the only production system of record after cutover.
- MySQL stores durable application data; files may store immutable releases,
  encrypted backups and operational logs.
- Firebase data services remain readable only as required during migration and
  are disabled after final reconciliation.
- The game never sends commands such as "add 100 currency". It submits a
  verifiable action; the server calculates and commits the result.
- GM tools use authenticated Admin APIs, not direct database writes.
- Every migration is repeatable, versioned, logged and safe to rerun.

## API and compatibility contract

Before moving data, define a versioned contract for:

- `GET /api/health` and `GET /api/version`
- `/api/account/register|login|logout|me|change-password`
- `GET|POST /api/save`
- profile, character, monsters, inventory, equipment and progression
- wallet, products, orders, payments, mailbox and reward claims
- quests, events, chat, block/report and realtime authentication
- private GM/Admin operations

Use one normalized error envelope with machine-readable code, safe message,
correlation ID and retryability. Define request limits, timeouts, idempotency,
pagination and minimum client version.

The runtime manifest must provide environment, API base URL, WebSocket URL,
minimum client version, API version and save-schema version. It must never
contain database passwords, signing keys or administrator credentials.

## Identity migration

Firebase password hashes cannot be treated as ordinary application passwords.
Migrate accounts with a controlled account-link process:

1. Export non-secret Firebase identity metadata and map each Firebase UID to a
   new immutable MonsterLife user ID.
2. During a limited transition window, accept a valid Firebase ID token once.
3. Create or link the MonsterLife account and require the user to establish a
   MonsterLife credential or approved password-reset flow.
4. Issue a MonsterLife session and mark the Firebase UID as migrated.
5. Reject reuse of a migration token and audit all link attempts.
6. Provide a reviewed recovery path for users who cannot complete linking.
7. End token exchange after the migration window and revoke the bridge.

MonsterLife sessions must be expiring and revocable. Passwords must use Argon2id
or an approved adaptive password hash. Apply rate limits, generic login errors,
ban checks and role separation for Player, Moderator, GM and Administrator.

## Save and player-data migration

### Transitional save envelope

Initially preserve compatibility by storing the existing game save as a
versioned JSON envelope:

- immutable MonsterLife user ID
- save revision
- save-schema version
- game/client version
- server timestamp
- validated payload
- integrity metadata
- previous revision or recoverable snapshot

On load, the client receives the current revision. On save it sends that
revision in `X-Save-Revision`. The server commits only when revisions match,
increments the revision atomically, and returns `409 Conflict` otherwise.

Autosave must occur after important progression, purchases, rewards, map
changes and logout, plus a bounded interval. A local offline queue may retain
pending non-economic save data, but the client must not invent or replay
currency/item grants.

### Normalized model

After JSON compatibility is stable, migrate bounded domains one at a time into
normalized tables:

1. player profile and character appearance
2. monster collection and breeding
3. inventory, equipment and skills
4. stage and map progression
5. quests, achievements and daily state

Keep versioned snapshots for recovery while normalized tables become
authoritative. Each domain requires an explicit schema migration, validation,
backfill, comparison report and rollback procedure.

## Economy and transactional integrity

Wallet, VIP, shop, orders, payment, refund, mailbox, reward code and GM grants
must be server-authoritative and executed inside database transactions.

Every value-changing operation requires:

- authenticated actor and authorization check
- unique idempotency key
- validated source/reason
- before/after balances or quantities
- atomic ledger and inventory/mailbox updates
- correlation ID and immutable audit record
- safe retry response
- rollback of the whole operation on failure

Recommended core tables include `wallets`, `wallet_transactions`,
`shop_products`, `orders`, `order_items`, `payments`, `mailbox`,
`reward_claims` and `vip_history`.

## Realtime, chat and events

Use HTTPS REST for durable queries and WSS for live chat/event delivery.
Authenticate the socket with a MonsterLife session, enforce expiry during the
connection, cap connections per user/IP, and reconnect with exponential
backoff. Provide bounded polling only as fallback.

Retain spam limits, message size limits, filtering, block/report and moderation
audit. Chat may remain memory-bounded if desired, but reports and moderation
actions must be durable.

## Environment and release design

Maintain separate development, staging and production configuration.

| Environment | Game origin | API | Realtime |
|---|---|---|---|
| Development | local | HTTP localhost | WS localhost |
| Staging | staging HTTPS | staging HTTPS | staging WSS |
| Production | Firebase URL redirect to MonsterLife | production HTTPS | production WSS |

Do not serve a mutable Git checkout. Produce an allowlisted, checksum-recorded
artifact from an approved commit/tag, copy it into a versioned immutable release
directory, smoke-test it, and switch the active release reversibly. Preserve at
least one known-good release.

## Delivery phases and gates

### Phase 0: inventory, backup and controls

- Inventory all Firebase collections, Auth identities, Storage objects, browser
  local data, MySQL tables, file stores, endpoints and GM write paths.
- Snapshot Firebase exports, MySQL, server configuration and the current game.
- Prove restore in a non-production environment.
- Establish source control for game and server, migration numbering, secret
  handling, audit retention and data ownership.
- Reconcile client/server/save version markers.

**Gate:** complete inventory; tested restore; staging isolated; owners named.

### Phase 1: connectivity and compatibility

- Stabilize health/version endpoints and the common error contract.
- Replace hard-coded localhost with the runtime manifest.
- Add timeout, retry, online/offline and incompatible-version UX.
- Configure staging HTTPS/WSS, strict CORS and request-size limits.
- Add correlation IDs and structured logs.

**Gate:** clean staging client can detect server health/version and fail safely.

### Phase 2: MonsterLife account and session

- Harden register/login/logout/me/change-password.
- Implement expiry, revocation, password hashing, rate limiting, ban and roles.
- Build and test the one-time Firebase account-link bridge.
- Make GM authentication independent from player authentication.

**Gate:** new and migrated users authenticate without cross-account access.

### Phase 3: cloud save cutover

- Import Firebase saves into versioned MonsterLife envelopes.
- Connect load, autosave, revision conflict and recovery behavior.
- Test two devices, stale clients, network interruption and server restart.
- Reconcile imported counts, schema versions and payload checksums.
- Switch save writes to MonsterLife; temporarily retain Firebase read-only.

**Gate:** no silent overwrite; restore and reconciliation pass.

### Phase 4: profile, collection and progression

Move one domain per release: profile/character, monsters/breeding,
inventory/equipment/skills, stages/maps, quests/achievements. For each domain:

1. deploy schema and migration
2. backfill production snapshot
3. expose read API and compare results
4. enable server write behind a feature flag
5. observe and reconcile
6. disable the legacy write
7. retain a tested rollback

**Gate:** per-domain counts and invariants match with no unresolved quarantine.

### Phase 5: economy and mailbox

- Migrate wallet/VIP balances and product catalog.
- Enable transaction ledger, orders, payments/refunds and mailbox claims.
- Make rewards and purchases server-calculated.
- Test duplicate requests, insufficient balance, partial failure and replay.
- Route GM grants through audited Admin APIs.

**Gate:** all balance/item invariants and retry tests pass.

### Phase 6: realtime and operations

- Move chat, event delivery, block/report and bot/event management.
- Load-test REST/WebSocket concurrency and reconnection.
- Add dashboards/alerts for health, errors, database saturation, failed jobs,
  authentication anomalies, disk, backup and certificate renewal.

**Gate:** agreed load and failure tests pass with actionable monitoring.

### Phase 7: MonsterLife static hosting

- Build a clean immutable game artifact.
- Exclude tests, plans, repository metadata, credentials, backups and tools.
- Configure MIME, cache, CSP and other security headers.
- Test desktop/mobile boot, asset loading and stale-cache upgrade.
- Deploy to staging, then switch the production MonsterLife origin.

**Gate:** production-origin smoke tests and release rollback pass.

### Phase 8: Firebase URL cutover

- Configure Firebase Hosting as a redirect to the approved HTTPS MonsterLife
  origin; optionally retain a minimal maintenance page only.
- Preserve safe path/query behavior where required.
- Validate desktop/mobile entry, TLS and monitoring.
- Do not duplicate the full game artifact on Firebase if the requirement is
  "URL only".

**Gate:** the existing Firebase URL reliably reaches the MonsterLife-hosted game.

### Phase 9: Firebase data-service shutdown

1. Freeze Firebase writes.
2. Export final Auth/Firestore/Storage data.
3. Run repeatable final imports.
4. Reconcile accounts, saves, progress, balances, items, VIP and unclaimed mail.
5. Hold Firebase data read-only for the approved observation window.
6. Remove Firebase Auth/Firestore/Storage SDK and configuration from the client.
7. Disable unused Firebase services and revoke migration credentials.
8. Retain only Hosting URL redirect/maintenance configuration.

**Gate:** no client or server request reaches Firebase data services; final
reconciliation and recovery sign-off are complete.

## Data migration procedure

Every dataset follows:

```text
Export -> stage -> transform -> validate -> import -> compare -> approve -> cut over
```

Use immutable source IDs plus a mapping table. Record source count, imported
count, rejected count, checksums and reconciliation time. Invalid records go to
a quarantine table with a reason; never silently discard them. Scripts must be
idempotent and rerunnable.

At minimum reconcile accounts, characters, monsters, inventory, level/EXP,
quests, stage progression, balances, VIP, orders and unclaimed mailbox items.

## Security baseline before Internet exposure

- HTTPS/WSS only in production; automated monitored certificate renewal.
- Keep MySQL private/local and never expose it directly to clients.
- Restrict RDP/administration to trusted IP or VPN.
- Patch Windows and exposed web/runtime components.
- Remove XAMPP samples and public administrative endpoints.
- Store secrets outside public files and logs; rotate migration credentials.
- Strict production-origin CORS; rate and request-size limits per endpoint class.
- Validate every input and enforce authorization at the service/data boundary.
- Immutable GM and economy audit logs.
- Encrypted backups with restore drills, disk thresholds and log rotation.

## Required failure and acceptance tests

- correct/incorrect login, expired/revoked token and password change
- account-link replay and attempted cross-account link
- owner isolation for every player resource
- save/load, two-device conflict, offline queue and server restart
- old/new save schema and minimum client version
- duplicate purchase/claim/payment callback and insufficient balance
- transaction failure after each intermediate step
- chat spam, oversized message, reconnect and expired socket session
- unauthorized GM calls and complete GM audit
- repeatable imports, quarantined records and final reconciliation
- Firebase URL redirect on desktop/mobile
- application release rollback and database/data recovery

## Rollback model

Application rollback switches to the previous immutable artifact without
fetching or rebuilding during an incident. Database changes must use
forward-compatible expand/migrate/contract steps; do not drop legacy columns or
Firebase fallback until the observation gate closes.

Before each domain cutover, record the exact release, schema version, migration
run and restoration point. Economy writes must not be dual-written without an
explicit transaction/reconciliation design.

## Definition of done

The migration is complete only when:

- the existing Firebase URL remains a working public entry point
- Firebase Hosting performs only redirect/maintenance entry behavior
- MonsterLife serves the actual game release over HTTPS
- MonsterLife owns accounts, sessions, saves and all game data
- MySQL contains the reconciled durable data
- all economy/reward actions are server-authoritative and audited
- GM tools use authenticated Admin APIs rather than direct database writes
- the client contains no active Firebase Auth, Firestore or Storage integration
- no production data read/write reaches Firebase data services
- final reconciliation, security, load, backup/restore and rollback gates pass
- operating owners accept monitoring, recovery and incident procedures
