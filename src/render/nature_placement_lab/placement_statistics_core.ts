import { type NaturePlacementAssetId, naturePlacementAsset } from './placement_core';
import type { NaturePlacementLayer, NaturePlacementProject } from './placement_project_core';

export interface NaturePlacementStatistics {
  totalPlacements: number;
  visiblePlacements: number;
  selectedPlacements: number;
  byAsset: ReadonlyArray<{ assetId: NaturePlacementAssetId; count: number }>;
  byLayer: ReadonlyArray<{ layerId: string; name: string; count: number }>;
  estimatedTriangles: number;
  estimatedUniqueAssetMediaBytes: number;
}

function layerMap(layers: readonly NaturePlacementLayer[]): Map<string, NaturePlacementLayer> {
  return new Map(layers.map((layer) => [layer.layerId, layer]));
}

export function calculateNaturePlacementStatistics(
  project: NaturePlacementProject,
  selectedPlacementIds: ReadonlySet<string>,
): NaturePlacementStatistics {
  const layers = layerMap(project.layers);
  const byAsset = new Map<NaturePlacementAssetId, number>();
  const byLayer = new Map(project.layers.map((layer) => [layer.layerId, 0]));
  const usedAssets = new Set<NaturePlacementAssetId>();
  let visiblePlacements = 0;
  let estimatedTriangles = 0;
  for (const placement of project.placements) {
    byAsset.set(placement.assetId, (byAsset.get(placement.assetId) ?? 0) + 1);
    byLayer.set(placement.layerId, (byLayer.get(placement.layerId) ?? 0) + 1);
    usedAssets.add(placement.assetId);
    estimatedTriangles += naturePlacementAsset(placement.assetId).estimatedTriangles;
    if (layers.get(placement.layerId)?.visible) visiblePlacements++;
  }
  let estimatedUniqueAssetMediaBytes = 0;
  for (const assetId of usedAssets) {
    estimatedUniqueAssetMediaBytes += naturePlacementAsset(assetId).mediaBytes;
  }
  return {
    totalPlacements: project.placements.length,
    visiblePlacements,
    selectedPlacements: project.placements.filter((placement) =>
      selectedPlacementIds.has(placement.id),
    ).length,
    byAsset: [...byAsset]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([assetId, count]) => ({ assetId, count })),
    byLayer: project.layers
      .map((layer) => ({
        layerId: layer.layerId,
        name: layer.name,
        count: byLayer.get(layer.layerId) ?? 0,
      }))
      .sort((left, right) => left.layerId.localeCompare(right.layerId)),
    estimatedTriangles,
    estimatedUniqueAssetMediaBytes,
  };
}
