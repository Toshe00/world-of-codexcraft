import type { NaturePlacementAssetId } from './placement_core';

// Captured through scripts/asset_pipeline/lib/glb.mjs inspectGlb, the same
// structural inspector used by the asset library. Keeping the six values beside
// the development palette avoids loading or parsing a GLB just for statistics.
export const NATURE_PLACEMENT_ASSET_METADATA: Readonly<
  Record<NaturePlacementAssetId, { mediaBytes: number; triangles: number }>
> = Object.freeze({
  BirchTree_1: Object.freeze({ mediaBytes: 147_792, triangles: 4_596 }),
  BirchTree_2: Object.freeze({ mediaBytes: 176_508, triangles: 7_660 }),
  Bush_Flowers: Object.freeze({ mediaBytes: 78_892, triangles: 478 }),
  Flower_1_Clump: Object.freeze({ mediaBytes: 44_492, triangles: 620 }),
  Grass_Large: Object.freeze({ mediaBytes: 5_648, triangles: 108 }),
  DeadTree_2: Object.freeze({ mediaBytes: 70_060, triangles: 5_344 }),
});
