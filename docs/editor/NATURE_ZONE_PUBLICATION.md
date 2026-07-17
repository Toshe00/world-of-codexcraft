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

## Why the normal map is unchanged

Phase 4G only produces, validates, previews, and exports a static visual package. No normal renderer
or map registry loads published package files. The lab itself remains fail-closed behind development
mode and `VITE_NATURE_PLACEMENT_LAB=1`. The normal game therefore keeps its existing world, spawns,
collision, simulation, network behavior, and asset loading.

Before a first activation, a later phase must define the map-owned package registry, deployment and
cache policy, terrain compatibility checks, streaming and render budgets, release provenance,
cross-version migration, and production rollback. Gameplay or collision data must remain in their
authoritative systems rather than entering this visual format.

## Rollback

During preview, select **Stop Preview**. For a local publication, remove the generated output file
or restore its previous local copy. No normal-map rollback is needed in phase 4G because no package
is registered or loaded by the game.
