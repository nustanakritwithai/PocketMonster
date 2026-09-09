# V9.2 Studio Character live-player acceptance

Acceptance path after V9.1 provider and Studio V1.9.0 export are merged:

1. Export a character from Character Prototype Studio V1.9.0.
2. Commit the file under `assets/runtime-characters/` in Pocket Monster.
3. Open `game-v900` with `?studioCharacter=/PocketMonster/assets/runtime-characters/<file>.pocket-character.json`.
4. Confirm the startup message reports the Studio Character ID.
5. Confirm idle animation is visible while stationary.
6. Move with keyboard/joystick and confirm the imported character switches to walk.
7. Stop and confirm it returns to idle.
8. Confirm camera/player movement still uses the same root transform and world bounds.
9. Confirm invalid/cross-origin/missing package URLs fall back to Pirate Fruit.
10. Confirm `window.MLRPG_ASSETS.livePlayer` reports the selected live-player source.

This checkpoint is opt-in only and must not change the default production player until visual acceptance is complete.
