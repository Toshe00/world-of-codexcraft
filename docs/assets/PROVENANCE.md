# Asset provenance registry

`provenance.registry.json` records the provenance decision for every canonical
asset distributed by the web and native builds. It is an engineering control,
not a legal opinion. `provenance.schema.json` is the field contract and
`scripts/verify_asset_provenance.mjs` enforces the contract against the current
filesystem.

## Scope

The verifier walks `public/`, Electron build resources, Android resources, iOS
asset catalogs, and the explicitly listed root images. It examines the
filesystem rather than Git's tracked-file list, so an untracked asset is still
detected. Text pages, generated manifests, and packaging metadata remain visible
as justified `nonAssetExclusions`.

`dist/`, native web copies, and release outputs are not canonical roots. They
inherit provenance from the source file that the build copies. The verifier
prints the current physical path count, embedded asset count, exclusions, and
status distribution. Do not copy those totals into documentation.

Inline third-party vectors are represented by named `embeddedAssets`. This keeps
game-icons.net art and platform trademarks separate from the TypeScript or HTML
container in which they ship.

Root media with no active game, page, README, or packaging consumer stays out of
scope. At this audit, that applies to `build-version-footer.png` and the root
`woc_logo_square.webp`. Add them only if a real distributed consumer is added.

## Contract

Every scoped asset must match exactly one rule after exclusions. A rule records:

- the source or author and an optional provenance URL;
- a controlled `declaredLicense`, using `NOASSERTION` when no license can be
  established;
- repository, source URL, metadata, source comment, or manual-review evidence;
- the known rights holder, or `null` when it is not established;
- attribution, redistribution, and commercial-use decisions;
- transformation status, classification status, justification, and uncertainty
  notes;
- path globs or embedded asset identifiers;
- an expected expanded path count and a SHA-256 of the sorted path inventory;
- inventory locks for every non-asset exclusion and a content SHA-256 for every
  embedded asset container.

`NOASSERTION` is a deliberate absence of a license conclusion. It must never be
changed to a permissive license based on the repository's MIT code license,
visual similarity, a neighboring file, or a service name.

The statuses have these meanings:

- `reusable`: a clearly documented CC0 source.
- `attribution-required`: a documented MIT, CC BY, or OFL source whose notices
  must be preserved.
- `replace-before-release`: an original product brand asset that must not remain
  in the new identity.
- `blocked-pending-proof`: use must stop until specific account, plan, task,
  source, consent, or license evidence is archived.
- `project-owned-proof-required`: project authorship is stated, but ownership or
  fork-reuse documentation is missing.
- `purchased-license-non-transferable`: the recorded purchaser is Levy Street and
  no transferable grant to this fork is present.
- `unknown`: neither source nor license is reliably established.
- `third-party-trademark`: a platform identifier governed separately from art
  licensing.

## Register a new asset

1. Identify the exact source, author, license, rights holder, and transformation
   chain before distributing the file. Save durable evidence in the repository
   when permitted.
2. Add a narrow rule or extend the correct existing rule. Keep file-specific
   exceptions explicit. Use `NOASSERTION` and a blocked or uncertain status when
   proof is incomplete.
3. Run the verifier. A changed broad rule will report the actual path-inventory
   SHA-256. Exclusion drift and inline-container drift are reported separately.
   Review every added, removed, or embedded path before updating any count or
   hash.
4. Run the targeted registry tests and the normal non-destructive contribution
   checks.

```text
node scripts/verify_asset_provenance.mjs
node scripts/verify_asset_provenance.mjs --json
npx vitest run tests/asset_provenance_registry.test.ts
npm run check:types
npm run build
npm run ci:changed
```

The verifier fails on missing scope paths, stale exclusions, empty rules,
uncovered assets, ambiguous rules, unsupported controlled values, missing
evidence, unsafe permissive claims, and inventory drift. A failure is a prompt to
review provenance, not permission to assign the nearest convenient license.
