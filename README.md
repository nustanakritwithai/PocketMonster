# Monster Life RPG / PocketMonster

PocketMonster is currently in a **version-consolidation transition**.

## Current production identity

- Public/live shell release: **9.0.1** (UI label: V9.0)
- Active page: `index.html`
- Current authenticated shell entry: `entry-preload-v900.mjs` *(known migration debt)*
- Pocket Monster gameplay runtime: `game-v800.js` / compatibility identity **8.4.0** *(known migration debt)*
- Save schema: **15**
- Asset compatibility revision: **814**

The V9 shell currently hosts the older Pocket Monster gameplay runtime. This is intentional only as a migration state; it is not the target architecture.

See `version-manifest.mjs` for the canonical release/compatibility metadata and `docs/version-consolidation.md` for the retirement policy.

## Important version rule

Do **not** solve new bugs by creating another generation wrapper such as `game-v920.js`, `world-v930.mjs`, or a new versioned copy of an existing runtime.

New canonical code should be named by responsibility, for example:

```text
runtime/pocket-monster-runtime.mjs
runtime/world-runtime-manager.mjs
combat/protocol.mjs
hud/runtime.mjs
```

Version numbers belong in metadata/contracts. Save, database, and protocol schema versions may remain versioned when compatibility requires them.

## Current world composition

```text
V9 online shell
  ├─ Pocket Monster -> legacy game-v800.js runtime
  ├─ Pirate Fruit   -> Pirate Fruit embedded build + V9 integration bridges
  └─ Living World   -> V9 world presentation runtime
```

The consolidation work removes these generation-labelled dependencies incrementally without changing gameplay behavior.

## Development safety

Before retiring an old runtime path, verify:

1. no production/static caller remains;
2. no dynamic import caller remains;
3. deployment/patch manifests no longer require the asset;
4. browser/gameplay regression passes;
5. save migration passes;
6. realtime/multiplayer regression passes.

Legacy save keys and save migrations are compatibility mechanisms and must not be deleted merely because they contain old version numbers.

## Test commands

```bash
npm test
npm run check
npm run ci
npm run sim
```

The existing regression suite intentionally contains historical test names (`v80-*`, `v81-*`, `v90-*`, etc.). Test filenames are historical evidence and are not production runtime ownership boundaries.
