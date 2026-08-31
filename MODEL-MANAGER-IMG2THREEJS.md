# PocketMonster — img2threejs Model Manager

## Goal

เพิ่มเครื่องมือบริหารโมเดล 3D แบบ `img2threejs` เข้า PocketMonster โดยต่อกับ `asset-presentation` เดิม แทนการสร้าง asset runtime ชุดใหม่ซ้ำอีกก้อน

เครื่องมือนี้เน้น **presentation/runtime only**: preview, rig, animation, socket, VFX, performance stats และการสร้าง asset profile สำหรับเกม ห้ามใช้ layer นี้เป็นแหล่งข้อมูล HP/ATK/DEF/collider/capture/save/gameplay authority

## Reference studied

Reference page: `https://img2threejs.io/#/x/leesin`

Public showcase source indicates a useful runtime pattern:

- model factory returns a `THREE.Group`
- expensive payload can be prepared separately with a `prewarm...()` function
- runtime is exposed via `root.userData.sculptRuntime`
- animation controller exposes `actions`, `active`, `time`, `play`, `seek`, `stop`, `advance`
- runtime can expose named `sockets` and `actionAnchors`
- VFX can expose selectable elements through a runtime object
- root may expose `userData.tick(delta)` so animation and VFX advance in one clock

The Lee Sin showcase is used only as an architecture/runtime reference. This change does **not** copy its large model payload, mesh arrays, texture data, or character art into PocketMonster. Verify rights/licenses for every external model you import.

## Added modules

### `asset-presentation/img2threejs-registry.mjs`

Registry for code-native Three.js model modules.

Main API:

```js
registerImg2ThreeJsModel(id, descriptor)
registerImg2ThreeJsModule(id, module, options)
loadImg2ThreeJsModule(id, moduleUrl, options)
prewarmImg2ThreeJsModel(id)
getImg2ThreeJsModel(id)
listImg2ThreeJsModels()
resetImg2ThreeJsRegistry()
```

`prewarmImg2ThreeJsModel()` deduplicates concurrent prewarm calls. A model with an async prewarm must reach `ready` before `AssetEngine.spawn()` because the current PocketMonster `spawn()` contract is synchronous.

### `asset-presentation/providers/img2threejs.mjs`

Adapter from an img2threejs-compatible runtime into PocketMonster `AssetHandle`:

- `play()` — maps Pocket semantic actions to source clips
- `update()` — prefers `root.userData.tick(delta)`, falls back to controller `advance(delta)`
- `anchor()` — resolves sockets such as weapon grips/head attachment
- `bounds()` — calculates world model bounds
- `setAppearance()` — currently supports VFX element and wireframe presentation controls
- `dispose()` — disposes instance geometry/material/texture resources and optional strike VFX

Default semantic mapping is intentionally small and overridable:

```json
{
  "idle": "idle-gesture",
  "walk": "walk-forward",
  "run": "run-forward",
  "jump": "jump-in-place",
  "dash": "dash-forward",
  "attack": "strike-short",
  "attack-melee": "strike-short",
  "skill": "strike-wide"
}
```

Never assume another generated model uses these clip names. Save a per-model mapping in the manager.

## Model Manager UI

Open:

`tools/model-manager/index.html`

Capabilities:

1. Register an ES module that contains a permitted img2threejs-style model.
2. Detect or explicitly choose the build export and prewarm export.
3. Prewarm before preview.
4. Preview with orbit camera, lights and grid.
5. Inspect mesh/skinned-mesh/bone/vertex/triangle/clip counts.
6. Show mobile-performance warnings.
7. Play source animation actions.
8. Map source clips to Pocket actions.
9. Inspect runtime route, sockets, anchors, actions and VFX elements.
10. Switch runtime VFX elements when supported.
11. Toggle wireframe.
12. Save/restore a profile in `localStorage`.
13. Export a JSON profile containing a Pocket-compatible character asset definition.

## Integration in game runtime

Register the provider once:

```js
import {
  createImg2ThreeJsProvider,
  loadImg2ThreeJsModule,
  prewarmImg2ThreeJsModel,
} from './asset-presentation/index.mjs';

assets.registerProvider('img2threejs', createImg2ThreeJsProvider({ THREE }));

await loadImg2ThreeJsModule(
  'character.hero.v1',
  new URL('./models/hero/index.mjs', import.meta.url).href,
  {
    buildExport: 'createHeroModel',
    prewarmExport: 'prewarmHero',
    animationMap: {
      idle: 'idle-gesture',
      walk: 'walk-forward',
      attack: 'strike-short',
    },
  },
);
await prewarmImg2ThreeJsModel('character.hero.v1');
```

Then load a catalog entry whose provider is `img2threejs` and spawn it through the existing Asset Engine.

Example character definition:

```json
{
  "id": "character.hero.v1",
  "kind": "character",
  "provider": "img2threejs",
  "modelId": "character.hero.v1",
  "style": "img2threejs-runtime-v1",
  "surfaceStyle": "source-authored",
  "rig": "sculptRuntime",
  "metrics": { "height": 1.8 },
  "roles": { "player": true },
  "animationMap": {
    "idle": "idle-gesture",
    "walk": "walk-forward",
    "attack": "strike-short"
  }
}
```

## Current scope: character first

The existing monster catalog has stricter `blocky-bighead-v1` / `four-side-block-v1` validation and monster ID conventions. This PR deliberately does not weaken those gameplay/presentation contracts. img2threejs character/player/NPC models can use the new provider immediately; external monster schema should be introduced in a separate migration with its own tests and fallback rules.

## Mobile rules

- prewarm only the model needed for the next scene/role
- do not preload every code-native model at boot
- keep procedural provider available as fallback
- test triangle count, mesh count and bone count on real Android hardware
- do not automatically copy massive code-native payloads into the main bundle
- keep model modules split so dynamic import/lazy load remains possible

## Test

```bash
node tests/img2threejs-model-manager.mjs
```
