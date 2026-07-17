# Starter Zone Plateau Lab

This directory owns the development-only reversible plateau laboratory. Keep its
pure patch format in `src/sim/start_zone_terrain_plateau.ts`, Three.js overlay
in `render.ts`, DOM in `ui.ts`, and coordination in `controller.ts`.

Activate only when both `import.meta.env.DEV` and
`VITE_START_ZONE_TERRAIN_EDIT_LAB=1` are true. Dispose every listener, DOM node,
geometry, material, and scene group. Never alter authored terrain data, entities,
assets, persistence, network state, or content records.
