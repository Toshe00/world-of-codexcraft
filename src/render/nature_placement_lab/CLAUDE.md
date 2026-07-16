# Nature Placement Lab

This directory owns the development-only in-world nature placement tool. Root,
`src/CLAUDE.md`, and `src/render/CLAUDE.md` remain authoritative.

- Keep activation fail-closed on both `import.meta.env.DEV` and
  `VITE_NATURE_PLACEMENT_LAB=1`.
- Keep data, validation, and JSON pure. Three.js belongs in `placement_render.ts`, DOM
  belongs in `placement_ui.ts`, and event coordination belongs in
  `placement_controller.ts`.
- Reuse `LABORATORY_NATURE_PALETTE_CONFIG` and `loadGltf`. Clone cached GLTF scenes before
  transforming them, and never dispose shared cached geometry or materials.
- Raycast only the live terrain. Never add laboratory objects to gameplay picking,
  collision, persistence, simulation, or network surfaces.
- Dispose every listener, DOM node, locally cloned ghost material, helper, and scene group.

