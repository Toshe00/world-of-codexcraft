# Asset replacement layer

## Purpose

The asset replacement layer translates a historical public asset path to an approved
replacement path without changing gameplay identifiers, simulation data, saved data, or
the historical file. It is a visual and media routing layer only.

The checked-in registry contains only laboratory evaluation rules. Production activation
is forbidden by policy, and laboratory rules require an explicit local development flag.
Therefore the normal runtime returns every historical path unchanged and the current game
appearance and preload behavior remain identical. Laboratory targets may still be included
in the media manifest so they can be distributed to the isolated development viewer.

The canonical files are:

- `config/asset-replacements.registry.json`: checked-in replacement rules and activation
  policy.
- `config/asset-replacements.schema.json`: machine-readable shape and controlled values.
- `src/assets/asset_replacement.mjs`: pure validation and resolution contract.
- `src/assets/runtime.ts`: development-mode adapter used by asset consumers.
- `scripts/verify_asset_replacements.mjs`: read-only repository verifier.
- `docs/assets/provenance.registry.json`: mandatory provenance evidence and rights policy.

## Resolution contract

Callers continue to provide the same historical logical path. The resolver:

1. validates the request and registry;
2. keeps the historical path as `historicalPath` and `fallbackPath`;
3. returns the historical path when no active applicable rule exists;
4. follows an enabled and valid replacement chain;
5. returns a reason and the replacement rule ids used.

Paths are case-sensitive public-root-relative paths such as
`models/creatures/wolf.glb`. Leading slashes, drive paths, URLs, backslashes, query
strings, fragments, empty segments, dot segments, and directory traversal are rejected
by the pure path resolver. Runtime URL handling strips only a leading public slash before
resolution and leaves remote URLs unchanged.

Validation rejects missing or case-mismatched files, self-replacement, duplicate ids,
multiple rules for one source, cycles, incompatible resource types, unsupported status
or platform values, and provenance that is missing, ambiguous, blocked, or not approved.

## Registry fields

Every future rule must contain:

- `id`: stable kebab-case replacement rule id;
- `historicalPath`: existing public asset path, without a leading slash;
- `replacementPath`: new public asset path, without a leading slash;
- `type`: `model-glb`, `texture`, `ui-image`, `audio`, `font`, `environment`, or
  `other-static`;
- `status`: `inactive`, `laboratory`, `approved`, `blocked`, or `retired`;
- `reason`: why the replacement exists, including a useful explanation for laboratory
  and blocked rules;
- `provenanceRuleId`: the exact rule covering the target in the provenance registry;
- `enabled`: explicit activation state;
- `platforms`: one or more of `web`, `desktop`, `android`, and `ios`;
- `plannedFor`: planned date, milestone, or version;
- `notes`: additional review facts;
- `rollbackStrategy`: normally disabling the rule while retaining both files.

The platform list is validated metadata in this phase. Runtime platform selection is not
yet applied because no production replacement is active. A future activation that differs
by platform must first add an explicit trusted runtime platform input and targeted tests.

## Adding an asset

For an authorized laboratory or production-candidate asset:

1. add the new file under `public/` without modifying, moving, renaming, or deleting the
   historical file;
2. add precise provenance coverage and evidence to
   `docs/assets/provenance.registry.json`;
3. run `node scripts/verify_asset_provenance.mjs`;
4. add a replacement rule with the exact provenance rule id: laboratory rules use
   `status: "laboratory"` and `enabled: true` but remain runtime-inactive without the
   explicit development flag; other future rules follow their authorized status;
5. run `node scripts/verify_asset_replacements.mjs` and the focused replacement tests;
6. review visual parity, loading behavior, cache behavior, attribution, and every target
   platform before changing status.

