# HANDOFF — Pirate NPC คุย chip / name tap

Status: **live bug still not accepted.** Several layered fixes already shipped on `main`. Do **not** re-implement those. Do **not** squash-merge this docs PR as the runtime fix. Use it only as context.

- Repo: `nustanakritwithai/PocketMonster`
- Latest `main` when this was updated: `71fa602` (`fix(pirate): accept same-origin scene messages for คุย chip (#464)`)
- Live: GitHub Pages `https://nustanakritwithai.github.io/PocketMonster/` and Firebase `https://pocketmonster-game.web.app/` (web.app redirects to Pages)
- Guest login → Pirate Fruit (`?world=pirate-fruit&panel=human`)
- Write flags stay closed. One-task-one-PR. Squash-merge only when the user says `merge`.

## สรุปภาษาไทย (อ่านอันนี้ก่อน)

เป้าหมายของผู้ใช้: **ปุ่ม `คุย` โผล่บน/ใต้ชื่อ NPC แบบ 3D** แล้วแตะแล้วเปิดบทพูด Pirate เดิม ไม่ใช่ระบบคุยชุดใหม่

ห้ามทำ:

- แถบ `คุยกับ...` ด้านล่าง
- แถบ onboarding
- `allow-same-origin` บน iframe Pirate ที่ nest ไว้
- ย้ายปุ่ม combat HUD
- สร้างระบบบทพูดซ้ำ

สิ่งที่ลง `main` แล้ว (อย่าทำซ้ำ):

