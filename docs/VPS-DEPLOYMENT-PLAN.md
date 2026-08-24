# PocketMonster VPS deployment and integration plan

Status: proposal for review only

Reviewed repository commit: `ccce24417993bcc52af3b921d91c48d3ee4b24be`

Assessment date: 2026-08-24 (Asia/Bangkok)

## Purpose

This document proposes a safe path for serving PocketMonster from the existing
Windows VPS while retaining the Firebase authentication and cloud-save design.
It does not authorize or perform a production deployment.

Sensitive VPS details such as its public address, exact firewall exposure, and
administrative access configuration are intentionally omitted from this public
repository. Those details should be tracked in a private operations document.

## Evidence and scope

### Verified from the repository

- The active client is a static HTML/CSS/JavaScript application using ES
  modules. It does not currently require an application server on the VPS.
- `index.html` and `v800.html` are the active entry points; the README requires
  them to remain byte-identical.
- The client imports Firebase Web SDK modules directly from Google's CDN.
- `firebase-auth-ui.mjs` supports email/password, Google, and anonymous sign-in.
- `firebase-game-sync.mjs` stores the current save under
  `players/{uid}/saves/current` in Firestore.
- `firestore.rules` restricts player and save access to the authenticated owner,
  disallows deletes, and exposes `public_content` as read-only.
- `.github/workflows/firebase-hosting-merge.yml` deploys `main` to the live
  Firebase Hosting channel.
- `firebase.json` excludes tests, plans, package metadata, the asset lab, and
  other development material from Firebase Hosting.
- The repository reports different version markers: README/runtime metadata
  reference 8.1.0 while `package.json` references 8.2.0. This must be reconciled
  before a production release is labeled.
- The repository contains a large Node-based test suite, but Node is a
  development/test dependency rather than a runtime dependency for the static
  site.

### Verified on the VPS (details redacted)

- The host is Windows Server with limited CPU, memory, and remaining disk space.
- Apache from XAMPP already owns ports 80 and 443 and uses the XAMPP web root.
- The current default site redirects to an application port whose ownership and
  intended service must be confirmed before changing the redirect.
- The HTTPS virtual host still uses an example server name/certificate.
- MySQL and remote-administration services are present. The inbound exposure of
  these services requires a private security review before launch.
- Git was installed to support preparation of this report. No application
  runtime, Apache configuration, firewall rule, database, or web-root content
  was changed during the assessment.

### Assumptions and decisions still required

- The production domain and DNS owner are not yet specified.
- It is not yet decided whether the VPS becomes the primary production origin,
  a staging origin, or a fallback behind Firebase Hosting.
- Ownership of the current default-site redirect must be established.
- Operations must decide whether to harden the existing XAMPP installation or
  migrate later to a production-oriented web-server package. A web-server
  migration should not be mixed into the first game release unless necessary.

## Recommended architecture

```text
Player browser
    |
    | HTTPS
    v
Dedicated PocketMonster virtual host on the VPS
    |
    +-- versioned, immutable static release files
    |
    +-- Firebase Authentication (browser SDK)
    +-- Firestore current-save document (browser SDK + security rules)
```

The VPS should serve only static release artifacts. Firebase should remain the
identity and cloud-save backend for the first deployment. MySQL is not part of
the verified application design and must not be introduced without a separate
backend specification, threat model, API authentication design, and data
migration plan.

Do not point Apache directly at a mutable Git checkout. Build and verify an
allowlisted artifact, copy it into a versioned release directory, and switch the
site to that release only after smoke tests pass. Preserve at least one previous
release for rollback.

## Delivery plan

### Phase 0: decisions and ownership

1. Choose production domain and DNS owner.
2. Decide whether VPS or Firebase Hosting is the primary origin.
3. Identify the owner and purpose of the existing default redirect.
4. Name an operator responsible for backup, certificate renewal, monitoring,
   rollback, and incident response.

**Go/no-go gate:** no production changes until all four decisions are recorded.

### Phase 1: VPS safety baseline

1. Snapshot or back up Apache configuration, the existing web root, and the
   current certificate material; prove that the backup can be restored.
2. Review inbound firewall policy privately. Public access should normally be
   limited to 80/443; administrative and database access should be limited to a
   trusted IP or VPN. Bind MySQL locally if remote access is unnecessary.
3. Patch Windows, Apache, OpenSSL, PHP/XAMPP components, and other exposed
   services under an approved maintenance window.
4. Disable directory listing, unnecessary XAMPP endpoints, verbose server
   banners, and any sample content reachable from the Internet.
