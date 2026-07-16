# Historical save compatibility foundation

Phase 1C adds a read-only compatibility harness and a pure coordinate relocation
planner. Neither is connected to character join, character save, the world map, or a
network route. No production relocation policy or production safe point is defined.

All fixtures in this phase are artificial. Their names, row identifiers, realm value,
positions, and payloads are test data and must never be replaced with an actual player
save.

## Audited persistence boundaries

The production character boundary is split between relational columns and one JSONB
blob. The sources of truth are:

| Concern | Stored shape | Source and responsible symbols |
| --- | --- | --- |
| Character row | `id`, `account_id`, `name`, `class`, `realm`, `level`, `state` | `characters` in `server/db.ts` |
| Character state blob | `CharacterState` serialized as JSONB | `CharacterState`, `Sim.addPlayer`, and `Sim.serializeCharacter` in `src/sim/sim.ts` |
| Online load | Row identity plus `state` are passed to the simulation | `GameServer.join` in `server/game.ts` |
| Online write | Sanitized state is stringified and written to `characters.state` | `saveCharacterState` and `saveCharacterAndMarketState` in `server/db.ts` |
| Removed-content cleanup | State is sanitized before load and before write | `sanitizeRemovedZone1Content` in `src/sim/removed_zone1_content.ts` |
| World interpretation | Ground height and current zone are derived from coordinates | `Sim.groundPos` in `src/sim/sim.ts` and `zoneAt` in `src/sim/data.ts` |

The row owns the persistent character identifier, account identifier, name, class,
realm, and indexed level. `CharacterState` does not duplicate the row identifiers,
name, class, or realm. The row level and `CharacterState.level` are written together by
the current save functions.

### Character state fields

The required core contains `level`, `xp`, `copper`, `hp`, `resource`, `pos`, `facing`,
`equipment`, `inventory`, `questLog`, and `questsDone`.

The state also carries optional or additive groups, including:

- progression such as lifetime XP, honor, prestige, rested XP, played time, deeds,
  titles, renown, arena records, and lockouts;
- equipment instances, bags, bank contents and capacity, vendor buyback, and cooldowns;
- talents, saved loadouts, active loadout, pets, ghost and corpse state, jail state,
  and resurrection sickness;
- gathering proficiency, the legacy `professions` alias, craft skills, learned
  recipes, archetype state, and town focus;
- appearance skin data and pending skin selection fields;
- delve, heroic, mail welcome, companion, and daily progress.

The current professions compatibility rule is intentional. Reads prefer
`gatheringProficiency`, fall back to `professions`, and current saves write both names.

### Coordinates, zone, and sub-zone

The persisted position is two-dimensional: `pos.x`, `pos.z`, plus `facing`. World
height is not persisted. A live `y` value is reconstructed from terrain through
`Sim.groundPos`.

Zone and sub-zone are not fields in `CharacterState`. The current zone is derived from
`pos.z` by `zoneAt`. Sub-zone labels are presentation data derived from points of
interest by `nearestSubzone` in `src/ui/subzone.ts`. Realm is different: it is a
relational character-row field whose runtime source is `REALM` in `server/realm.ts`,
and it must not be inferred from a coordinate.

The existing join path contains special return handling for instance and delve
coordinate bands. It is runtime behavior, not a general map migration contract, and
the phase 1C planner does not call it.

### Data outside the character blob

- Guild membership, friendships, blocks, and other social graph records are stored in
  relational tables managed by `server/social_db.ts`. They are not serialized by
  `Sim.serializeCharacter`.
- Account-wide cosmetic ownership and weapon appearance selection are account data
  normalized by `normalizeAccountCosmetics` in `server/db.ts`. Character `skin` fields
  remain in `CharacterState`, but account ownership does not.
- External account currency balance and history are owned by the economy service.
  `server/claudium.ts` owns the game-server routes and `server/claudium_proxy.ts` owns
  the service boundary. These records are not character JSONB fields. Character
  `copper` is the local persisted gameplay currency covered by these fixtures.
- Chain-backed ownership is also outside `CharacterState`.

These boundaries mean a future end-to-end migration audit must cover the character
row, character JSONB, account ownership, external economy state, and social tables as
separate contracts. This phase exercises only the character row envelope and state
blob, without changing any schema.

### Versioning, offline storage, and previous fixtures

Production `CharacterState` currently has no format-version field. Compatibility is
implemented through optional fields, defaulting, sanitizers, aliases, and dual writes.
`sourceFormatVersion` in a historical fixture is descriptive test metadata only. It is
not written to production state and must not be mistaken for an active schema version.

The offline game creates session-local simulation state and does not persist a
character save. Browser storage is used for preferences, sessions, and editor maps,
not for an offline `CharacterState` save. Existing JSON fixtures and snapshots cover
terrain, parity, or focused features; they are not a historical character-save corpus.
The existing general fixture is `tests/fixtures/terrain_height_golden.json`, while
simulation parity goldens live under `tests/parity/golden`.

## Artificial fixture contract

Fixtures live in `tests/fixtures/historical_saves`. Each JSON file is deliberately
small and readable, with this envelope:

| Field | Meaning |
| --- | --- |
| `fixtureSchemaVersion` | Version of the test envelope, currently `1` |
| `synthetic` | Must be `true` |
| `scenario` | Stable test scenario name |
| `sourceFormatVersion` | Nullable descriptive source-era label |
| `character` | Artificial row fields plus a `CharacterState` payload |
| `expectedZoneIndex` | Test-only assertion against the ordered current zone list |
| `protectedStateFields` | Fields that must survive load and rewrite exactly |
| `preserveUnknownStateFields` | Explicit allowlist of namespaced extension keys preserved by the harness |

