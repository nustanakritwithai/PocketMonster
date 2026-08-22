# Flame Wolf F2 — Texture Source Asset

Status: source artwork only. This directory intentionally does **not** wire an appearance, provider, catalog entry, or gameplay behavior.

## Files

- `flame-wolf-f2-basecolor-current-engine-compatible-v1.png`
  - Base Color source texture
  - PNG RGBA, 1024×1024, sRGB
  - SHA-256: `793f342b8576393c9edce336e9e6a24c87f50d851c78c0fbb02542446c91b687`
- `flame-wolf-f2-uv-template-v1.png`
  - Verification template for the current four-side atlas
  - PNG RGBA, 1024×1024, sRGB
  - SHA-256: `775033e0804842b30266eef0a55c54dce83348fb978499337ce8da57b14a273b`

## Current Asset Engine UV Contract

The current `asset-presentation/four-side/uv.mjs` contract is:

| Face | Position | World axis |
|---|---:|---|
| Front | tile (0, 0) | -Z |
| Right | tile (1, 0) | +X |
| Back | tile (0, 1) | +Z |
| Left | tile (1, 1) | -X |
| Top | tile (0, 2) | +Y |
| Bottom | tile (1, 2) | -Y |

Each tile is 256×256 px with a 4 px gutter in a 1024×1024 atlas.

## Scope Boundary

This is a visual source-asset PR only. It must not change HP, stats, collider, skills, capture, evolution, gameplay logic, catalog identity, or save data.

The current Blocky Animal provider uses the same generated four-side atlas on both head and body and renders eyes/nose as separate geometry. Therefore this source texture deliberately uses reusable fire motifs and a diamond core instead of stamping a face that would also appear on the body. A future, separately approved per-part UV/appearance PR is required before a head-only hand-painted face texture can be applied correctly.

## Provenance

Art requirements source:
`/storage/emulated/0/Download/PocketMonster_Blocky_F2_Asset_Agent_Command.txt`

Created locally before repository integration. Runtime reduction to 512×512 and mobile quality comparison are deferred until the texture-loader/appearance integration scope.
