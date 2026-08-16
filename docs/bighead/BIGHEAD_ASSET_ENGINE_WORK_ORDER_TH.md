# Bighead × Asset Engine — Authoritative Work Order

เอกสารนี้เป็นคำสั่งงานด้านสถาปัตยกรรมสำหรับนำ `blocky-bighead-v1` และ `four-side-block-v1` เข้าเกมผ่าน Asset Presentation Engine

หากขัดกับวิธี implement ใน `BIGHEAD_PRODUCTION_BLUEPRINT_TH.md` หรือ `HANDOFF_OMP_TH.md` ให้เอกสารนี้มีอำนาจเหนือกว่า ส่วน art direction, proportion evidence และ Four-Side texture lock เดิมยังคงใช้

## 1. สถานะและคำสั่งหลัก

- Bighead ต้องเป็น **consumer ของ Asset Engine** ห้ามสร้างเป็นเส้นทางพิเศษที่ผูกตรงกับ gameplay
- ห้ามแก้ `buildHumanoid()` แบบ direct replacement ก่อน Asset Engine foundation ผ่าน acceptance
- ห้ามย้าย gameplay state, combat/capture logic, movement, collider หรือ save schema เข้า Asset Engine
- Phase แรกครอบคลุม Player และ Keeper เท่านั้น มอนสเตอร์/props/VFX ยังไม่ migrate
- ขณะนี้สถานะ `CLOSED — PLAN/READ ONLY`; ต้องมีคำสั่ง `OPEN AE0`, `OPEN AE1`, `OPEN FS1` หรือ `OPEN BH*` พร้อม exact paths แยกกัน
- UX1 ต้องได้รับ acceptance และมี frozen post-UX1 snapshot ก่อนเริ่ม source phase แรก

## 2. Architecture Boundary

```text
Gameplay / World State
        │ AssetRequest + visual action
        ▼
Game-to-Asset Adapter
        ▼
Asset Presentation Engine
 ├─ Catalog / schema / variants
 ├─ Provider registry (procedural ก่อน, GLTF ภายหลัง)
 ├─ Resource ownership + cache + pool
 ├─ Rig / animator
 ├─ Bounds / anchors
 └─ Diagnostics
        ▼
AssetHandle { root, rig, anchors, bounds, play, update, dispose }
```

ข้อห้าม:

- Asset Engine ห้าม import gameplay resolver หรือเข้าถึง `state`, HP, damage, capture chance, party/storage หรือ save โดยตรง
- Gameplay ห้ามค้น child mesh ด้วยชื่อเพื่อควบคุม asset; ใช้ handle/anchor/action contract เท่านั้น
- Engine รับ `THREE`, quality profile, resource manager และ disposer ผ่าน dependency injection ห้ามโหลด Three.js ซ้ำ
- stable asset/appearance ID เป็น boundary; file path และ provider เป็นเรื่องภายใน catalog

## 3. Minimal Engine API

```js
await assets.preloadBundle('humanoid-core');

const playerVisual = assets.spawn('character.human.blocky-bighead.v1', {
  role: 'player',
  appearanceId: 'appearance.human.player-orange.v1',
  quality: qualityProfile.tier,
});

scene.add(playerVisual.root);
playerVisual.play('throw', { duration: 0.34 });
playerVisual.update(dt, { moving });
playerVisual.anchor('throwOrigin');
playerVisual.anchor('hitText');
playerVisual.anchor('label');
playerVisual.bounds();
playerVisual.dispose();
```

`AssetHandle` contract:

- `root` — Object3D ที่ gameplay วาง position/rotation ได้ แต่ engine ไม่เป็นเจ้าของ movement
- `rig` — read-only named pivots สำหรับ diagnostics/adapter ไม่ให้ gameplayแก้ child meshโดยตรง
- `play(action, options)` — visual action เท่านั้น; action duration ที่ gameplay ส่งมายังคง authoritative
- `update(dt, visualState)` — animation update โดยห้ามเปลี่ยน gameplay state
- `anchor(name, target?)` — คืน world position จาก rig/bounds โดย reuse target object ได้เพื่อลด allocation
- `bounds(target?)` — world-space bounds หลัง update matrix
- `setAppearance(id)` — เปลี่ยน compiled appearance ผ่าน cache;ไม่แก้ geometry/game state
- `dispose()` — idempotent;คืน pool/owned resource และไม่ dispose shared immutable resource