| PR | SHA | แก้ชั้นไหน | ทำไมยังไม่จบ |
|---|---|---|---|
| [#455](https://github.com/nustanakritwithai/PocketMonster/pull/455) | `f2a8783` | child ส่ง `pointerdown` แทน `prompt.click()` | overlay ยังผูกผิดที่ |
| [#458](https://github.com/nustanakritwithai/PocketMonster/pull/458) | `e932658` | overlay ตาม camera ที่ capture ไม่ใช่ `window.__combat` | ชิปมองไม่เห็น |
| [#460](https://github.com/nustanakritwithai/PocketMonster/pull/460) | `c0a8f6f` | ปุ่ม `คุย` ทึบใต้ชื่อ (opacity 1) | ชิปถูกสร้างแต่ `display:none` |
| [#461](https://github.com/nustanakritwithai/PocketMonster/pull/461) | `aef1e16` | capture `Object3D`/`Scene` + fallback 0.5/0.32 | ยังไม่โชว์ เพราะ message ถูกทิ้ง / sync ไม่ยิง |
| [#464](https://github.com/nustanakritwithai/PocketMonster/pull/464) | `71fa602` | รับ origin `null` **และ** scene origin, ไม่รอ `pirateHud`, โชว์จากชื่อใกล้ๆ | ผู้ใช้สั่ง merge ก่อนตรวจไลฟ์รอบนี้ — **ต้องฮาร์ดรีเฟรชแล้วยืนยันก่อนเขียนโค้ดชั้นใหม่** |

ไลฟ์ล่าสุดก่อน #464 (guest, ~18:38 ICT 2026-09-03):

- ชื่อ NPC (`หลิน` / `หัวหน้ามะลิ` / `เถ้าแก่เปา`) เห็น
- `#pirateNpcNameHitProxy` **ไม่อยู่บน top document**
- ปุ่มอยู่ **ใน** `iframe#onlineWorldSceneFrame` (`scene-v900.html?...&shellRevision=40` ตอนนั้น) ซึ่ง **ไม่มี sandbox** (same-origin กับ Pages)
- ปุ่มมี `textContent` `คุย` แต่ `display:none`, left/top ไม่ถูกเซ็ต, rect 0×0
- top ไม่มี `#pirateFruitFrame` — เฟรม Pirate nest อยู่ใน scene iframe
- scene โหลด `boot-pirate-fruit-v900.mjs?v=926` และ `pirate-npc-name-interaction-v900.mjs?v=5`

อย่า merge PR นี้ (#453) เป็นตัวแก้เกม

## User-visible requirement

In the integrated Pirate Fruit scene:

1. Do not show the bottom tutorial/onboarding strip.
2. Do not show the bottom `คุยกับ ...` interaction button.
3. Keep the existing 3D NPC name sprite above the NPC.
4. A visible `คุย` chip on/under that name must open the **original** Pirate dialogue/service flow.
5. Do not create a duplicate NPC interaction system.
6. Preserve the opaque nested Pirate iframe sandbox; do not add `allow-same-origin`.
7. Do not change combat HUD layout.

## Frame topology (easy to get wrong)

```
top document  (online-world-shell)
  └── iframe#onlineWorldSceneFrame   scene-v900.html
        • NO sandbox → same-origin with Pages
        • boot-pirate-fruit-v900.mjs runs HERE
        • #pirateNpcNameHitProxy is created on THIS document
        └── iframe#pirateFruitFrame  pirate-fruit-offline/index.html?parentOrigin=...
              • sandbox = allow-scripts allow-pointer-lock allow-fullscreen
              • NO allow-same-origin → opaque, postMessage origin is "null"
              • pocket-presentation.mjs installs the child projector + camera capture
              • original .interaction-prompt lives HERE (HUD CSS hides it)
```

`window.__combat` is the **combat/attack** system, not the Pirate scene/player/camera. Binding the name overlay to it was a real bug (#458).

Vendor prompt (minified `pirate-fruit-offline/assets/index-C3SJLfq8.js`):

- `.interaction-prompt` **is** `this.element`
- listener is `pointerdown` → `requested = true`
- NPC loop: `consumeInteract() || consumeRequested()`
- interact range `ka = 4.2`
- names visible around `m < 125`
- HUD CSS `.interaction-prompt { display: none !important }` and `.onboarding-root` hidden
- `readPirateNpcPromptName()` reads **inline** `prompt.style.display === 'block'`, not computed CSS

## Architecture to preserve

Pirate child (opaque iframe)
→ captures live camera/scene via `Object3D.prototype.updateMatrixWorld`
→ finds nearest 384×96 name sprite at y≈3.55 within ~4.6 units
→ posts sanitized `{ type, kind:'state', active, name, x, y, width, height }`
→ parent proxy in the **scene** document (`#pirateNpcNameHitProxy`)
→ `pointerdown`/`click` on the chip posts `{ kind:'activate', name }`
→ child `requestOriginalPirateInteraction(prompt)` dispatches `pointerdown` on `.interaction-prompt`

Protocol: `pocketmonster:pirate-npc-name-v1`. Proxy id: `pirateNpcNameHitProxy`.

Relevant files (on current `main`):

- `pirate-npc-name-interaction-v900.mjs` (imported as `?v=6`)
- `boot-pirate-fruit-v900.mjs` (`?v=927`, pirate HTML `?v=919`)
- `pirate-fruit-offline/pocket-presentation.mjs` (`?v=10`)
- `pirate-fruit-control-hud-v900.mjs` (`?v=5`)
- `tests/v90-pirate-onboarding-overlay.mjs`

Cache chain after #464 (bump from here, do not copy older numbers):

- interaction `v=6`
- presentation `v=10` in `pirate-fruit-offline/index.html`
- pirate HTML `v=919` in `PIRATE_FRUIT_OFFLINE_ENTRY`
- boot `v=927` in `combined-worlds-v900.mjs`
- combined-worlds `v=929` in `online-world-shell-v900.mjs` and `worlds-v900.mjs`
- worlds `v=934` in `scene-entry-v900.mjs`
- `shellRevision` `41`
- Do **not** bump `style-v900.css` for this bug. Update every test pin of those strings.

## What we tried, in order, and what it actually proved

### Layer 0 — original handoff on this PR (stale)

The first version of this document only named `prompt.click()` vs `pointerdown`. That was real, and it is **already fixed**. The live failure after that was not “activate never fires”; it was “chip never becomes visible / state never accepted.”

### Layer 1 — #455 `f2a8783` — pointerdown

- Replaced `prompt.click?.()` with `requestOriginalPirateInteraction` (`PointerEvent('pointerdown')`).
- Tests forbid `prompt.click?.()`.
- Live after merge: tapping the 3D name still did not open dialogue.

### Layer 2 — #458 `e932658` — camera, not `__combat`

- Overlay had been bound to `window.__combat` (combat system). Retargeted to the captured Pirate camera.
- Safari opacity 0.01 hit target, module `v=3`.
- Live after merge: tap still failed; chip still not a useful visible control.

### Layer 3 — #460 `c0a8f6f` — visible `คุย` chip

- User asked for a real `คุย` button under the NPC name, not an invisible overlay.
- Chip styled opaque, `textContent` `คุย`.
- User confirmed after refresh it was **not a cache miss**: still no chip on screen.

### Layer 4 — live DOM (guest, Pages) after #460

Inspected `pocketmonster-game.web.app` → Pages. Guest. Pirate Fruit HUD loaded.

Findings (do not ignore these):

1. Chip **is created** inside the **scene iframe document**, not the top page.
2. It stays `display:none`; `left`/`top` never set; client rect 0×0.
3. That means `state.active` never became true in the parent proxy (or render bailed because the nested `frame.getBoundingClientRect()` was empty — check both).
4. Capture originally hooked Camera/Mesh prototypes, not base `Object3D`; camera was not parented to scene so `sceneFromCamera` failed.

### Layer 5 — #461 `aef1e16` — Object3D/Scene capture + fallback

- Wrap base `Object3D.updateMatrixWorld` plus specialized ctors; record `isCamera` and `isScene`.
- If projection fails, still activate at fallback `(0.5, 0.32)`.
- Live after merge: chip **still** `display:none`. So capture/fallback was not the remaining live blocker.

### Layer 6 — live root cause that #464 addressed

Three independent gates were keeping the chip hidden even when names were on screen:

1. **`accept()` required `event.origin === 'null'`.** Production **scene** iframe is same-origin. Any child/state message whose origin is the Pages origin was dropped. Nested Pirate is *supposed* to be opaque (`origin === 'null'`), but live traffic that needed to show the chip was also arriving with a non-null origin. #464 accepts `'null'` **or** `parentOrigin` / scene origin. Source must still be `frame.contentWindow`. Type/kind still required.
2. **Child `sync()` no-op’d unless `documentElement.dataset.pirateHud === 'pirate-primary-parent'`.** If the HUD postMessage never stuck, the chip never activated. #464 treats `parentOrigin` as enough to enter integrated mode.
3. **Chip was gated on the hidden bottom prompt** (`style.display === 'block'` / `readPirateNpcPromptName`). HUD CSS forces `.interaction-prompt { display:none !important }`. Names can show while that prompt read fails. #464 shows `คุย` from projected nearby name sprites **or** in-range prompt name.

#464 also moved the scene boot listener so **NPC proxy `accept` runs before the remaining `origin === 'null'` HUD/telemetry filter**. HUD telemetry still requires opaque origin.

Activate still `pointerdown` on `.interaction-prompt`. Nested Pirate sandbox unchanged. No bottom talk bar. No combat HUD edits.

Cache-bust as listed above. Tests in `tests/v90-pirate-onboarding-overlay.mjs` cover: accept null **and** non-null origin; sync without `pirateHud`; inactive stays hidden; pointerdown; no `allow-same-origin`; no `prompt.click?.()`.

#464 was squash-merged after rebasing over #463 (HUD toast). **No live proof yet that the chip appears after this merge.** First job for the next agent is a hard-refresh live check, not another code patch.

## What to do next

1. Hard-refresh live Pirate Fruit as guest. Approach `หัวหน้ามะลิ` / `เถ้าแก่เปา` / `หลิน`.
2. If the `คุย` chip is visible under the name and tap opens original dialogue: stop. Tell the user. Do not keep patching.
3. If it is still missing, inspect **inside** `iframe#onlineWorldSceneFrame` (not only the top document):

   ```js
   const scene = document.querySelector('#onlineWorldSceneFrame')?.contentDocument
   const btn = scene?.getElementById('pirateNpcNameHitProxy')
   const pirate = scene?.getElementById('pirateFruitFrame')
   // btn.style.display, btn.getBoundingClientRect()
   // pirate sandbox, pirate.getBoundingClientRect()
   // listen for message type pocketmonster:pirate-npc-name-v1
   // log event.origin, event.source === pirate.contentWindow
   ```

4. Decide which remaining gate failed; ship **one** PR for that gate only; bump the cache chain from the #464 numbers; do not touch `style-v900.css` unless the bug is CSS.

Likely leftover suspects **only if #464 did not show the chip**:

- `frame.getBoundingClientRect()` of `#pirateFruitFrame` is 0×0 so `render()` hides even when `state.active`.
- Camera/scene capture still never fires in the vendor bundle, **and** nearby-sprite walk finds nothing (sprite size/y heuristic 384×96 / y≈3.55).
- Child `postMessage` target origin vs parent `accept` origin still mismatched (opaque `null` vs Pages origin vs `parentOrigin` query).
- Activate reaches the child but `.interaction-prompt` is missing / name mismatch after #464 stopped requiring `liveName === currentName`.
- Pages/Firebase still serving a stale `shellRevision` (must be 41 after deploy). User self-checks with ฮาร์ดรีเฟรช.

## Tests

- Overlay: `node tests/v90-pirate-onboarding-overlay.mjs`
- Pins if you bump versions: `node tests/v90-pirate-save-integration.mjs`, `node tests/v90-pirate-fruit-player.mjs`, `node tests/v90-unified-online-world.mjs`, `node tests/v90-pirate-fruit-client-bridge.mjs`, `node tests/v90-pirate-fruit-player-mutants.mjs`
- Keep: no `prompt.click?.()`, require `pointerdown`, no `allow-same-origin` on `#pirateFruitFrame`.

## Manual acceptance

On `https://pocketmonster-game.web.app/` after deploy:

1. Fully close/reopen (or hard-refresh) after Pages is on `71fa602` / `shellRevision=41`.
2. Guest → Pirate Fruit.
3. Approach `หัวหน้ามะลิ` or `เถ้าแก่เปา` in normal talk range.
4. No bottom `คุยกับ...`, no onboarding strip.
5. Visible `คุย` chip under the 3D name.
6. Tap opens original Pirate dialogue; service buttons still work.
7. Walking out of range hides the chip.

## Do not regress

Do not:

- reintroduce the bottom talk prompt or onboarding strip;
- add `allow-same-origin`;
- bind anything NPC-talk to `window.__combat`;
- wait on `dataset.pirateHud` before showing the chip;
- require prompt `display:block` before showing the chip;
- create a second dialogue system;
- manipulate child DOM from the parent;
- change combat / throw / summon / chat / minimap / HUD positions;
- merge this docs PR as if it were the runtime fix;
- redo #455 / #458 / #460 / #461 / #464.

## One-line for the next agent

**Live chip was created in the same-origin scene iframe and stayed `display:none` because state messages / sync were gated on opaque origin + `pirateHud` + the hidden bottom prompt; those gates shipped in #464 (`71fa602`). Hard-refresh and verify before writing another layer.**
