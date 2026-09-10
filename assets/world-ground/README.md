# World Simulator Ground Materials

This directory is presentation-only. World Simulator 20.9.4 remains the authority for terrain, water, soil, vegetation, biome and fire state.

## Material sources

`material-pack-v1.json` declares a local runtime pack built from Poly Haven texture assets:

- grass → `grass_ground`
- forest-floor → `forrest_ground_01`
- mud → `mud_forest`
- sand → `forrest_sand_01`
- rock → `rock_ground`
- dry-soil / burned base → `dirt`

The selected assets are CC0. PocketMonster does not call the Poly Haven API at runtime. The development-time vendor script downloads files into this directory, and the game loads only local project files after they are vendored.

## Install / refresh the local pack

```bash
node scripts/vendor-world-ground-polyhaven.mjs --resolution=1k
```

Use `--force` to redownload. The script requests Albedo/Diffuse, OpenGL Normal, Roughness and AO JPEG maps, writes them under `polyhaven/<asset>/`, then flips `installed` in `material-pack-v1.json` only after all required files have been obtained.

The checked-in manifest intentionally starts with `installed: false`; therefore a missing texture pack never breaks game boot. The renderer uses its PBR-ready fallback materials until the local files are present.

## Mobile quality contract

Runtime quality is selected by the existing PocketMonster performance profile:

- low: texture budget 512 px, anisotropy 2
- medium: 1024 px, anisotropy 4
- high: 2048 px, anisotropy 8

The first vendor target is 1K to keep the browser/mobile payload reasonable. A later asset build can add KTX2/Basis variants without changing World Simulator state or the map-frame contract.

## Authority boundary

Optical wetness, burn darkening, macro variation, normal mapping and roughness are renderer effects only. They cannot mutate World Simulator water, soil, biome, fire or navigation state.