## 4. Catalog Contract

```json
{
  "id": "character.human.blocky-bighead.v1",
  "kind": "character",
  "provider": "procedural",
  "style": "blocky-bighead-v1",
  "surfaceStyle": "four-side-block-v1",
  "rig": "humanoid-rig-v1",
  "metrics": {
    "height": 1.8,
    "head": [0.64, 0.72, 0.56],
    "headY": 1.44
  },
  "roles": {
    "player": { "accessories": ["hair-a", "backpack-a"] },
    "keeper": { "accessories": ["hat-a", "apron-a", "staff-a"] }
  }
}
```

- Catalog เป็น serializable presentation data และผ่าน schema validation
- gameplay species/character dataส่งเพียง asset ID, role, appearance ID และ visual flags ที่อนุญาต
- ห้ามใส่ speed, collider, HP, skill, capture, interaction radius หรือ save payload ใน asset definition
- provider `procedural` และ `gltf` ต้องคืน AssetHandle contract เดียวกัน เพื่อสลับ asset จริงภายหลังได้

## 5. Coordinate-Space และ Rig Contract ที่แก้แล้ว

ทุกค่าหลักใน Bighead metrics เป็น **character-root local space** โครงสร้างเริ่มต้นที่ปลอดภัย:

```text
characterRoot                 gameplay transform
└─ visualRoot
   ├─ hipsPivot               root-local
   ├─ torsoPivot              root-local
   │  ├─ torsoMesh
   │  ├─ chestMesh
   │  ├─ backpackRoot
   │  └─ apronRoot
   ├─ headPivot               root-local y = 1.44
   │  ├─ headMesh
   │  ├─ faceSurface
   │  ├─ hairRoot
   │  └─ hatRoot
   ├─ leftArmRoot             root-local
   ├─ rightArmRoot            root-local
   │  └─ rightHandAnchor
   ├─ leftLegRoot             root-local
   ├─ rightLegRoot            root-local
   └─ staffRoot               hand-attached หรือ explicit root-local constraint
```

- ห้ามวาง `headPivot.position.y = 1.44` ใต้ torso ที่มี Y offset แล้วทำให้ double transform
- head/torso/arms/legs เป็น sibling pivots ใน phase แรก; nesting เพิ่มได้ภายหลังเมื่อ metrics ระบุ local offset ใหม่ครบ
- face/hair/hat ต้องเป็น descendant ของ headPivot
- backpack/apron ต้องตาม torso; capture ball ต้องตาม right-hand anchor; staff ต้องตาม hand หรือ constraint ที่ทดสอบได้
- `rig.rest` เก็บ transform เริ่มต้นครบ และ animator ต้อง reset rest → locomotion overlay → action overlay ทุก frame เพื่อกัน stale/cumulative transform
- animation test ใช้ deterministic phase/time; production random phase ห้ามกระทบ screenshot/evidence harness

## 6. Anchor Taxonomy ที่แก้แล้ว

### Gameplay/behavior locks

- gameplay root และ movement transform
- camera behavior/target `y + 1.10`, offset, pitch range และ FOV
- Keeper interaction radius `3.40`
- projectile target, duration `0.55`, ball consumption, summon/capture result และ resolver timing
- action duration ที่ caller ส่ง เช่น Throw `0.34`, Skill `0.28`, Hurt `0.24`

### Presentation anchors ที่ต้องมาจาก Asset Engine

- `throwOrigin` — world position จาก right-hand anchor; legacy `y + 1.15` เป็น fallback เฉพาะ asset เก่า
- `hitText` — จาก animated bounds/headTop + configurable clearance; legacy `y + 1.45` ไม่ใช่ค่าล็อกถาวร
- `label` — จาก animated visual bounds + screen/world clearance; legacy `y + 2.00` ไม่ใช่ค่าล็อกถาวร
- `headTop`, `feet`, `backpack`, `staffTip` — ใช้สำหรับ UI/VFX/diagnostics

