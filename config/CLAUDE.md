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
