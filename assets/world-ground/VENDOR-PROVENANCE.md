# World Ground Texture Provenance

The high-quality ground texture binaries in this directory are presentation-only assets for the PocketMonster World Simulator ground renderer.

## Vendor run

- Source: Poly Haven
- License: CC0
- Resolution: 1K
- Runtime API dependency: none
- Vendoring workflow run: `34502792601`
- Vendored commit: `5a7773ed1228df5dd38325bb3e685bcb801fe86c`
- Local material pack: `material-pack-v1.json`
- Material pack state after vendoring: `installed: true`

## Source assets

- `grass_ground` → grass
- `forrest_ground_01` → forest floor
- `mud_forest` → mud / wet ground
- `forrest_sand_01` → sand
- `rock_ground` → rock
- `dirt` → dry soil and burned-ground base

Each local material uses the available Diffuse/Albedo, OpenGL Normal, Roughness, and AO JPEG maps. The game runtime loads the vendored local files; it does not fetch Poly Haven assets or metadata during play.

## Authority boundary

These texture files change only presentation. Terrain elevation, total water height, surface water, soil state, vegetation coverage, biome and fire severity remain authoritative World Simulator 20.9.4 state supplied through the immutable map-frame adapter.