การย้าย presentation origin ห้ามเปลี่ยน resolver, collision, damage, inventory หรือ gameplay duration จุดเริ่ม aim line และ projectile mesh ต้องใช้ `throwOrigin` เดียวกันเพื่อไม่ให้เส้นกับลูกบอลแยกจากมือ

## 7. Four-Side Surface Integration

- Geometry provider สร้าง cuboid 6 physical faces โดย mapping Front `-Z`, Right `+X`, Back `+Z`, Left `-X`, Top `+Y`, Bottom `-Y`
- Asset Engine รับ compiled atlas/appearance จาก `four-side-block-v1`
- head, torso และ block accessories ใช้ shared UV geometry เท่าที่ proportions/UV regionsตรงกัน
- ห้ามใช้ material แยก 4 ด้านเป็น default; static appearance material/atlas เป็น shared immutable
- `faceSurface` ใช้ atlas detail/decal เป็นหลัก ไม่สร้าง eyes/muzzle/blush geometry เว้น silhouette evidence บังคับ
- UV ใช้สูตร/region map ไม่ฝังค่า `z = -0.28`; surface offset คำนวณจาก `-(depth / 2 + epsilon)`

## 8. Resource Ownership

Asset Engine ต้องจัด resource เป็นสามชนิด:

1. `sharedImmutable` — geometry, static atlas, static material; instance cleanup ห้าม dispose
2. `instanceOwnedMutable` — AnimationMixer, mutable material/uniform/temporary canvas; handle dispose เป็นเจ้าของ
3. `pooledTransient` — VFX/temporary visual ที่ acquire/release ผ่าน bounded pool

- staff orb pulse/hurt flash ห้ามแก้ shared material property โดยตรง
- appearance ที่ key/hash เหมือนกันต้อง reuse texture/material identity
- `dispose()` เรียกซ้ำได้และไม่ dispose shared resource
- engine-level shutdown เท่านั้นที่ dispose shared cache ทั้งชุด

## 9. Required Delivery Sequence

### AE0 — Contracts and Testability

- catalog/schema, AssetRequest, AssetHandle, anchor names และ ownership contract
- pure Node tests โดยไม่ต้องโหลด DOM/Three CDN
- adapter design และ exact migration map จาก builder เดิม
- ไม่มี visual/source integration

### AE1 — Engine Core + Legacy Humanoid Adapter

- registry, preload, spawn, handle, diagnostics และ resource ownership
- wrap visual Player/Keeper เดิมให้ผ่าน AssetHandle โดยภาพ/behaviorยังเหมือน baseline
- game entry เรียก adapter/handle แทนค้น mesh โดยตรง
- ยังไม่เปลี่ยนเป็น Bighead และยังไม่มี Four-Side texture

### FS1 — Four-Side Geometry/UV Provider

- cuboid UV provider, orientation fixtures, fallback surfaces และ atlas cache
- tests Front/Right/Back/Left/Top/Bottom, mirroring, gutter และ material count
- ยังไม่เปลี่ยนตัวละครในเกม

### FS2 — Asset Lab Foundation

- deterministic preview/import/export สำหรับ `single`, `four`, `strip`
- fixed camera/light/pose, axis labels, bounds/anchor/renderer diagnostics
- content hash และ reproducible output

### BH0 — Proportion Decision in Asset Lab

- สร้าง A/B/C ด้วย engine เดียวกัน กล้อง/pose/scaleเดียวกัน
- B = 40% เป็น recommended/provisional จน Codex ส่ง `LOCK BIGHEAD PROPORTION B`
- เก็บ front/right/back/left/top/bottom และ grayscale evidence

### BH1 — Player Bighead Consumer

- spawn Player `blocky-bighead-v1` ผ่าน engine
- Four-Side fallback colorsก่อน actual art
- adapter คง gameplay/camera/resolver contracts และใช้ presentation anchorsใหม่
- freeze/review ก่อน Keeper

### BH2 — Keeper Bighead Consumer

- reuse character asset/rig;เปลี่ยน role/accessories/appearance เท่านั้น
- label clearance, hat/staff ownership และ interaction smoke

### BH3 — Actual Appearance Pack

