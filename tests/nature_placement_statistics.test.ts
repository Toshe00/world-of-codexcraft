import { describe, expect, it } from 'vitest';
import { createNaturePlacementProject } from '../src/render/nature_placement_lab/placement_project_core';
import { calculateNaturePlacementStatistics } from '../src/render/nature_placement_lab/placement_statistics_core';

describe('nature placement scene statistics', () => {
  it('counts total, visible, selected, per-asset, per-layer, triangles, and unique media', () => {
    const project = createNaturePlacementProject(
      'project-statistics',
      'Statistics',
      () => new Date('2026-07-16T12:00:00.000Z'),
    );
    const bushes = project.layers.find((layer) => layer.layerId === 'layer-bushes');
    expect(bushes).toBeDefined();
    if (!bushes) throw new Error('default bushes layer missing');
    bushes.visible = false;
    project.placements = [
      {
        id: 'lab-placement-001',
        assetId: 'BirchTree_1',
        layerId: 'layer-trees',
        position: { x: 0, y: 0, z: 0 },
        rotationY: 0,
        scale: 1,
        groundOffsetY: 0,
      },
      {
        id: 'lab-placement-002',
        assetId: 'BirchTree_1',
        layerId: 'layer-trees',
        position: { x: 1, y: 0, z: 0 },
        rotationY: 0,
        scale: 1,
        groundOffsetY: 0,
      },
      {
        id: 'lab-placement-003',
        assetId: 'Bush_Flowers',
        layerId: 'layer-bushes',
        position: { x: 2, y: 0, z: 0 },
        rotationY: 0,
        scale: 1,
        groundOffsetY: 0,
      },
    ];

    const statistics = calculateNaturePlacementStatistics(
      project,
      new Set(['lab-placement-002', 'missing']),
    );
    expect(statistics).toMatchObject({
      totalPlacements: 3,
      visiblePlacements: 2,
      selectedPlacements: 1,
      byAsset: [
        { assetId: 'BirchTree_1', count: 2 },
        { assetId: 'Bush_Flowers', count: 1 },
      ],
      estimatedTriangles: 4_596 * 2 + 478,
      estimatedUniqueAssetMediaBytes: 147_792 + 78_892,
    });
    expect(statistics.byLayer.find((entry) => entry.layerId === 'layer-trees')?.count).toBe(2);
    expect(statistics.byLayer.find((entry) => entry.layerId === 'layer-bushes')?.count).toBe(1);
  });
});