5. Establish disk-space and log-retention thresholds. Low free space can break
   deployments, logging, backups, and certificate renewal.

**Go/no-go gate:** backup restore tested; exposed services accepted or
restricted; sufficient free disk reserved; no unknown redirect dependency.

### Phase 2: reproducible release artifact

1. Pin the release to an approved commit SHA or signed tag.
2. Use a clean build/test environment with the supported Node version.
3. Run `npm ci`, `npm run check`, `npm run ci`, and `npm run sim`.
4. Verify that `index.html` and `v800.html` are byte-identical.
5. Inventory every browser-loaded module, image, texture, and external CDN
   request. Include only required runtime files in the artifact.
6. Exclude `.git`, tests, plans, DOCX files, tools, package metadata, backups,
   credentials, source-only labs, and old release files from the public root.
7. Record artifact checksum, source commit, application version, and save-schema
   version in a release manifest.

**Go/no-go gate:** full CI passes and the artifact can boot from a clean local
static server without files from the checkout.

### Phase 3: Apache staging virtual host

1. Create a dedicated staging virtual host and versioned release directory.
2. Configure `.mjs` with a JavaScript MIME type and set safe caching:
   short/no-cache for HTML; immutable caching only for revisioned assets.
3. Add baseline security headers after compatibility testing: CSP,
   `X-Content-Type-Options`, `Referrer-Policy`, and frame restrictions.
4. Keep access/error logs outside the public document root and configure
   rotation.
5. Smoke-test asset paths, case sensitivity, authentication UI, save/load,
   mobile layout, and stale-cache behavior.

Changing origin can make origin-scoped browser data such as `localStorage`
appear missing. Test export/migration behavior before moving existing users from
GitHub Pages or Firebase Hosting to a new domain.

### Phase 4: domain, TLS, and Firebase configuration

1. Point DNS to the approved production endpoint only after staging acceptance.
2. Issue a trusted certificate for the real domain and automate renewal with a
   monitored renewal task.
3. Redirect HTTP to HTTPS and verify the full certificate chain.
4. Add the final domain to Firebase Authentication's authorized domains and
   verify email/password, Google, and anonymous login on that exact origin.
5. Recheck Firestore rules in the Firebase emulator or a dedicated test project
   before changing production rules.

**Go/no-go gate:** TLS, authentication, owner-only saves, and rollback all pass
on the production hostname before public announcement.

### Phase 5: controlled production release

1. Copy the approved artifact into a new immutable release directory.
2. Smoke-test that directory through the production Apache configuration.
3. Switch the active release in one reversible operation.
4. Monitor HTTP errors, Firebase authentication failures, Firestore permission
   errors, disk consumption, and client boot failures.
5. Keep the previous release available until the observation window closes.

Do not run a self-hosted GitHub Actions runner on the public web server for the
initial release. Prefer a GitHub-hosted runner that produces a reviewed artifact,
then deploy through a narrowly scoped credential with environment approval.

## Rollback strategy

Rollback means switching Apache back to the previous immutable artifact and
reloading configuration after validation. It must not depend on rebuilding or
pulling from GitHub during an incident.

Application rollback does not automatically make persisted data backward
compatible. Any future save-schema change must define forward migration,
backward compatibility, and the oldest client version allowed to load the new
save envelope.

## Acceptance criteria

- All repository CI commands pass for the pinned release commit.
- The public artifact contains no repository metadata, secrets, tests, plans,
  backups, or administrative endpoints.
- HTTP redirects to valid HTTPS and the certificate renews automatically.
- The game boots without console module/MIME errors on desktop and mobile.
- Email/password, Google, and anonymous authentication work on the final domain.
- A user can read and update only their own current Firestore save.
- A second user cannot read or overwrite the first user's save.
- Browser-origin save behavior is documented and tested before domain cutover.
- Logs rotate, disk thresholds alert, and backup restoration is demonstrated.
- The previous application release can be restored within the agreed recovery
  time without fetching or rebuilding code.

## Out of scope for this proposal

- Migrating Firebase users or saves to MySQL.
- Creating a custom multiplayer/game API.
- Replacing XAMPP during the first release.
- Changing game mechanics, balance, assets, or save schema.
- Publishing sensitive host inventory or administrative credentials.

## Independent review incorporated

An independent agent review was requested before publication. Its main
recommendations incorporated here are: separate verified facts from assumptions,
redact sensitive VPS inventory, deploy immutable allowlisted artifacts instead
of a live checkout, require explicit go/no-go gates, preserve rollback releases,
test origin-bound browser saves, avoid a self-hosted runner on the public server,
and treat VPS hardening as a prerequisite rather than an afterthought.
