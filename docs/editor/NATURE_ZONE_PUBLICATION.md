# Nature Zone Publication

Nature Placement Lab stores editable projects. A project contains editor state such as layers,
visibility, locks, groups, work-area notes, and timestamps. A published nature zone package is a
smaller deterministic runtime document. It contains only visual placements and the metadata needed
to validate and preview them.

The package is not a gameplay zone. It contains no NPC, monster, spawn, collider, harvestable,
quest trigger, server datum, persistent gameplay identifier, or executable script. Only the six
assets already allowed by Nature Placement Lab can appear.

## Package format

Version 1 uses this exact top-level shape:

```json
{
  "version": 1,
  "zoneId": "laboratory-nature-zone",
  "name": "Laboratory Nature Zone",
  "sourceProjectId": "project-id",
  "sourceProjectVersion": 2,
  "coordinateSpace": "world",
  "includedLayerIds": ["layer-bushes", "layer-trees"],
  "bounds": {
    "minX": 0,
    "maxX": 100,
    "minY": 0,
    "maxY": 20,
    "minZ": 0,
    "maxZ": 100
  },
  "placements": [],
  "assetSummary": [],
  "statistics": {
    "placementCount": 0,
    "estimatedTriangles": 0,
    "uniqueMediaBytes": 0
  }
}
```

Compiled packages contain at least one placement. Each placement has only `id`, `assetId`,
`layerId`, `position`, `rotationY`, `scale`, and `groundOffsetY`. Placements are sorted by `id`,
included layer ids and asset summaries are sorted by id, and serialization ends with one newline.
No current date is added.

Bounds describe placement anchors in world coordinates. X and Z use the stored position. Y uses
the rendered anchor, `position.y + groundOffsetY`. Bounds do not claim to be mesh AABBs because the
pure compiler does not load GLB geometry.

`estimatedTriangles` is the sum of the checked-in triangle count for every placement.
`uniqueMediaBytes` counts each used asset file once. `assetSummary` records the relative asset path,
placement count, aggregate triangle estimate, and media bytes for every used asset.

## Choose layers

Open the collapsible **Publication Preview** section. Enter a strict kebab-case Zone ID, enter the
visible name, and check every layer that should be published. Compilation includes only those
explicit layer ids. Hidden layers are included only when they are checked. Unchecked hidden layers,
editor groups, history, preferences, ghost objects, and work-area data are excluded.

The compiler rejects an empty project, an empty layer selection, unknown or duplicate layer ids,
an empty compiled result, unknown assets, invalid transforms, and more than 500 placements.

## Build and preview

Select **Build Zone Package** to validate the current project with the existing project validator,
compile it, and validate the resulting package with the strict runtime schema.

Select **Preview Compiled Zone** to enter read-only **Published Zone Preview** mode. The lab hides
editable instances, the grid, selection helpers, and the ghost. It creates a separate Three.js
group from the validated package placements and applies the same transform path as the editor.
Selection and editing input are disabled. **Stop Preview** removes every preview instance and
restores the editor without changing the project.

Build, preview, stop, and zone export do not write local storage and do not make network requests.
If the editor project changes after compilation, the preview and export remain the last compiled
package until **Build Zone Package** is selected again.

## Export

Select **Export Zone Package** to download `<zoneId>.json`. Two exports of the same compiled package
are byte-identical. Project JSON export remains a separate editor operation.

## Local Node publisher

Run the publisher from the repository root:

```sh
npx tsx scripts/nature_placement/publish_zone.ts --input path/to/project.json --zone-id laboratory-nature-zone --name "Laboratory Nature Zone" --output tmp/published-zones/laboratory-nature-zone.json
```

By default the command publishes every project layer. To publish an explicit subset, add:

```sh
--layers layer-trees,layer-bushes
```

The output path is required and must be local. Existing files are rejected. Pass `--force` only
when replacement is intentional. The tool creates the output directory and prints placement,
triangle, and unique-media statistics. It does not edit a map, server file, production manifest,
package file, or Git state.

## Laboratory runtime registry

