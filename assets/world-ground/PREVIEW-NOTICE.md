# WorldSim Ground Offline Preview

This file documents the local fallback visual frame used when the live Living World Physics Simulator endpoint is unavailable.

- It is presentation-only and never becomes simulation authority.
- It uses the audited `pocketmonster.world-map-frame.v2` contract for WorldSim 20.9.4.
- It exists so the high-quality local PBR ground renderer remains visible while the live WorldSim transport is offline.
- Any successful live snapshot replaces the preview immediately on the next `refresh()`.
- Gameplay/navigation authority remains unchanged.
