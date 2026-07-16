# Phase 2 visual rebranding

Date: 2026-07-16

## Scope

This phase changes only display and editorial surfaces from **World of ClaudeCraft** to
**World of CodexCraft**, with **CodexCraft** as the short visible name. The change is
bounded by `docs/compatibility/identifiers.registry.json`, especially the
`visible-project-labels` rule (`rename-display-only`) and the brand asset rule
(`replace-before-release`). It does not migrate technical identifiers.

## Visible surfaces changed

- Homepage, online play entry, title screen, loading screen, login and character menus.
- Page titles, descriptions, OpenGraph metadata, social cards, and JSON-LD.
- PWA display name, short name, and description.
- Public links, press, merchandise, support, legal, data deletion, and outage pages.
- Guide chrome, guide metadata, and the current MediaWiki site and main-page labels.
- Player-card wordmark, Discord bot messages, Electron dialogs, and native display names.
- Authored UI and admin translation sources for every supported locale.
- The `en_XA` pseudo-locale generator, which now preserves both approved product names
  byte-for-byte while continuing to accent and bracket surrounding copy.
- Player README translations and public machine-readable editorial copy.

The principal web surfaces now use a neutral text-only wordmark. They do not load the
legacy logo files. OpenGraph and social metadata use text metadata without the legacy
brand image. The whitepaper remains stored for rollback and historical review but is no
longer linked from the homepage. The MediaWiki chrome and seed use a neutral gradient
instead of the legacy loading-screen artwork, and the seed diff is limited to current
brand labels and that neutral visual fallback.

## Technical identifiers deliberately preserved

The following remain byte-for-byte compatible:

- Package and repository slug `world-of-claudecraft`.
- Desktop application ID `com.worldofclaudecraft.desktop`.
- Electron crash-reporter `productName` and `_companyName` metadata, which are retained
  as diagnostic compatibility metadata rather than player-facing labels.
- Mobile application ID `com.worldofclaudecraft` and all Android and iOS bundle IDs.
- Protocol and origins `worldofclaudecraft://`, `app://worldofclaudecraft`, and the
  installed URL schemes.
- Domains, email addresses, OAuth callbacks, social handles, repository URLs, and update
  feeds that contain the legacy compact slug.
- Storage keys beginning with `woc_` and the existing `claudecraft_admin_token` key.
- Headers beginning with `x-woc-`, routes below `/api/woc/`, metrics beginning with
  `woc_`, and environment variables beginning with `WOC_` or `VITE_WOC_`.
- `WOC_MINT`, Claudium, Armory, ownership, wallet, and Web3 contracts.
- Claudemoon technical names and every zone, quest, item, monster, NPC, skill, class,
  save, database, Docker, PostgreSQL, volume, and infrastructure identifier.
- Eastbrook IDs, paths, services, database names, and `/opt/eastbrook` paths.

The legacy server sentence `has entered World of ClaudeCraft` remains as an input matcher
because authoritative servers still emit it. The client translates that stable wire text
to a World of CodexCraft display label in every supported locale; a targeted test pins
that input-to-display boundary.

## Legacy brand assets retained for rollback

No source image was renamed, overwritten, or deleted. The complete brand asset family
remains covered by the provenance registry:

- Web and root files: `public/woc_logo_square.webp`, `public/woc-logo-guide.webp`,
  `public/woc-logo-hero.webp`, `public/worldofclaudecraft-logo.png`,
  `public/World-of-ClaudeCraft-Whitepaper-v1.0.pdf`, `woc_community.png`, and
  `worldofclaude.png`.
- Web icon files: `public/favicon.ico`, `public/favicon-16x16.png`,
  `public/favicon-32x32.png`, `public/icon-192.png`, `public/icon-512.png`, and
  `public/apple-touch-icon.png`.
- Desktop packaging icons: `build/icon.png`, `build/icon.ico`, and `build/icon.icns`.
- Existing Android launcher resources and iOS AppIcon PNG resources.
- Historical documentation captures, including `docs/screenshots/title-screen.jpg`, may
  contain the former logo. They remain archived but are no longer embedded in the player
  README surfaces.

The PWA manifest still references its existing icon files. Native Windows, Android, and
iOS icons are intentionally unchanged in this phase, as required. These icons and the
PWA icon policy must be replaced when an approved identity asset exists.

## Deferred work and visible legacy references

- Server-generated email, OAuth, profile, and public player-card copy still contains the
  old display label. Changing it would modify server runtime files, which this phase
  explicitly leaves untouched.
- Social handles, domains, repository links, update URLs, email addresses, and encoded
  mail routes retain the legacy compact slug because they are external identifiers.
- MediaWiki historical reception and source citations retain the name used by the
  original posts and communities. Product or legal review should decide whether to add
  an explicit historical-name notice.
- Existing MediaWiki revision comments and the installation-time bootstrap argument
  retain the historical name. Current site chrome and the current Main Page use the new
  label; changing bootstrap/runtime history is deferred beyond this visual-only phase.
- Contributor documentation and developer-only asset, SFX, audit, and release tooling
  may retain historical labels. They are not player-facing phase-2 surfaces.
- A final logo, social-card artwork, PWA icons, and native application icons are deferred
  until approved assets and migration plans exist.
- Application IDs, protocols, domains, and infrastructure names require separate,
  compatibility-managed migrations if they are ever changed.

## Compatibility and behavior

No simulation, gameplay, map, save format, server runtime, database schema, dependency,
or 3D asset is part of this change. Offline play continues to use the same entry path and
simulation modules. Compatibility and provenance registries remain the source of truth
for future phases.