Phase 4H adds the machine-readable development registry at
`config/laboratory-published-zones.registry.json`. A registry entry records the `zoneId`, checked-in
package path, `laboratory` status, enabled state, supported platforms, reason, and rollback strategy.
It must explicitly keep production activation disabled.

The client validates the whole registry before selecting an entry. Validation rejects duplicate ids,
unknown statuses or platforms, production activation, remote or absolute paths, folder traversal,
missing packages, invalid packages, and a package whose `zoneId` does not match its entry. A package
path is only an exact key into the checked-in allowlist in `published_zone_catalog.ts`. It is never
used to build an import path or URL.

The first runtime artifact is generated from the checked-in editor fixture, not authored by hand:

- Project: `tests/fixtures/nature_placement/start-zone-nature-lab.project.json`
- Package: `config/laboratory-published-zones/start-zone-nature-lab.zone.json`
- Zone id: `start-zone-nature-lab`
- Bounds: X `20.2` to `26`, Y `-0.30549507576210355` to `0.49466625319201574`, Z `-45.5` to `-39.8`

The group is on the real terrain near the built-in player start at X `2`, Z `-2`. It stays outside
the village square, buildings, merchants, campfire, portals, quest props, and primary travel roads.
It is purely additive and contains one placement of each of the six existing laboratory assets.

## Runtime activation and lifecycle

The runtime is available only when both of these conditions are true:

- `import.meta.env.DEV`
- `VITE_PUBLISHED_ZONE_LAB=1`

`VITE_PUBLISHED_ZONE_ID` selects an enabled allowlisted registry entry. If it is omitted, the local
development default is `start-zone-nature-lab`. An unknown id produces the `invalid` state and loads
nothing. No value from a save, server, remote player, URL, or filesystem path reaches this selector.

The `Renderer` dynamically imports the laboratory runtime only inside the literal development and
feature-flag branch. The editor viewport is excluded. With the laboratory disabled, the registry and
package module are not evaluated, no package GLB is requested or preloaded, no indicator or language
listener is created, and no additional instance exists.

The runtime measures the local player's XZ distance to the compiled bounds. It loads at 60 world
units or nearer and unloads only beyond 90 units. This hysteresis prevents boundary churn. A logical
generation token cancels an obsolete in-flight load before it can attach instances. GLB requests use
the existing shared `loadGltf` promise cache. Unloading removes cloned groups and references without
disposing or evicting shared geometries, materials, or cached GLBs.

The small development indicator shows the zone id and one of `inactive`, `loading`, `loaded`,
`unloaded`, or `invalid`. Its English and French text uses the existing i18n catalog and updates on
the normal language-change event. Destruction removes both the indicator and its event listener.

## Manual test

From PowerShell at the repository root, run exactly:

```powershell
$env:VITE_PUBLISHED_ZONE_LAB="1"
$env:VITE_PUBLISHED_ZONE_ID="start-zone-nature-lab"
npm run dev
```

Choose **Play Offline**, then walk southeast from Eastbrook toward the registered bounds. The
indicator should move from `loading` to `loaded`, all six placements should appear on the real
terrain, and walking more than 90 units from the bounds should unload them.

For the normal-mode comparison, use a fresh PowerShell session with neither variable set and run
`npm run dev`. The original map, asset requests, instances, events, HUD, simulation, persistence,
and networking remain unchanged.

## Rollback

The immediate rollback is to unset `VITE_PUBLISHED_ZONE_LAB`, set the registry entry's `enabled`
field to `false`, or remove its exact path from the local package allowlist, then restart the
development client. No map, simulation, save, server, or network rollback is required because Phase
4H never replaces or mutates the normal map.

Before a complete village can ship, the editor project still needs the full approved village asset
set, a reviewed full-layout package, terrain and landmark compatibility checks, render and streaming
budgets, release provenance, production deployment policy, cross-version migration, and a production
rollback plan. Gameplay, collision, spawns, NPCs, quests, and persistence must remain in their
authoritative systems rather than entering this visual package format.
