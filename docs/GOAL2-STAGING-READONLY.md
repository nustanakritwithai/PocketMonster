# Goal 2 staging read-only adapter

This release probes only the public `/api/health` and `/api/version` contracts.
Firebase remains the player-data authority and fallback. No Server account, save,
realtime, migration, or economy endpoint is called.

## Deployment configuration

1. Copy `runtime-config.staging.example.json` to the deployment-only
   `runtime-config.json`.
2. Replace `https://staging.example.invalid` with the approved HTTPS staging
   origin. Do not commit that deployment-specific origin.
3. Keep only `vpsEnabled` and `vpsReads` enabled. All mutation flags must remain
   false and `firebaseFallback` must remain true.
4. Serve the manifest with `Cache-Control: no-cache` and deploy it only to a
   Firebase preview/test channel.

The application exposes the last sanitized observation as
`window.POCKETMONSTER_SERVER_GATE_OBSERVATION` and emits the
`pocketmonster:server-gate` browser event. Its allowlist is limited to request
ID, latency, gate state/reason, observation time, and public release metadata.
It never includes Firebase identity, save payloads, or player data.

## Acceptance and rollback

- Verify `healthy`, `maintenance`, `offline`, `incompatible`, and `invalid`
  states while Firebase login/load remains available.
- Confirm both responses carry the expected `X-API-Version` header and that the
  release SHA is 40 hexadecimal characters.
- Roll back instantly by setting both `vpsEnabled` and `vpsReads` to false in
  the preview manifest. The gate then becomes `disabled` and makes no Server
  request.
- Do not change the Firebase live URL or production manifest.
