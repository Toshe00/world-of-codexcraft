# Identifier compatibility registry

`identifiers.registry.json` is the compatibility boundary for project identifiers.
It records sensitive display, persistence, network, storage, database, application,
infrastructure, economic, and generated identities without changing any runtime value.

Phase 1B is inventory only. The registry does not authorize a rename, migration,
rebranding change, legal conclusion, or asset replacement.

## Files

- `identifiers.registry.json` contains the scope, detectors, compatibility rules,
  evidence, and locked occurrence inventories.
- `identifiers.schema.json` controls every category, strategy, stability value, and
  rename policy.
- `scripts/lib/identifier_compatibility.mjs` expands the registry over the checkout
  and applies semantic compatibility guards.
- `scripts/verify_identifier_compatibility.mjs` is the read-only command-line entry.
- `tests/identifier_compatibility_registry.test.ts` pins verifier failures and the
  classifications that must never become display-only by accident.

## Model

Detectors find literal or regular-expression matches in file contents, repository
paths, or both. A detector can be limited to precise path globs. Rules then assign
those occurrences to a controlled category and transformation strategy.

Every detected occurrence must match exactly one rule. The verifier rejects:

- an uncovered or ambiguously covered occurrence;
- an unknown controlled value;
- an absolute, traversing, backslash-separated, missing, or incorrectly cased path;
- an empty detector or rule;
- inventory count or SHA-256 drift;
- a persistent identifier declared freely renameable;
- a network, storage, database, application, infrastructure, or economic identifier
  without a compatible transition strategy;
- an uncertain status without a recorded uncertainty;
- a generated mirror that has no same-detector, same-value occurrence in a linked
  source rule.

Occurrence inventories use repository-relative path, detector, matched value, target,
and stable ordinal. They deliberately omit line numbers, so moving unchanged content
inside a file does not churn the registry. Adding, removing, or changing a sensitive
value still changes the locked count or hash.

## Source and generated mirrors

Authored sources and generated copies are separate compatibility concepts. Generated
i18n resolution, generated guide content, sitemap output, parity goldens, server
fixture mirrors, and the shipped content-ID golden are covered by a
`generated-mirror` rule. That rule lists its allowed source rules through
`sourceRuleIds`.

Regex detectors can select the semantic identifier through `valueGroup`, so formatting
around an ID is not mistaken for part of its value. Source comparison is exact by
default, with case folding only for case-insensitive detectors. A detector may declare
`sourceValueMode: family` only for a proven derived family whose concrete values are
constructed from registered source content. The shipped `heroic_*` item family is the
current example: the generator function is authored in simulation content, while the
complete concrete inventory is locked in the shipped-item golden.

Do not register each generated locale as an independent source. Change the authored
catalog or source content, regenerate through its existing generator, then refresh the
registry inventory. A detector found only in generated output is an error, because the
registry cannot explain where the value is authored.

The registry implementation files are excluded as a small, exact, hash-locked control
plane. They necessarily quote controlled values such as route, header, protocol, and
application-ID examples. The exclusion may not be widened without changing its path
inventory.

## Categories and strategies

The JSON schema is the authority for the complete controlled lists. The important
distinction is semantic:

- `display-label` is nonpersistent copy with evidence that it is separated from a
  technical identity.
- persistence, database, realm, storage, network, application, infrastructure,
  telemetry, economic, and Web3 categories are compatibility contracts.
- `unknown-sensitive` is intentionally conservative and requires an uncertainty plus
  investigation before change.
- `generated-mirror` points back to authored source rules and is never edited as a
  source.

`rename-display-only` applies only to justified nonpersistent display labels.
`keep-stable` is the default for identifiers whose old value remains authoritative.
Migration strategies describe the minimum future transition shape, not permission to
perform it. Economic and legal review strategies record an ownership gate without
inventing an economic, trademark, or licensing conclusion.

## Updating the registry

1. Inspect the authored source, all consumers, persistence boundaries, and local
   `CLAUDE.md` instructions.
2. Add or narrow a detector. Avoid a broad replacement-oriented pattern when a strict
   family or literal expresses the contract.
3. Add exactly one source rule for each new occurrence. Record owner, use, stability,
   persistence, exposure, rename policy, strategy, aliases, risks, evidence, tests,
   notes, and uncertainties.
4. If the occurrence is generated, link its mirror rule to a real authored source rule
   instead of treating the output as authoritative.
5. Run the verifier with `--json`. Review every occurrence and error, then update only
   the expected counts and hashes that correspond to the reviewed semantic change.
6. Run the targeted tests and the repository contribution gate required for the
   changed documentation and tooling surface.

Do not refresh a hash merely to make a failure disappear. Inventory drift is the
review prompt. First decide whether the new occurrence is a new identifier, a new
consumer of an existing contract, an accidental generated-only value, or an overly
broad detector.

## Commands

```powershell
node scripts/verify_identifier_compatibility.mjs
node scripts/verify_identifier_compatibility.mjs --json
npx vitest run tests/identifier_compatibility_registry.test.ts
```

The verifier prints occurrence totals and distributions by category and strategy. It
returns a nonzero exit code for any structural, semantic, coverage, source-mirror, or
inventory error.

## Future transition order

A later rebranding project should keep technical migrations independent from visible
copy. A safe plan will normally need separate work for:

1. display labels and brand assets;
2. public domains, email, redirects, OAuth callbacks, and update feeds;
3. desktop and mobile installed identities plus deep-link aliases;
4. client storage dual-read and dual-write windows;
5. database, Docker volume, service, and host-path migrations;
6. realm and persistent content IDs, which should normally retain stable internal
   values while gaining optional display aliases;
7. economic and Web3 identities, which require explicit domain review.

The current registry records the minimum compatibility posture for those decisions. It
does not execute any of them.
