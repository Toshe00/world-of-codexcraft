# Published zone laboratory runtime

This directory owns development-only loading of compiled nature zone packages.

- Keep the registry and package behind the literal dynamic-import gate in `renderer.ts`.
- Treat registry paths as exact keys into the checked-in package allowlist. Never fetch or import a path assembled from data.
- Reuse `validateNatureZonePackage` and the shared `loadGltf` cache.
- Keep proximity decisions in the Three-free core and instance ownership in the renderer adapter.
- Unloading removes only cloned scene nodes. Never dispose or evict shared GLB geometry, materials, or cache entries.
- No simulation, gameplay, persistence, server, or network dependency belongs here.
