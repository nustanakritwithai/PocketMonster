# HANDOFF — Pirate NPC name interaction

Status: **runtime bug confirmed; implementation handoff only**

Base when this handoff was created:
- Repository: `nustanakritwithai/PocketMonster`
- `main`: `e5fdc5af8ea3ebd9bf4b3a36a48938341fa0a375`

## User-visible requirement

In the integrated Pirate Fruit scene:

1. Do not show the bottom tutorial/onboarding strip.
2. Do not show the bottom `คุยกับ ...` interaction button.
3. Keep the existing 3D NPC name sprite above the NPC.
4. Tapping the 3D NPC name must open the same original NPC dialogue/service flow.
5. Do not create a duplicate NPC interaction system.
6. Preserve the opaque iframe sandbox; do not add `allow-same-origin`.

## Existing implementation

The previous work is already merged:

- PR #436 — `feat(pirate): retire bottom prompts and tap NPC names`
- PR #441 — deployment gate alignment

Relevant files:

- `pirate-npc-name-interaction-v900.mjs`
- `boot-pirate-fruit-v900.mjs`
- `pirate-fruit-offline/pocket-presentation.mjs`
- `pirate-fruit-control-hud-v900.mjs`
- `tests/v90-pirate-onboarding-overlay.mjs`

Current architecture is correct and should be preserved:

Pirate child
→ projects the nearest NPC name sprite to normalized screen coordinates
→ sends sanitized state via `postMessage`
→ parent owns a transparent hit target over the visible 3D name
→ parent sends an `activate` message back to the Pirate child
→ child must invoke the original Pirate interaction path.

## Confirmed root cause

The final child activation currently does this in `pirate-npc-name-interaction-v900.mjs`:

```js
prompt.click?.();
```

That is the bug.

The original Pirate Fruit interaction prompt does **not** use a `click` handler.

From `pirate-fruit-offline/assets/index-C3SJLfq8.js`, the prompt class creates a button and registers:

```js
this.element.addEventListener('pointerdown', event => {
  event.preventDefault();
  this.requested = true;
});
```

The NPC system then opens dialogue from:

```js
this.input.consumeInteract() || this.prompt.consumeRequested()
```

Therefore `prompt.click()` never sets `requested=true`, so the NPC system sees no interaction request.

This explains the exact live symptom:

- transparent name hit target can be present
- parent can send `activate`
- child can receive it
- but the menu/dialogue still does not open

## Required fix

Keep the existing validation and bridge, but replace the `prompt.click()` activation with the same event type the original game actually consumes: `pointerdown`.

Recommended implementation pattern:

```js
function requestOriginalPirateInteraction(prompt, windowLike = globalThis.window) {
  if (!prompt?.dispatchEvent) return false;
  const PointerEventCtor = windowLike?.PointerEvent || globalThis.PointerEvent;
  if (typeof PointerEventCtor === 'function') {
    return prompt.dispatchEvent(new PointerEventCtor('pointerdown', {
      bubbles: true,
      cancelable: true,
      pointerType: 'touch',
      isPrimary: true,
    }));
  }

  const EventCtor = windowLike?.Event || globalThis.Event;
  if (typeof EventCtor !== 'function') return false;
  return prompt.dispatchEvent(new EventCtor('pointerdown', {
    bubbles: true,
    cancelable: true,
  }));
}
```

Then in the child `activate` handler, after the existing name checks:

```js
requestOriginalPirateInteraction(prompt, windowLike);
```

Do **not** call `prompt.click()` as the primary interaction trigger.

## Important validation already present

Do not remove these checks without a replacement:

- event source must be `window.parent`
- event origin must match `trustedParentOrigin`
- message type/kind must match the NPC-name protocol
- requested name must equal the current validated NPC name
- current NPC must still be in interaction range

The hidden `.interaction-prompt` remains useful as the original gameplay interaction owner. It is only visually retired by the integrated HUD CSS.

## About `display:none`

The integrated HUD applies `display:none !important` to `.interaction-prompt`, while the Pirate runtime still writes inline `style.display = 'block'` when an NPC is in range.

The current `readPirateNpcPromptName()` reads `prompt.style.display`, i.e. the runtime inline state, not computed CSS. That allows the bridge to know whether the original Pirate gameplay prompt is logically active while keeping it visually hidden. Preserve this distinction unless tests prove otherwise.

## Tests to add/update

Update `tests/v90-pirate-onboarding-overlay.mjs` or add a focused NPC-name interaction test that proves:

1. Parent hit target still sends `activate`.
2. Child rejects wrong origin/source/name.
3. Correct activation dispatches `pointerdown`, not `click`.
4. A fake original prompt with only a `pointerdown` listener receives the request.
5. The fake listener sets a `requested` flag, proving parity with the Pirate runtime.
6. Bottom onboarding and interaction prompt remain visually retired.
7. No `allow-same-origin` is added to the iframe.

A regression assertion should explicitly forbid the old broken path:

```js
assert.doesNotMatch(source, /prompt\.click\?\.\(\)/);
```

and require the pointer path:

```js
assert.match(source, /pointerdown/);
```

## Cache / deployment checklist

After changing the interaction module:

1. bump the cache query for `pirate-npc-name-interaction-v900.mjs` in both parent and Pirate presentation imports;
2. follow the current cache chain on latest `main` rather than copying old version numbers from PR #436;
3. update any deployment/version assertions affected by those bumps;
4. run the same production verification gates used by the Pages/Firebase workflow;
5. merge only after the branch is rebased/synced with latest `main` because HUD work is moving quickly;
6. verify GitHub Pages and Firebase Hosting both succeed.

## Manual acceptance test

On `https://pocketmonster-game.web.app/`:

1. fully close/reopen the page after deployment;
2. enter the Pirate Fruit scene;
3. approach `หัวหน้ามะลิ` or `เถ้าแก่เปา` until the NPC is within normal interaction range;
4. confirm no bottom `คุยกับ...` prompt is visible;
5. tap directly on the visible name sprite above the NPC;
6. the original Pirate dialogue must open;
7. if the NPC has a service action, its original action button must still work;
8. walking out of range must remove the transparent name hit target.

## Do not regress

Do not:

- reintroduce the bottom talk prompt;
- create a second visible NPC name;
- replace the original Pirate dialogue/service logic;
- directly manipulate child DOM from the parent;
- weaken the iframe sandbox;
- touch unrelated combat, throw/summon, chat, minimap, or HUD positioning work.

## One-line diagnosis for the next agent

**The name tap currently reaches the bridge, but the bridge calls `prompt.click()` while the original Pirate prompt only sets its interaction request on `pointerdown`; switch activation to the original `pointerdown` path, test it, bump caches, and deploy.**