The current corpus covers:

| Fixture | Compatibility focus |
| --- | --- |
| `01-new-character.json` | Minimal new character |
| `02-advanced-inventory-quests.json` | Inventory, quest progress, and currency |
| `03-bank-professions.json` | Bank, legacy professions, craft skills, and recipes |
| `04-talents-equipment-skins.json` | Talents, loadouts, equipment instances, and character skins |
| `05-zone-boundary.json` | Position immediately before a current zone boundary |
| `06-future-map-candidate.json` | Position selected for an artificial future-policy relocation test |
| `07-legacy-optional-fields.json` | Missing optional fields and one explicitly allowed extension key |

`tests/helpers/historical_save_fixture.ts` loads the files, validates their artificial
envelope, calls the real `Sim.addPlayer` loader, and calls the real
`Sim.serializeCharacter` writer. It does not implement a parallel character
serializer.

Unknown JSONB fields require care. `sanitizeRemovedZone1Content` retains unrelated
keys, but `Sim.serializeCharacter` builds a closed `CharacterState` object after load,
so an arbitrary unknown field does not survive that full production round trip today.
The harness preserves only keys named in `preserveUnknownStateFields`. This avoids a
blind merge that could accidentally retain privileged or unsafe input. A production
extension-preservation policy remains an activation prerequisite, not behavior added
by this phase.

Fixture-only extension keys must use the reserved `fixture-extension:` prefix. This
namespace is forbidden for canonical production `CharacterState` fields. The harness
also rejects a prefixed key if the current canonical serializer emits it.

### Adding a historical fixture

1. Copy the closest fixture and keep `synthetic: true`.
2. Use invented names, row identifiers, realm values, positions, and state. Never use
   an export, log excerpt, database row, or player-provided save.
3. Keep only the fields needed to describe the compatibility case. Missing optional
   fields are useful evidence and should not be filled without a reason.
4. List every field whose exact value is part of the case in `protectedStateFields`.
5. Add a `fixture-extension:` unknown key to `preserveUnknownStateFields` only after
   documenting why that extension is safe to retain. Do not use this list for
   privilege, moderation, authentication, or operator fields.
6. Add the scenario name to `tests/historical_save_fixtures.test.ts`, run the targeted
   test, and inspect the normalized output if the equality assertion fails. A real
   loader normalization should be represented explicitly, not hidden by weakening the
   protected field list.

## Pure coordinate relocation planner

`src/sim/position_relocation.ts` exposes `planPositionRelocation`. The caller supplies
the historical position, source zone, requested policy identifier, and the complete
policy registry. The module has no policy registry of its own and imports no DOM,
rendering, database, network, or simulation runtime code.

Each policy has a stable `id`, a source-zone map, explicit rectangular valid regions,
explicit relocation regions, optional explicit zone fallbacks, and an explicit list of
safe points. A relocation references a safe point by identifier. The safe point zone
must match the mapping target zone.

The planner can return:

| Status | Meaning |
| --- | --- |
| `position-valid` | The position belongs to an explicit valid region and is copied unchanged |
| `relocate-to-safe-point` | One explicit relocation region selects one explicit safe point |
| `relocate-to-zone-fallback` | The policy explicitly declares a fallback safe point |
| `reject-missing-mapping` | Policy, source zone, or safe-point data is missing or inconsistent |
| `manual-review-required` | Coordinates are non-finite, mappings are ambiguous, or no explicit destination applies |

Every decision includes the original position, nullable proposed position, reason,
requested policy identifier, source zone, nullable target zone, and a nullable
`changeRequired` indicator. Non-finite coordinates never receive a proposal. Unknown
zones and unknown policy versions never receive an invented destination. Valid
positions keep every supplied coordinate and orientation. Relocations preserve facing
only when the selected mapping explicitly allows it.

Policy and zone lookups accept own properties only. A malformed or non-finite policy
region is rejected before a valid-region, relocation, or fallback decision can run.

The policies in `tests/position_relocation.test.ts` are entirely artificial. They
exist only to pin planner behavior and are not exported to the game.

### Versioning a future policy

1. Choose a new immutable policy identifier. Never edit the meaning of an identifier
   that has already been used for an audit or migration run.
2. Define source-zone mappings from an authoritative old-map inventory.
3. Define valid regions first. A position in one of those regions must remain
   unchanged.
4. Define every safe point explicitly and verify it against the target map. Do not
   calculate or randomize safe points.
5. Add relocation regions and fallbacks only where product and world owners have
   approved an exact destination.
6. Run deterministic fixture tests and a read-only dry run. Store the selected policy
   identifier with any future migration report so the decision can be reproduced.

## Why production activation is blocked

Phase 1C intentionally provides no production policy and no runtime call site. Future
activation requires, in a separate reviewed change:

- an authoritative future-map version and immutable old-to-new zone inventory;
- reviewed target-map valid regions and safe points, including orientation and ground
  height validation;
- a decision for unknown-field preservation across mixed server versions;
- representative anonymized dry-run evidence and disposable-database tests;
- idempotence, retry, lease, transaction, backup, rollback, and partial-failure design;
- explicit treatment of account ownership, external economy records, social data, and
  any cross-realm move;
- security, persistence, database-performance, world-architecture, and test-coverage
  review;
- observability for rejected, relocated, unchanged, and manual-review decisions;
- an approved deployment and rollback plan before any join or save path can call the
  planner.

Until those conditions are met, the fixtures and planner are test and read-only tool
infrastructure only.
