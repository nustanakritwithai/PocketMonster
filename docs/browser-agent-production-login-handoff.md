# External Browser Agent handoff: Production QA login prerequisite

## Objective

Create the single approved QA identity in Production Firebase Authentication so the rollout operator can resolve its immutable Firebase UID and complete the one-user launch-ticket allowlist.

Target URL: `https://pocketmonster-game.web.app/`

Firebase Console target: `https://console.firebase.google.com/project/pocketmonster-game/authentication/users`

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
3. Do not treat the current in-game login form as Firebase Authentication. While `launchTicket=false`, the launcher imports the legacy game and its login can reach the HUD without creating a Firebase Auth user.
4. Open the exact Firebase Console target above using an authorized operator session. Confirm the project selector says `pocketmonster-game`.
5. In Authentication > Users, add the intended QA email/password using only the protected input channel. Do not copy or expose the generated UID. If the user already exists, do not create a duplicate or reset its password.
6. Confirm only that Firebase Console now shows the intended QA user. Do not open or copy its UID.
7. Do not claim that legacy HUD access proves Firebase authentication or launch-ticket behavior.
8. Sign out or leave the tab in the state explicitly requested by the project owner. Do not extract session data.
9. Post only a redacted result on this PR using the result template below.

## Result template

```text
External Browser Agent result: PASS | BLOCKED
Production Firebase project checked: pocketmonster-game
QA user exists in Firebase Authentication: yes | no | not tested
Legacy HUD result used as Firebase evidence: no
Credential/token/UID captured or posted: no
Production deploy/restart/flag change: no
launchTicket/vpsWrites/playerDataWrites changed: no
Safe next action: rollout operator may resolve the QA UID server-side | <redacted blocker>
```

## Acceptance boundary

PASS means only that the intended QA account exists in Production Firebase Auth. Legacy game login or HUD access is not Firebase-authentication evidence while the launch-ticket feature is disabled. The rollout operator must independently resolve the UID without displaying it, build the staged configuration, run preflight, and obtain the separate final approval before stopping the Production process.
