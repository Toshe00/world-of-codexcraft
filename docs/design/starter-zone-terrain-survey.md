# Starter zone terrain survey

This document records the Phase 4I diagnostic contract and the reference measurement for
the built-in Eastbrook starter village. The laboratory is development-only and does not
change terrain, simulation, gameplay, spawns, colliders, assets, or player saves.

## Activation and manual inspection

Run the following commands from PowerShell:

```powershell
$env:VITE_START_ZONE_TERRAIN_LAB="1"
npm run dev
```

Choose Play Offline. The renderer loads the laboratory only when both
`import.meta.env.DEV` and `VITE_START_ZONE_TERRAIN_LAB=1` are true. Normal and production
builds do not import or update the laboratory.

## Surveyed area and height source

`buildStarterZoneSurveySource` finds the active zone containing the authored player start,
uses that zone's hub as the center, and derives a 5 meter aligned margin from its hub radius.
For the built-in world this resolves to:

- Center: X `0`, Z `0`, Eastbrook
- Bounds: X `-65` to `65`, Z `-65` to `65`
- Default grid: `1` meter
- Available grids: `0.5`, `1`, `2`, and `5` meters
- Height source: `terrainHeight(x, z, seed)` from `src/sim/world.ts`
- Built-in world seed: `20061`

The source is deliberately `terrainHeight`, the same function used by the live terrain mesh.
`groundHeight` is not used because it also introduces artificial walkable surfaces such as
docks, stands, and dungeon floors.

## Reference relief measurement

The checked-in reference uses the built-in world, seed `20061`, bounds X/Z `-65` to `65`,
and the default 1 meter grid. Slopes use a centered 1 meter gradient and the thresholds in
`TERRAIN_SURVEY_CRITERIA`.

| Measurement | Result |
| --- | ---: |
| Minimum height | -3.399 m |
| Maximum height | 5.572 m |
| Total height difference | 8.971 m |
| Average slope | 7.202 degrees |
| Maximum slope | 33.346 degrees |
| Relatively flat surface, below 5 degrees | 45.061% |
| Moderate surface, 5 to 12 degrees | 31.816% |
| Steep surface, above 12 degrees | 23.122% |

The laboratory recalculates the full statistics and compatible connected surfaces whenever
the resolution changes. The JSON export is the authority for a particular inspection
session and its saved anchors.

## Existing protected positions

The protected list is tool-only. It combines authored world layout with current live NPC
positions, keyed by stable template id rather than transient entity id.

The four current building footprints are centered at `(10, 12)`, `(-10, 10)`, `(12, -6)`,
and `(-16, -8)`. Their entrances use the render convention that the door sits on local `+Z`:

| Building | Entrance X | Entrance Z |
| --- | ---: | ---: |
| House at `(10, 12)` | 8.832 | 14.763 |
| House at `(-10, 10)` | -8.801 | 12.194 |
| Inn at `(12, -6)` | 14.364 | -8.581 |
| Chapel at `(-16, -8)` | -13.258 | -5.824 |

Other fixed anchors inside the survey are the well at `(0, 2)`, the central campfire at
`(3, -4)`, the player start at `(2, -2)`, the mailbox near `(7, -8)`, the Collapsed
Reliquary portal at `(-5, -52)`, and the Stolen Supply Crate quest point at `(58, -58)`.
The Hollow Crypt portal at `(80, 90)` is outside the starter-village survey.

The six main road polylines from `ZONE1_ROADS` are protected as 5 meter corridors while
they cross the survey. This preserves the north, east, southeast, northwest, southwest,
and northeast approaches instead of treating their flatter terrain as empty building space.

For seed `20061`, the live protected NPC set inside the area includes:

- The Merchant `(1.337, 8.040)`, Marshal Redbrook `(4, 6)`, Trader Wilkes
  `(-5.663, 1.540)`, Apothecary Lin `(8.211, -2.755)`, and Brother Aldric
  `(-12.663, -11.460)`
- Smith Haldren `(7, 16.5)`, Fisherman Brandt `(-16, 6)`, Foreman Odell `(-4, -14)`,
  Bursar Fernando `(13, 8)`, and Chronicler Saul `(15, -16)`
- FURY `(-11, 1)`, Brother Halven `(-3.663, -53.460)`, and the spirit-healer positions
  near `(-14, -14)` and `(4, -56)`

Quest-giver positions receive an additional quest-point radius. Runtime NPC positions are
used because collision-safe placement can move an NPC away from its authored coordinate.

## Footprints and anchor points

The diagnostic templates are small house `6 x 6`, medium house `10 x 8`, large house
`14 x 12`, central plaza `20 x 20`, and road `4 x 12`. They are measurements only and do
not instantiate buildings.

Each saved anchor uses the dedicated localStorage key
`dev.start-zone-terrain-survey.anchors.v1` and contains:

- Local id and name
- Position X, Y, Z and rotation Y
- Width and depth
- Average height, maximum height difference, and maximum slope
- Proposed type and notes

The allowed proposal types are `building-small`, `building-medium`, `building-large`,
`plaza`, `road`, `decorative`, and `avoid`. Anchors are never included in character or
account persistence.

## Deterministic JSON report

`buildTerrainSurveyReport` produces plain data and `serializeTerrainSurveyReport` writes a
stable, newline-terminated JSON document. Protected zones and anchors are sorted by id and
all floating-point values are normalized. No Three.js or DOM object enters the report.

The top-level format is:

```text
version
analyzedZone
samplingParameters
statistics
protectedZones
anchors
recommendations
```

The sampling parameters record the grid resolution, `terrainHeight` source, and slope
thresholds. Statistics include height and slope ranges, flat/moderate/steep percentages,
largest connected flat surfaces, and compatibility summaries for every diagnostic
footprint.

## Future village strategies

1. Whole village on a relief-adapted base or platform. This isolates the imported village
   from local height variation, but the base must bridge almost 9 meters of relief without
   blocking protected roads, NPC clearances, or existing entrances. A future platform must
   remain a separate visual structure and must not rewrite the terrain.
2. Separate buildings on recorded anchor points. Each footprint can be rotated and vertically
   corrected against a local surface. Roads, the square, and protected gameplay positions can
   remain where they are.
3. Whole village with its integrated floor. This is safe only when that floor matches the
   sampled terrain precisely across the complete village footprint. A broad match cannot be
   inferred from one center height or from a few corners.

The safest strategy for the measured relief is strategy 2, separate buildings on anchor
points. The 8.971 meter height range, 33.346 degree maximum slope, and 45.061 percent flat
coverage make a single integrated village floor unsafe. A full platform remains a fallback
only if later art and route-clearance studies justify its much larger footprint.

