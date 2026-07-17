import {
  cloneNaturePlacement,
  type NaturePlacement,
  type NaturePlacementAssetId,
  type NaturePlacementPoint,
} from './placement_core';

export const NATURE_PLACEMENT_PROJECT_VERSION = 2 as const;

export const NATURE_PLACEMENT_PROJECT_LIMITS = Object.freeze({
  maxProjects: 50,
  maxLayers: 50,
  maxGroups: 100,
});

export interface NaturePlacementLayer {
  layerId: string;
  name: string;
  visible: boolean;
  locked: boolean;
}

export interface NaturePlacementGroup {
  groupId: string;
  name: string;
  placementIds: string[];
}

export interface NaturePlacementWorkArea {
  center?: NaturePlacementPoint;
  width?: number;
  depth?: number;
  notes?: string;
}

export interface NatureProjectPlacement extends NaturePlacement {
  layerId: string;
}

export interface NaturePlacementProject {
  version: typeof NATURE_PLACEMENT_PROJECT_VERSION;
  projectId: string;
  name: string;
  createdAt: string;
  modifiedAt: string;
  placements: NatureProjectPlacement[];
  layers: NaturePlacementLayer[];
  groups: NaturePlacementGroup[];
  workArea?: NaturePlacementWorkArea;
}

export interface NaturePlacementProjectSnapshot {
  project: NaturePlacementProject;
  selectedPlacementIds: string[];
}

const DEFAULT_LAYER_ROWS = [
  ['layer-trees', 'Trees'],
  ['layer-bushes', 'Bushes'],
  ['layer-flowers', 'Flowers'],
  ['layer-grass', 'Grass'],
  ['layer-dead-nature', 'Dead Nature'],
  ['layer-other', 'Other'],
] as const;

export const DEFAULT_NATURE_PLACEMENT_PROJECT_NAME = 'Untitled Project';
export const IMPORTED_NATURE_PLACEMENT_PROJECT_NAME = 'Imported Placements';

export const DEFAULT_NATURE_PLACEMENT_LAYERS: readonly NaturePlacementLayer[] = Object.freeze(
  DEFAULT_LAYER_ROWS.map(([layerId, name]) =>
    Object.freeze({ layerId, name, visible: true, locked: false }),
  ),
);

export function defaultLayerIdForAsset(assetId: NaturePlacementAssetId): string {
  if (assetId === 'BirchTree_1' || assetId === 'BirchTree_2') return 'layer-trees';
  if (assetId === 'Bush_Flowers') return 'layer-bushes';
  if (assetId === 'Flower_1_Clump') return 'layer-flowers';
  if (assetId === 'Grass_Large') return 'layer-grass';
  if (assetId === 'DeadTree_2') return 'layer-dead-nature';
  return 'layer-other';
}

export function cloneNaturePlacementLayer(layer: NaturePlacementLayer): NaturePlacementLayer {
  return { ...layer };
}

export function cloneNaturePlacementGroup(group: NaturePlacementGroup): NaturePlacementGroup {
  return { ...group, placementIds: [...group.placementIds] };
}

export function cloneNatureProjectPlacement(
  placement: NatureProjectPlacement,
): NatureProjectPlacement {
  return { ...cloneNaturePlacement(placement), layerId: placement.layerId };
}

export function cloneNaturePlacementProject(
  project: NaturePlacementProject,
): NaturePlacementProject {
  return {
    ...project,
    placements: project.placements.map(cloneNatureProjectPlacement),
    layers: project.layers.map(cloneNaturePlacementLayer),
    groups: project.groups.map(cloneNaturePlacementGroup),
    ...(project.workArea
      ? {
          workArea: {
            ...project.workArea,
            ...(project.workArea.center ? { center: { ...project.workArea.center } } : {}),
          },
        }
      : {}),
  };
}

export function cloneNaturePlacementProjectSnapshot(
  snapshot: NaturePlacementProjectSnapshot,
): NaturePlacementProjectSnapshot {
  return {
    project: cloneNaturePlacementProject(snapshot.project),
    selectedPlacementIds: [...snapshot.selectedPlacementIds],
  };
}

export function equalNaturePlacementProjectSnapshots(
  left: NaturePlacementProjectSnapshot,
  right: NaturePlacementProjectSnapshot,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isoNow(now: () => Date): string {
  return now().toISOString();
}

export function createNaturePlacementProject(
  projectId: string,
  name: string,
  now: () => Date = () => new Date(),
  workArea?: NaturePlacementWorkArea,
): NaturePlacementProject {
  const timestamp = isoNow(now);
  return {
    version: NATURE_PLACEMENT_PROJECT_VERSION,
    projectId,
    name,
    createdAt: timestamp,
    modifiedAt: timestamp,
    placements: [],
    layers: DEFAULT_NATURE_PLACEMENT_LAYERS.map(cloneNaturePlacementLayer),
    groups: [],
    ...(workArea
      ? {
          workArea: { ...workArea, ...(workArea.center ? { center: { ...workArea.center } } : {}) },
        }
      : {}),
  };
}

export function migrateLegacyPlacementsToProject(
  placements: readonly NaturePlacement[],
  projectId: string,
  name: string,
  now: () => Date = () => new Date(),
): NaturePlacementProject {
  const project = createNaturePlacementProject(projectId, name, now);
  project.placements = placements.map((placement) => ({
    ...cloneNaturePlacement(placement),
    layerId: defaultLayerIdForAsset(placement.assetId),
  }));
  return project;
}

export function selectionCenter(
  placements: readonly NatureProjectPlacement[],
): NaturePlacementPoint | null {
  if (placements.length === 0) return null;
  const sum = placements.reduce(
    (value, placement) => ({
      x: value.x + placement.position.x,
      y: value.y + placement.position.y,
      z: value.z + placement.position.z,
    }),
    { x: 0, y: 0, z: 0 },
  );
  return {
    x: sum.x / placements.length,
    y: sum.y / placements.length,
    z: sum.z / placements.length,
  };
}