- import/export atlasผ่าน Asset Lab
- Player/Keeper Front/Right/Back/Left + Top/Bottom fallback
- เปลี่ยน appearance โดยแก้ asset/catalog files ไม่แก้ gameplay source

### BH4 — Animation/Performance/Device Acceptance

- pose/clipping matrix, allocation, draw/mesh count, cleanup และ real-device gates
- canonical/Git/deploy/release ยังต้องมี verdict แยก

หนึ่ง phaseต่อหนึ่ง frozen delivery ห้ามรวม AE1+FS1+BH1 เป็น patch เดียว

## 10. Test and Mutation Contract

Automated minimum:

- schema reject gameplay fields และ duplicate IDs
- spawn คืน AssetHandle ครบและ dispose idempotent
- root-local rig positionsไม่ double transform
- face/hair/hat descendants ถูกต้อง; accessoriesติด anchor ถูกต้อง
- `throwOrigin` ตรง right hand และอยู่นอก animated head boundsใน release pose
- aim line/projectileใช้ anchorเดียวกัน แต่ target/duration/resolverไม่เปลี่ยน
- label/hitText มี clearance เหนือ animated bounds
- Four-Side UV orientation ไม่ mirror และใช้ static materialไม่เกิน contract
- shared/owned/pooled disposal identity ถูกต้อง
- animator คืน rest poseและไม่มี stale rotationหลัง Hurt → Throw
- deterministic previewให้ hash/screenshot stateเดิมเมื่อ inputเดิม

Required mutants:

1. bypass Asset Engine แล้วสร้าง humanoidตรงใน gameplay
2. nested head ใช้ absolute Y จน double transform
3. กลับไปใช้ hard-coded `y + 1.15` แทน right-hand anchor
4. aim line กับ projectileใช้คนละ origin
5. mutate shared materialสำหรับ staff pulse/hurt flash
6. ใช้ 4 materialsแทน atlas material
7. mirror Right/Left หรือกลับ Front เป็น `+Z`
8. instance dispose ทำลาย shared texture/geometry
9. animatorไม่ reset restก่อน action overlay

## 11. Measurement Protocol

- ใช้ frozen post-UX1 snapshot เป็น direct-parent baseline และ accepted Performance P0 เป็น cumulative baseline
- รัน scene/quality/viewport เดียวกัน warm-up เท่ากันอย่างน้อย 3 รอบและรายงานค่าทุกรอบ
- วัด `renderer.info.render.calls`, triangles, geometries, textures, programs และ WebGL allocation hooks
- บันทึก Player/Keeper mesh/material/texture inventory ก่อนตั้ง budgetสุดท้าย; source inspection ปัจจุบันประมาณ Player 36 meshes และ Keeper 35 meshes ต้องยืนยัน runtime
- texture memory รายงานจาก dimensions/format/mipmaps ไม่ใช้เพียงจำนวน texture
- ไม่มี DOM mutationจาก animation/asset update
- SwiftShader FPS ไม่ใช้เป็น verdictเดี่ยว

## 12. Evidence and Acceptance

- source/work manifest, exact changed paths และ parent snapshotทุก phase
- API/schema/ownership tests + mutation proof
- deterministic Asset Lab outputs และ content hashes
- 0°/90°/180°/270° + Top/Bottom + gameplay camera
- Idle/Walk/Throw Capture/Throw Summon/Recall/Skill/Hurt
- camera pitch min/default/max และ mobile viewports 844×390, 915×412, 740×360
- real-device joystick+camera, rotate/restore, WebGL และเล่นต่อเนื่อง 10 นาทีใน BH4
- ไม่มี gameplay/save/collider rule drift
- asset เปลี่ยนได้ผ่าน catalog/appearance โดยไม่แก้ gameplay source

## 13. OMP Handoff Rule

ก่อนมี phase-specific OPEN ให้ OMP ทำได้เฉพาะ:

- อ่าน/ประเมิน work order
- ระบุ dependency, exact proposed paths และ conflictกับ UX1/post-UX1 source
- เสนอ test harness ที่ทำงานบน Android/Termux
- ห้ามแก้ source, canonical, Git, deploy, release หรือสร้าง asset runtimeใน workspaceเกม

