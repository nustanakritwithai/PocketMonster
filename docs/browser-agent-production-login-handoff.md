# External Browser Agent handoff: Production QA login prerequisite

## Objective

Create or sign in the single approved QA account on the Production Firebase launcher so the rollout operator can resolve its immutable Firebase UID and complete the one-user launch-ticket allowlist.

Target URL: `https://pocketmonster-game.web.app/`

This is a login prerequisite only. It does not authorize a Production deploy, process restart, launch-ticket activation, save/profile mutation, or player-data write.

## Hard safety constraints

- Obtain account input only through the agent's protected input channel. Never request or copy a password, authorization code, ID token, session token, cookie, private key, or Firebase UID into GitHub, PR text, comments, logs, checkpoints, screenshots, videos, or chat transcripts.
- Do not inspect browser password storage, cookies, local storage, or session storage.
- Do not open a URL containing a token or handoff fragment. Discard any screenshot/video whose address bar or page exposes sensitive values.
- Do not deploy or restart Production. Do not change Firebase Hosting, Server configuration, feature flags, IAM, Auth providers, or account roles.
- Preserve `launchTicket=false`, `vpsWrites=false`, and `playerDataWrites=false` throughout this task.
- Stop after confirming that the intended QA identity can authenticate on the Production launcher. Do not test launch-ticket behavior in this handoff.

## Browser checklist

1. Open a fresh tab at the exact target URL above.
2. Confirm the origin is `pocketmonster-game.web.app` and not a Preview/studio channel.
3. If the intended QA account does not exist, let the project owner complete the supported sign-up flow using the protected input channel. Do not invent a password or select a different account.
4. Sign in from a fresh Production root page.
5. Confirm the login UI accepts the account and advances beyond the unauthenticated form. Because launch-ticket remains disabled, do not interpret legacy game loading as launch-ticket verification.
6. Sign out or leave the tab in the state explicitly requested by the project owner. Do not extract session data.
7. Post only a redacted result on this PR using the result template below.

## Result template

```text
External Browser Agent result: PASS | BLOCKED
Origin checked: pocketmonster-game.web.app
QA account exists/authenticates: yes | no | not tested
Credential/token/UID captured or posted: no
Production deploy/restart/flag change: no
launchTicket/vpsWrites/playerDataWrites changed: no
Safe next action: rollout operator may resolve the QA UID server-side | <redacted blocker>
```

## Acceptance boundary

PASS means only that the intended QA account exists in Production Firebase Auth and successfully authenticates through the Production launcher. The rollout operator must independently resolve the UID without displaying it, build the staged configuration, run preflight, and obtain the separate final approval before stopping the Production process.
