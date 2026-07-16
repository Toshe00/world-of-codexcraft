import { describe, expect, it } from 'vitest';
import { EditHistory } from '../src/render/nature_placement_lab/placement_history';
import {
  cloneNaturePlacementProjectSnapshot,
  createNaturePlacementProject,
  equalNaturePlacementProjectSnapshots,
  type NaturePlacementProject,
  type NatureProjectPlacement,
} from '../src/render/nature_placement_lab/placement_project_core';
import { NaturePlacementWorkspace } from '../src/render/nature_placement_lab/placement_workspace_core';

const NOW = () => new Date('2026-07-16T12:00:00.000Z');

function placement(
  id: string,
  assetId: NatureProjectPlacement['assetId'],
  layerId: string,
  x: number,
  z: number,
): NatureProjectPlacement {
  return {
    id,
    assetId,
    layerId,
    position: { x, y: 2, z },
    rotationY: 0,
    scale: 1,
    groundOffsetY: 0,
  };
}

function project(): NaturePlacementProject {
  const value = createNaturePlacementProject('project-workspace', 'Workspace', NOW);
  value.placements = [
    placement('lab-placement-001', 'BirchTree_1', 'layer-trees', -1, 0),
    placement('lab-placement-002', 'BirchTree_2', 'layer-trees', 1, 0),
    placement('lab-placement-003', 'Bush_Flowers', 'layer-bushes', 4, 4),
  ];
  return value;
}

const noSnapping = {
  position: false,
  rotation: false,
  scale: false,
  gridSize: 1 as const,
  rotationStep: 15 as const,
  scaleStep: 0.1 as const,
};

describe('nature placement workspace layers and selection', () => {
  it('creates, renames, and deletes only empty layers', () => {
    const workspace = new NaturePlacementWorkspace(project(), NOW);
    const layer = workspace.createLayer('Details');
    expect(layer?.name).toBe('Details');
    expect(workspace.renameLayer(layer?.layerId ?? '', 'Foreground')).toBe(true);
    expect(workspace.deleteEmptyLayer('layer-trees')).toBe(false);
    expect(workspace.deleteEmptyLayer(layer?.layerId ?? '')).toBe(true);
  });

  it('hides layers from rendering and keeps locked layers visible but immutable and unselectable', () => {
    const workspace = new NaturePlacementWorkspace(project(), NOW);
    expect(workspace.setLayerVisible('layer-bushes', false)).toBe(true);
    expect(workspace.visiblePlacements.map((entry) => entry.id)).not.toContain('lab-placement-003');
    workspace.selectByLayer('layer-bushes');
    expect(workspace.selectedPlacementIds).toEqual([]);

    expect(workspace.setLayerVisible('layer-bushes', true)).toBe(true);
    expect(workspace.setLayerLocked('layer-trees', true)).toBe(true);
    expect(workspace.visiblePlacements.map((entry) => entry.id)).toContain('lab-placement-001');
    expect(workspace.setLayerVisible('layer-trees', false)).toBe(false);
    expect(workspace.selectPlacement('lab-placement-001')).toBe(false);
    workspace.selectByLayer('layer-trees');
    expect(workspace.selectedPlacementIds).toEqual([]);
    expect(workspace.deleteLayerPlacements('layer-trees')).toBe(false);

    workspace.selectPlacement('lab-placement-003');
    expect(workspace.moveSelectionToLayer('layer-trees')).toBe(false);
    expect(workspace.duplicateSelected({ x: 1, y: 0, z: 1 })).not.toBeNull();
    workspace.selectByAsset('BirchTree_1');
    expect(workspace.selectedPlacementIds).toEqual([]);
  });

  it('supports additive, toggle, all, invert, layer, asset, and rectangle selection', () => {
    const workspace = new NaturePlacementWorkspace(project(), NOW);
    workspace.selectPlacement('lab-placement-001');
    workspace.selectPlacement('lab-placement-002', 'add');
    expect(workspace.selectedPlacementIds).toEqual(['lab-placement-001', 'lab-placement-002']);
    workspace.selectPlacement('lab-placement-001', 'toggle');
    expect(workspace.selectedPlacementIds).toEqual(['lab-placement-002']);
    workspace.selectByAsset('Bush_Flowers');
    expect(workspace.selectedPlacementIds).toEqual(['lab-placement-003']);
    workspace.selectByLayer('layer-trees');
    expect(workspace.selectedPlacementIds).toEqual(['lab-placement-001', 'lab-placement-002']);
    workspace.invertSelection();
    expect(workspace.selectedPlacementIds).toEqual(['lab-placement-003']);
    workspace.selectAll();
    expect(workspace.selectedPlacementIds).toHaveLength(3);
    workspace.deselectAll();
    workspace.selectInRectangle({ x: -2, y: 0, z: -1 }, { x: 2, y: 0, z: 1 });
    expect(workspace.selectedPlacementIds).toEqual(['lab-placement-001', 'lab-placement-002']);
  });
});

