# V9.2 — Studio Character Live Player Opt-in

This slice wires the V9.1 `studio-character` provider into the actual `game-v900.js` player spawn path without changing the default player.

## Usage

Host a Character Prototype Studio V1.9.0 export on the same origin as Pocket Monster, then open the game with:

`?studioCharacter=/path/to/character.pocket-character.json`

Example on GitHub Pages when the package is committed under Pocket Monster:

`?studioCharacter=/PocketMonster/assets/runtime-characters/custom.pocket-character.json`

## Behavior

1. Pocket boots the normal humanoid catalog.
2. Pirate Fruit provider remains registered.
3. The live-player helper parses the `studioCharacter` query parameter.
4. Only same-origin `.pocket-character.json` URLs are accepted.
5. The package is validated and installed into the Asset Engine.
6. `studio-character` is registered and the package's manifest ID becomes the player asset ID.
7. The actual `assets.spawn(...)` path uses that selected ID.
8. Imported player starts at `idle` and switches `idle ↔ walk` with movement.
9. If the query is missing, invalid, or package loading fails, the game falls back to `character.human.pirate-fruit.v1`.

## Safety / authority

The V9.1 package validator remains in front of the live path. Gameplay, combat, progression and save fields are rejected from Studio packages.

## Acceptance scope

This is intentionally opt-in. It does not change the default production character until an exported Studio package is visually accepted in the live world.
