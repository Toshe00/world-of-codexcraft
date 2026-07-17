# Asset replacement configuration

This directory contains machine-readable repository configuration. It does not own
gameplay or persistent identifiers.

## Asset replacement registry

- Keep `asset-replacements.registry.json` valid against
  `asset-replacements.schema.json`.
- Use public-root-relative, forward-slash paths without a leading slash.
- Add no enabled production replacement while
  `policy.productionActivationAllowed` is false.
- Never add a replacement before its target has approved provenance coverage.
- Run `node scripts/verify_asset_replacements.mjs` after every registry change.
- Never rename or remove the historical asset when adding a replacement rule.

## Laboratory published zone registry

- Keep `laboratory-published-zones.registry.json` development-only with production activation false.
- Package paths are exact repository-relative keys under `config/laboratory-published-zones/`.
- Never add a URL, absolute path, traversal segment, or data-driven import path.
- Generate every checked-in zone package from a valid editor project with the Phase 4G publisher.
- Keep registry ids, package ids, and the local runtime package allowlist in sync.