describe('nature placement workspace grouped transforms and groups', () => {
  it('moves, rotates around the center, scales relatively, and changes offsets atomically', () => {
    const workspace = new NaturePlacementWorkspace(project(), NOW);
    workspace.selectByLayer('layer-trees');
    expect(
      workspace.applySelectionTransform(
        {
          moveTo: { x: 10, y: 3, z: 10 },
          rotationDelta: Math.PI / 2,
          scaleFactor: 2,
          groundOffsetDelta: 0.25,
        },
        noSnapping,
        () => 0,
      ),
    ).toBe(true);
    const [left, right] = workspace.selectedPlacements;
    expect(left.position).toEqual({ x: 10, y: 3, z: 11 });
    expect(right.position).toEqual({ x: 10, y: 3, z: 9 });
    expect(left.rotationY).toBeCloseTo(Math.PI / 2);
    expect(right.rotationY).toBeCloseTo(Math.PI / 2);
    expect(left.scale).toBe(2);
    expect(right.scale).toBe(2);
    expect(left.groundOffsetY).toBe(0.25);
    expect(right.groundOffsetY).toBe(0.25);

    const beforeRejected = workspace.projectData;
    expect(
      workspace.applySelectionTransform(
        { scaleFactor: Number.POSITIVE_INFINITY },
        noSnapping,
        () => 0,
      ),
    ).toBe(false);
    expect(workspace.projectData).toEqual(beforeRejected);
  });

  it('duplicates and deletes multiple placements with one undo and redo snapshot', () => {
    const workspace = new NaturePlacementWorkspace(project(), NOW);
    const history = new EditHistory(
      cloneNaturePlacementProjectSnapshot,
      equalNaturePlacementProjectSnapshots,
    );
    workspace.selectByLayer('layer-trees');
    const before = workspace.editSnapshot;
    expect(workspace.duplicateSelected({ x: 2, y: 0, z: 2 })).toHaveLength(2);
    const afterDuplicate = workspace.editSnapshot;
    history.record(before, afterDuplicate);
    expect(workspace.placements).toHaveLength(5);
    const duplicateUndo = history.undo();
    expect(duplicateUndo).not.toBeNull();
    if (!duplicateUndo) throw new Error('duplicate undo snapshot missing');
    workspace.restoreEditSnapshot(duplicateUndo);
    expect(workspace.placements).toHaveLength(3);
    const duplicateRedo = history.redo();
    expect(duplicateRedo).not.toBeNull();
    if (!duplicateRedo) throw new Error('duplicate redo snapshot missing');
    workspace.restoreEditSnapshot(duplicateRedo);
    expect(workspace.placements).toHaveLength(5);

    const beforeDelete = workspace.editSnapshot;
    expect(workspace.deleteSelected()).toBe(true);
    const afterDelete = workspace.editSnapshot;
    history.record(beforeDelete, afterDelete);
    expect(workspace.placements).toHaveLength(3);
    const deleteUndo = history.undo();
    expect(deleteUndo).not.toBeNull();
    if (!deleteUndo) throw new Error('delete undo snapshot missing');
    workspace.restoreEditSnapshot(deleteUndo);
    expect(workspace.placements).toHaveLength(5);
  });

  it('creates, selects, duplicates, ungroups, and deletes logical groups independently of placements', () => {
    const workspace = new NaturePlacementWorkspace(project(), NOW);
    workspace.selectByLayer('layer-trees');
    const group = workspace.groupSelection('Tree Pair');
    expect(group?.placementIds).toEqual(['lab-placement-001', 'lab-placement-002']);
    workspace.deselectAll();
    expect(workspace.selectGroup(group?.groupId ?? '')).toBe(true);
    expect(workspace.selectedPlacementIds).toHaveLength(2);
    const copy = workspace.duplicateGroup(
      group?.groupId ?? '',
      { x: 3, y: 0, z: 3 },
      'Tree Pair Copy',
    );
    expect(copy?.placementIds).toHaveLength(2);
    expect(workspace.groups).toHaveLength(2);
    expect(workspace.deleteGroup(group?.groupId ?? '')).toBe(true);
    expect(workspace.placements).toHaveLength(5);
    expect(workspace.ungroupSelection()).toBe(true);
    expect(workspace.groups).toEqual([]);

    workspace.selectByLayer('layer-trees');
    const destructive = workspace.groupSelection('Remove Trees');
    expect(workspace.deleteGroupAndPlacements(destructive?.groupId ?? '')).toBe(true);
    expect(workspace.placements.every((entry) => entry.layerId !== 'layer-trees')).toBe(true);
  });
});
