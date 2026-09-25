# Blue Explorer first-frame / boot problem — problem statement and solution paths

## Status / Golden Baseline

Current production baseline is `main` at commit `694ab320f6a1cfcdffc5f565c24031374771213e` (merge PR #580).

This commit intentionally restores the exact repository tree of the last user-confirmed working Blue Explorer pre-ground snapshot from PR #574 / tree `fb844114ac4cd2ef0862c113274f9e25d00cde46`.

The baseline is considered **Golden / do not disturb** until a replacement path passes real-device acceptance.

Golden properties:

- Blue Explorer is the intended primary player presentation.
- This is the game version from before the later ground-work series.
- The game boots successfully again after rolling back loader / first-paint / cache experiments from PRs #575–#579.
- Firebase → Pages → online shell → scene → Pirate Fruit flow is kept exactly as in the known-good snapshot.
- The known remaining UX defect is that an older/fallback game/player presentation can appear briefly before the intended Blue Explorer presentation becomes active.

## User-visible problem

The player can enter the correct game version, but during startup there can be a short visible flash of the old/fallback presentation before Blue Explorer becomes active.

The important distinction is:

- **Boot works** in the Golden Baseline.
- **Visual continuity is imperfect** during the first frames.
- Attempts to hide or gate the entire game until Blue Explorer was ready removed the flash but introduced a worse failure: the game could remain stuck indefinitely on the loading screen.

Therefore this is a **presentation handoff problem**, not a reason to redesign the boot/session architecture.

## Architecture involved

The relevant runtime chain is approximately:

`Firebase launcher`
→ `GitHub Pages entry`
→ `online-world-shell-v900.mjs`
→ `scene-v900.html / scene-entry-v900.mjs`
→ `boot-pirate-fruit-v900.mjs`
→ sandboxed `pirate-fruit-offline/index.html`
→ Pirate renderer / fallback player presentation
→ Character Studio bridge
→ Blue Explorer package validation
→ Blue Explorer presentation replaces fallback.

Blue Explorer is currently obtained through the Character Studio bridge. This creates a presentation dependency that can complete later than the Pirate world itself.

The world can therefore be ready before Blue Explorer is ready.

## Confirmed lessons from PRs #575–#579

### What did not work

1. **Using the whole Pirate iframe as the anti-flash gate**
   - Hiding the complete iframe until `PIRATE_STUDIO_CHARACTER_ACCEPTED` tied world visibility to an external/asynchronous character presentation dependency.
   - If Studio delivery was slow or failed to resolve, the whole game looked frozen.

2. **Using Blue acceptance as a boot-readiness condition**
   - `Blue ready` is a presentation condition.
   - `Game ready` is a runtime/world condition.
   - Treating them as the same condition created a deadlock-like UX where the loader remained visible despite the underlying world being available.

3. **Stacking first-paint/cache patches across multiple layers**
   - Changes were added to Firebase, Pages, scene, Pirate iframe visibility, release binding and cache busting at the same time.
   - This made it difficult to isolate failures and increased the blast radius of a presentation-only problem.

4. **Relying on CI runner success as proof of Android success**
   - GitHub Actions verified backend, Pages and browser flows from runner infrastructure.
   - A real Android browser/WebView has different network, caching, timing and rendering behavior.
   - CI success is necessary but not sufficient for this issue.

### What must remain true

- Never block game/world boot on Blue Explorer delivery.
- Never use a remote/external presentation dependency as the only path that removes the main loading screen.
- Never reintroduce the old/fallback character as a permanent success path.
- Keep gameplay authority and save/session ownership unchanged.
- Keep the current Golden Baseline easy to restore in one revert.

## Root problem model

The actual problem should be modeled as two independent readiness tracks.

### Track A — Game / world readiness

Responsible for:

- authenticated launch/session
- Pages shell
- scene runtime
- Pirate Fruit iframe/runtime
- input
- gameplay/network state

When Track A is ready, the world must become usable.

### Track B — Player presentation readiness

Responsible for:

- obtaining Blue Explorer package
- package validation
- rig/pivot/socket validation
- material/render preparation
- spawning Blue visual
- replacing the temporary/hidden player presentation

Track B may finish before or after Track A, but must **never block Track A**.

## Solution paths

### Path A — Instrument first, change nothing visible

**Risk:** Very low  
**Distance:** Short  
**Recommended first step:** Yes

Add diagnostics only. Do not change rendering behavior.

Capture monotonic timestamps/events for:

- Firebase launcher authenticated
- launch ticket issued
- Pages loaded
- shell mounted
- scene registered
- Pirate iframe created
- Pirate iframe `load`
- Pirate renderer hook installed
- fallback/local player visual first created
- Studio bridge request started
- Studio package received
- package validated
- Blue Explorer spawned
- Blue attached to live host
- fallback detached/hidden
- first visible Blue frame

Record these to an in-memory diagnostics object and optionally `console.debug` behind a debug flag.

Target result: determine precisely whether the visible flash is:

1. the old top-level game DOM,
2. the vendored Pirate player,
3. the Pocket fallback player,
4. or another intermediate visual.

This path should be merged first because it does not alter boot behavior.

---

### Path B — Bundle the approved Blue Explorer package into PocketMonster production

**Risk:** Low–Medium  
**Distance:** Medium  
**Recommended long-term solution:** Yes

Change production from runtime cross-site acquisition:

`PocketMonster runtime → Character Studio live page → postMessage → Blue package`

to release-time acquisition:

`Character Studio build/export → validated Blue package → PocketMonster release asset`

Production then loads:

`PocketMonster release → local Blue package → validate → spawn`

Character Studio remains the authoring/source-of-truth tool, but the player does not depend on the Studio website during normal startup.

Advantages:

- deterministic release
- same-origin asset loading
- no 30-second Studio bridge dependency on every game launch
- simpler cache ownership
- reproducible Blue package SHA per release
- easier Android acceptance
- dramatically smaller timing window where fallback can appear

Required controls:

- package schema validation at build time and runtime
- Blue primary ID validation
- rig / pivot / hand socket tests
- SHA recorded in release manifest
- exported package generated by CI from the Character Studio revision that was approved

This is the preferred architectural endpoint.

---

### Path C — Keep live Studio bridge, but make player presentation non-blocking

**Risk:** Medium  
**Distance:** Short–Medium  
**Recommended:** Only as an interim solution

Keep the current Studio bridge but enforce these rules:

- world becomes visible based only on world/runtime readiness
- Blue loads asynchronously
- only the local player visual participates in handoff
- no global loader waits for Blue
- Studio failure cannot hide the world

The challenge is preventing the old/fallback player from flashing while Blue is pending.

Safer implementation options:

- player-local placeholder that has no old character silhouette
- player host exists but its body meshes are not visible until presentation selection resolves
- spawn a tiny neutral/loading marker at the authoritative player position

Do **not** hide the whole scene or iframe.

This path still retains network/timing dependency on Character Studio, so it is less robust than Path B.

---

### Path D — Make Blue the primary local provider instead of upgrading from fallback

**Risk:** Medium  
**Distance:** Medium  
**Recommended:** Potentially, especially together with Path B

Today the presentation flow conceptually behaves like:

`spawn fallback → later upgrade to Studio/Blue`

Change it to:

`resolve player presentation descriptor → spawn Blue directly`

If the local Blue package is already part of the release, the player provider can instantiate Blue as the first presentation object.

Advantages:

- removes swap race entirely
- no old local character needs to exist visually
- cleaner lifecycle and less dispose/replace logic

Constraints:

- gameplay root must remain stable
- sockets/equipment/Fighting Style ownership must remain correct
- movement/combat authority stays in the existing domain
- Blue remains presentation-only

This is probably the cleanest runtime design once Path B provides a local package.

---

### Path E — Preload Blue earlier without changing ownership

**Risk:** Low–Medium  
**Distance:** Short  
**Recommended:** Optimization after correctness

Start loading the approved local Blue package during shell/scene prewarm, before the Pirate player needs to render.

This reduces first-frame latency, but it must not become another boot gate.

Rules:

- preload failure is recorded but does not block scene startup
- actual attach remains owned by player presentation code
- no hidden global page waiting for preload

This is useful after Path B/D, not a substitute for them.

---

### Path F — Cache-only fixes

**Risk:** Low  
**Distance:** Short  
**Recommended as primary fix:** No

Release-bound URLs/cache busting can prevent stale modules, but cache alone does not solve the fundamental fallback→Blue handoff race.

Use release binding only to guarantee that the selected solution is actually shipped to clients.

Do not treat cache busting as the root fix.

## Recommended implementation sequence

### Phase 0 — Freeze baseline

- Tag/document `694ab320f6a1cfcdffc5f565c24031374771213e` as the Golden working baseline.
- No loader/boot modifications while diagnosing the visual flash.

### Phase 1 — Diagnostics PR

- Implement Path A only.
- No visible behavior changes.
- Capture real Android timeline/evidence.

### Phase 2 — Release-local Blue package

- Implement Path B.
- Character Studio CI exports the approved Blue package.
- PocketMonster consumes a pinned package with explicit SHA/version metadata.

### Phase 3 — Direct Blue-first player provider

- Implement Path D.
- Spawn Blue directly instead of rendering old player then replacing it.
- Preserve stable gameplay root, sockets and authoritative controller state.

### Phase 4 — Optional preload

- Implement Path E to reduce Blue first-visible latency.

### Phase 5 — Remove obsolete fallback/version paths

Only after real-device acceptance succeeds:

- remove unused legacy player presentation paths from production closure
- remove obsolete bridge code if live Studio is no longer required at runtime
- keep history in Git; do not keep parallel deployable versions

## Acceptance criteria

A candidate fix is not accepted until all of the following are true.

### Boot

- Firebase login/launch continues to work.
- Game does not remain indefinitely on any loading screen.
- World can become usable independently of Blue package timing.

### Visual first-frame

Test on target Android device/network and capture video or frame samples:

- initial frame
- ~100 ms
- ~300 ms
- ~1 s
- first Blue-visible frame

At no point may the old player presentation be visible.

### Blue

- primary ID is `blue-explorer-primary-v1`
- rig/pivot contract passes
- Fighting Style hand/socket bindings pass
- movement/idle/run/jump/attack presentation works
- Blue remains presentation-only and does not acquire gameplay authority

### Failure behavior

Simulate Blue package unavailable/corrupt/slow:

- world still boots
- no permanent spinner
- old player is not shown as a silent fallback
- diagnostics clearly report presentation failure

### Release integrity

- Pages/Firebase point to the same release
- release manifest records Blue package revision/hash if Path B is adopted
- Android reload receives the intended release without manual cache clearing

## Decision recommendation

**Recommended architecture:** Path A → Path B → Path D → optional Path E.

In short:

> Keep the working boot flow exactly as it is, stop loading Blue from Character Studio during every player launch, ship the approved Blue package with the game release, and make Blue the first local player presentation rather than an async replacement for an old visible fallback.

This solves the root problem without turning character presentation into a dependency for world boot.