The replacement verifier accepts a validated CC0 asset and provenance with declared
redistribution and commercial-use rights plus recorded evidence. It refuses
`blocked-pending-proof`, `purchased-license-non-transferable`, unknown rights, and every
target without evidence. A laboratory-only rule may record operator-declared metadata and
an explicit missing-proof warning when that exception is authorized; the proof must be
verified before any public release. A `replace-before-release` provenance rule is accepted
only when its declared license, redistribution rights, commercial-use rights, and evidence
independently permit the new asset to be used.

Never change a provenance classification merely to make validation pass. Resolve the
rights evidence or choose a different asset.

## Laboratory replacements

A laboratory rule uses `status: "laboratory"` and `enabled: true`, but it remains inactive
unless the local Vite development process is started with:

```text
VITE_ASSET_REPLACEMENT_LAB=1
```

The runtime additionally requires `import.meta.env.DEV`. A save file, gameplay setting,
server payload, or remote player cannot activate this mode. Do not put the flag in a
production environment. A laboratory rule must retain a non-critical historical fallback;
tests cover both artificial fixtures and checked-in laboratory rules.

Production rules cannot be enabled while the registry policy contains
`productionActivationAllowed: false`. The verifier and runtime validation fail closed if
such a rule is checked in.

## Approval and rollback

Approval requires provenance approval, repository verification, focused loading and
rendering tests, visual review, cache and preload review, and explicit authorization to
permit production activation. The current laboratory rule does not grant that
authorization.

Rollback does not rename an identifier or delete a file. Set `enabled` to `false`, run the
verifiers and tests, and deploy. The historical path remains the caller input and the
resolver's recorded fallback throughout the replacement lifecycle.

Gameplay and persistent identifiers must never be renamed to match an asset. Models,
creatures, weapons, quests, classes, map entries, and saves continue to use their existing
ids. Only their historical resource path may be translated at the loading boundary.

## Runtime coverage

Covered in this phase:

- GLB models, model preloads, model cache keys, and `releaseGltf` through the central
  `assetUrl` boundary before `GLTFLoader`;
- Three.js textures and environment HDR files through the same boundary before
  `TextureLoader` and `RGBELoader`;
- generated SFX manifest URLs before `fetch`;
- generated voice manifest URLs before assignment to `HTMLAudioElement`;
- the main theme and file-backed dungeon and stadium music before `Audio` construction or
  `fetch`;
- centralized weapon, skill, item, deed, and overhead-emote image helpers;
- dungeon-finder portraits, store cosmetic card art, and the Store promotion at their DOM painter
  boundaries.

The existing media manifest remains authoritative after replacement resolution. In
development it returns the resolved public path. In production it maps the resolved path
to the generated hashed URL when present, preserving the existing unhashed fallback.

## Current limits

The following static surfaces do not yet pass through a safe common JavaScript boundary:

- CSS `url(...)` resources, including cursors;
- `@font-face` sources in game, guide, admin, and public-page stylesheets;
- images referenced directly by public HTML pages or generated guide content;
- any isolated UI URL that bypasses the covered helpers and painters;
- remote runtime SFX pack URLs, which intentionally remain remote and are not registry
  paths.
- automatic retry of the historical file after a replacement loads but fails to decode.
  The pure resolution records `fallbackPath`, and disabling the rule restores it, but each
  loader family needs a tested retry policy before its first real replacement is approved.

Covering CSS, fonts, and standalone public pages requires a build-time URL transformation
or dedicated manifest extension. That work must preserve relative URL semantics and the
static cache contract, so it is intentionally not forced into this phase. Add a tested
adapter at that boundary before attempting those replacement types. The registry already
controls their types so future support does not require a gameplay change.

## Avoiding ambiguity

Use exactly one rule per historical source and one unique rule id. Do not use replacement
targets that eventually point back to an earlier source. Do not replace a path with itself.
Always use the exact on-disk case. Run:

```bash
node scripts/verify_asset_replacements.mjs
npx vitest run tests/asset_replacement.test.ts tests/asset_replacement_verifier.test.ts
```

The verifier is read-only, prints rule and activation counts, and exits nonzero for any
registry, file, provenance, type, cycle, duplicate, ambiguity, or policy error.
