# Starter Zone Terrain Survey

This directory owns the development-only starter-zone terrain diagnostic. Root,
`src/CLAUDE.md`, and `src/render/CLAUDE.md` remain authoritative.

- Keep activation fail-closed on both `import.meta.env.DEV` and
  `VITE_START_ZONE_TERRAIN_LAB=1`.
- Keep terrain math, validation, anchors, and JSON in `terrain_survey_core.ts`.
  Three.js belongs in `terrain_survey_render.ts`, DOM belongs in
  `terrain_survey_ui.ts`, and event coordination belongs in
  `terrain_survey_controller.ts`.
- Sample the injected live `terrainHeight` function. Never derive a second terrain
  formula or write to active world content.
- Scene objects are diagnostic overlays only. Never register them with gameplay
  picking, collision, persistence, simulation, or network surfaces.
- Dispose every listener, DOM node, geometry, material, and scene group.

