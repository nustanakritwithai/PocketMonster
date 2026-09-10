# Version Consolidation

This document is the canonical migration policy for removing release-generation layering from PocketMonster.

## Current production reality

The product presented to players is the V9 online shell, but the active dependency graph still contains older generation-labelled runtime assets:

```text
index.html / v900.html
  -> entry-preload-v900.mjs
  -> online-world-shell-v900.mjs
  -> scene-v900.html
  -> scene-entry-v900.mjs
  -> worlds-v900.mjs
       -> Pocket Monster: game-v800.js
       -> Pirate Fruit: boot-pirate-fruit-v900.mjs
            -> world-presence-v800.mjs
            -> game-v800.js (animal-control compatibility path)
       -> Living World: world-living-v900.mjs

Styles:
  style-v800.css
  + style-v900.css
  + combat-v91.css
```

This is transitional architecture. It must not be copied forward by creating another V9.x/V10 wrapper layer.

## Version domains

`version-manifest.mjs` is the canonical owner for release/runtime compatibility metadata.

- `PRODUCT_RELEASE_VERSION`: public product/shell release identity.
- `GAME_API_COMPAT_VERSION`: version sent to the existing MonsterLife server contract while the V8 gameplay runtime remains active.
- `LEGACY_ASSET_REVISION`: current cache/asset compatibility revision.
- `SAVE_SCHEMA_VERSION`: remains owned by `save-schema.mjs`; it is a data format version, not an app release.
- Protocol/message versions remain contract-specific and may advance independently.

Do not interpret these version domains as one sequence.

## Classification

Every generation-labelled production file must be classified as one of:

- **ACTIVE** — directly reachable from the production entry.
- **CORE** — behavior that must survive consolidation.
- **COMPATIBILITY** — temporary adapter required while callers migrate.
- **MIGRATION** — save/database/protocol migration that is intentionally retained.
- **DEAD** — no production caller; remove after reference and deployment checks.

## P0 rules

1. Do not create a new production runtime file whose name adds another release generation (`*-v920`, `*-v930`, `*-v1000`, etc.) to solve a feature bug.
2. New canonical modules are named for responsibility, not release generation.
3. Old runtime files are not deleted until caller scans and behavior regression checks prove zero required consumers.
4. Save/database/protocol migrations are not deleted merely because their identifiers contain old version numbers.
5. Server compatibility identity is not changed from 8.4.0 merely to make the UI release number look consistent; server/client rollout must be coordinated first.
6. Tests should migrate from asserting generation-specific filenames toward behavior and contract assertions.

## Retirement order

### P0 — version identity

- Centralize release/compatibility constants.
- Remove duplicated hard-coded `8.4.0` server-header literals.
- Document all known version debt.
- Add regression checks so new hard-coded version identities are not introduced.

### P1 — entry and style ownership

Target:

```text
index.html -> entry.mjs
styles/base.css
styles/shell.css
styles/combat.css
```

Retire the requirement that `index.html` must be byte-identical to a versioned HTML source.

### P2 — Pocket runtime extraction

Extract behavior from `game-v800.js` incrementally into responsibility-named modules. Keep a thin compatibility facade only while old tests/callers still require it.

Target:

```text
runtime/pocket-monster-runtime.mjs
```

### P3 — world runtime ownership

Rename/migrate the world registry and runtime manager away from V900 filenames after callers are moved.

Target:

```text
runtime/world-registry.mjs
runtime/world-runtime-manager.mjs
```

### P4 — compatibility retirement

Remove version-labelled facades only after:

- zero production callers;
- zero dynamic import callers;
- deployment manifest no longer contains them as required assets;
- browser acceptance passes;
- save migration passes;
- multiplayer/realtime regression passes.

## Known debt baseline

The initial known debt is exported as `VERSION_DEBT` from `version-manifest.mjs`. This is a migration baseline, not a permanent public API.

The most important current debt is that the V9 shell intentionally routes Pocket Monster to `game-v800.js`. Do not hide this relationship behind another wrapper; migrate the implementation itself.
