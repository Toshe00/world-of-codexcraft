import { describe, expect, it, vi } from 'vitest';
import { NaturePlacementController } from '../src/render/nature_placement_lab/placement_controller';
import { naturePlacementAsset } from '../src/render/nature_placement_lab/placement_core';
import { serializeNaturePlacements } from '../src/render/nature_placement_lab/placement_json';
import { NATURE_PLACEMENT_PROJECTS_KEY } from '../src/render/nature_placement_lab/placement_project_storage';

function memoryStorage() {
  const values = new Map<string, string>();
  let failWrites = false;
  return {
    storage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (failWrites) throw new Error('storage unavailable');
        values.set(key, value);
      },
    } as unknown as Storage,
    values,
    failWrites: () => {
      failWrites = true;
    },
  };
}

function makeController(storage: Storage | null = null) {
  let projected = { x: 1, y: 2, z: 3 };
  let pickedId: string | null = null;
  const render = {
    clearGhost: vi.fn(),
    dispose: vi.fn(),
    pickPlacement: vi.fn(() => pickedId),
    sync: vi.fn(),
    syncGrid: vi.fn(),
    syncSelectionRectangle: vi.fn(),
    updateGhost: vi.fn(),
  };
  const ui = { dispose: vi.fn(), update: vi.fn() };
  const eventWindow = new EventTarget();
  const controller = new NaturePlacementController({
    canvas: new EventTarget() as HTMLCanvasElement,
    createUi: () => ui,
    eventWindow: eventWindow as Window,
    initialWorkCenter: { x: 0, y: 0, z: 0 },
    preferenceStorage: storage,
    projectStorage: storage,
    projectTerrain: () => ({ ...projected }),
    render,
    sampleGroundY: (x, z) => x - z + 10,
  });
  const place = () => {
    controller.selectAsset('BirchTree_1');
    controller.startPlacement();
    controller.primaryDown(10, 20);
    const placement = controller.state.placements.at(-1);
    if (!placement) throw new Error('test placement failed');
    controller.state.selectPlacement(placement.id);
    pickedId = placement.id;
    return placement;
  };
  return {
    controller,
    blur: () => eventWindow.dispatchEvent(new Event('blur')),
    place,
    pressEscape: () => {
      const event = new Event('keydown', { cancelable: true });
      Object.defineProperties(event, {
        code: { value: 'Escape' },
        key: { value: 'Escape' },
      });
      eventWindow.dispatchEvent(event);
    },
    render,
    setPickedId: (id: string | null) => {
      pickedId = id;
    },
    setProjected: (next: { x: number; y: number; z: number }) => {
      projected = next;
    },
    ui,
  };
}

describe('nature placement controller history transactions', () => {
  it('undoes and redoes one placement', () => {
    const { controller, place } = makeController();
    const placement = place();

    controller.undo();
    expect(controller.state.placements).toEqual([]);
    controller.redo();
    expect(controller.state.placements).toEqual([placement]);
  });

  it('undoes a deletion and restores its selection', () => {
    const { controller, place } = makeController();
    const placement = place();
    controller.deleteSelected();
    expect(controller.state.placements).toEqual([]);

    controller.undo();
    expect(controller.state.placements).toEqual([placement]);
    expect(controller.state.selectedPlacementId).toBe(placement.id);
  });

  it('undoes Clear All as one action', () => {
    const { controller, place } = makeController();
    const placement = place();
    controller.clear();
    expect(controller.state.placements).toEqual([]);

    controller.undo();
    expect(controller.state.placements).toEqual([placement]);
  });

  it('undoes and redoes an exact phase 4D JSON import as one action', () => {
    const { controller, place } = makeController();
    const previous = place();
    const imported = [
      {
        id: 'lab-placement-imported',
        assetId: 'Bush_Flowers' as const,
        position: { x: 8.125, y: 4.75, z: -6.375 },
        rotationY: 1.234,
        scale: 1.37,
        groundOffsetY: -0.12,
      },
    ];
    controller.importJson(serializeNaturePlacements(imported));
    expect(controller.state.placements).toEqual([{ ...imported[0], layerId: 'layer-bushes' }]);

    controller.undo();
    expect(controller.state.placements).toEqual([previous]);
    controller.redo();
    expect(controller.state.placements).toEqual([{ ...imported[0], layerId: 'layer-bushes' }]);
  });

  it('removes and restores an imported project in localStorage through undo and redo', () => {
    const { storage, values } = memoryStorage();
    const { controller } = makeController(storage);
    const imported = [
      {
        id: 'lab-placement-imported',
        assetId: 'Grass_Large' as const,
        position: { x: 1, y: 2, z: 3 },
        rotationY: 0,
        scale: 1,
        groundOffsetY: 0,
      },
    ];

    controller.importJson(serializeNaturePlacements(imported));
    const projectCount = () =>
      (
        JSON.parse(values.get(NATURE_PLACEMENT_PROJECTS_KEY) ?? '{}') as {
          projects?: unknown[];
        }
      ).projects?.length ?? 0;
    expect(projectCount()).toBe(2);
    controller.undo();
    expect(projectCount()).toBe(1);
    controller.redo();
    expect(projectCount()).toBe(2);
  });

  it('leaves workspace and history unchanged when imported project persistence fails', () => {
    const memory = memoryStorage();
    const { controller, place } = makeController(memory.storage);
    const previous = place();
    memory.failWrites();

    controller.importJson(
      serializeNaturePlacements([
        {
          id: 'lab-placement-imported',
          assetId: 'Grass_Large',
          position: { x: 1, y: 2, z: 3 },
          rotationY: 0,
          scale: 1,
          groundOffsetY: 0,
        },
      ]),
    );

    expect(controller.state.placements).toEqual([previous]);
    controller.undo();
    expect(controller.state.placements).toEqual([]);
  });

  it('renames the current unsaved workspace without losing placements', () => {
    const memory = memoryStorage();
    const { controller, place } = makeController(memory.storage);
    const previous = place();

    controller.renameProject('Renamed Workspace');

    expect(controller.state.projectData.name).toBe('Renamed Workspace');
    expect(controller.state.placements).toEqual([previous]);
    const stored = JSON.parse(memory.values.get(NATURE_PLACEMENT_PROJECTS_KEY) ?? '{}') as {
      projects?: Array<{ name: string; placements: unknown[] }>;
    };
    expect(stored.projects?.[0]).toMatchObject({
      name: 'Renamed Workspace',
      placements: [previous],
    });
  });

  it('duplicates with a new id and undoes duplication in one action', () => {
    const { controller, place } = makeController();
    const original = place();
    controller.duplicateSelected();

    const duplicate = controller.state.selectedPlacement;
    expect(controller.state.placements).toHaveLength(2);
    expect(duplicate).toMatchObject({
      assetId: original.assetId,
      rotationY: original.rotationY,
      scale: original.scale,
      groundOffsetY: original.groundOffsetY,
    });
    expect(duplicate?.id).not.toBe(original.id);
    controller.undo();
    expect(controller.state.placements).toEqual([original]);
  });

  it('records a complete multi-move drag as one undo action', () => {
    const { controller, place, setProjected } = makeController();
    const original = place();
    controller.primaryDown(10, 20);
    setProjected({ x: 4, y: 5, z: 6 });
    controller.pointerMove(30, 40);
    setProjected({ x: 7, y: 8, z: 9 });
    controller.pointerMove(50, 60);
    controller.pointerUp();
    expect(controller.state.selectedPlacement?.position).toEqual({ x: 7, y: 8, z: 9 });

    controller.undo();
    expect(controller.state.selectedPlacement?.position).toEqual(original.position);
    controller.undo();
    expect(controller.state.placements).toEqual([]);
  });

  it('drags a multi-selection without collapsing its relative layout onto the pointer', () => {
    const { controller, place, setPickedId, setProjected } = makeController();
    const first = place();
    setProjected({ x: 5, y: 2, z: 3 });
    const second = place();
    controller.state.selectIds([first.id, second.id]);
    setPickedId(first.id);
    setProjected(first.position);

    controller.primaryDown(10, 20);
    setProjected({ x: 3, y: 4, z: 5 });
    controller.pointerMove(30, 40);
    controller.pointerUp();

    expect(controller.state.placements.map((placement) => placement.position)).toEqual([
      { x: 3, y: 4, z: 5 },
      { x: 7, y: 4, z: 5 },
    ]);
  });

  it('cancels a drag with Escape and does not record the reverted movement', () => {
    const { controller, place, pressEscape, setProjected } = makeController();
    const original = place();
    controller.primaryDown(10, 20);
    setProjected({ x: 7, y: 8, z: 9 });
    controller.pointerMove(50, 60);
    expect(controller.state.selectedPlacement?.position).toEqual({ x: 7, y: 8, z: 9 });

    pressEscape();
    controller.pointerUp();
    expect(controller.state.selectedPlacement?.position).toEqual(original.position);
    controller.undo();
    expect(controller.state.placements).toEqual([]);
  });

  it('uses the injected existing terrain sampler for Place On Ground', () => {
    const { controller, place } = makeController();
    place();
    controller.placeOnGround();
    expect(controller.state.selectedPlacement?.position).toEqual({ x: 1, y: 8, z: 3 });
  });

  it('validates the complete inspector payload before mutating and honors active snaps', () => {
    const { controller, place } = makeController();
    const original = place();
    controller.applyTransform({
      positionX: 'NaN',
      positionY: '4',
      positionZ: '5',
      rotationY: '30',
      scale: '1.5',
      groundOffsetY: '0.2',
    });
    expect(controller.state.selectedPlacement).toEqual(original);

    controller.setPreferences({
      gridSize: 0.5,
      rotationStep: 15,
      scaleStep: 0.25,
      snapPosition: true,
      snapRotation: true,
      snapScale: true,
    });
    controller.applyTransform({
      positionX: '1.24',
      positionY: '4.37',
      positionZ: '-1.76',
      rotationY: '22',
      scale: '1.13',
      groundOffsetY: '0.2',
    });
    expect(controller.state.selectedPlacement).toMatchObject({
      position: { x: 1, y: 4.37, z: -2 },
      scale: 1.25,
      groundOffsetY: 0.2,
    });
    expect(((controller.state.selectedPlacement?.rotationY ?? 0) * 180) / Math.PI).toBeCloseTo(15);
  });

  it('resets asset defaults without changing the current ground position', () => {
    const { controller, place } = makeController();
    place();
    controller.applyTransform({
      positionX: '9',
      positionY: '7',
      positionZ: '5',
      rotationY: '90',
      scale: '2',
      groundOffsetY: '1',
    });
    controller.resetTransform();

    expect(controller.state.selectedPlacement).toMatchObject({
      position: { x: 9, y: 7, z: 5 },
      rotationY: naturePlacementAsset('BirchTree_1').defaultRotationY,
      scale: 1,
      groundOffsetY: 0,
    });
  });

  it('undoes and redoes one grouped transform for multiple selected placements', () => {
    const { controller, place, setProjected } = makeController();
    const first = place();
    setProjected({ x: 3, y: 2, z: 3 });
    const second = place();
    controller.state.selectIds([first.id, second.id]);

    controller.applyGroupTransform({
      moveX: '10',
      moveY: '2',
      moveZ: '10',
      rotationDegrees: '90',
      scaleFactor: '1.5',
      groundOffsetDelta: '0.2',
    });
    expect(controller.state.selectedPlacements).toHaveLength(2);
    expect(controller.state.selectedPlacements.every((entry) => entry.scale === 1.5)).toBe(true);
    const transformed = controller.state.placements;

    controller.undo();
    expect(controller.state.placements.map((entry) => entry.position)).toEqual([
      first.position,
      second.position,
    ]);
    controller.redo();
    expect(controller.state.placements).toEqual(transformed);
  });

  it('rejects an out-of-range grouped rotation without adding history', () => {
    const { controller, place } = makeController();
    const first = place();
    controller.state.selectIds([first.id]);
    const before = controller.state.placements;

    controller.applyGroupTransform({
      moveX: '',
      moveY: '',
      moveZ: '',
      rotationDegrees: '361',
      scaleFactor: '1',
      groundOffsetDelta: '0',
    });

    expect(controller.state.placements).toEqual(before);
    controller.undo();
    expect(controller.state.placements).toEqual([]);
  });

  it('includes layer and group operations in history', () => {
    const { controller, place } = makeController();
    const first = place();
    controller.createLayer('Foreground');
    const layer = controller.state.layers.find((entry) => entry.name === 'Foreground');
    expect(layer).toBeDefined();
    controller.renameLayer(layer?.layerId ?? '', 'Details');
    expect(controller.state.layers.find((entry) => entry.layerId === layer?.layerId)?.name).toBe(
      'Details',
    );
    controller.undo();
    expect(controller.state.layers.find((entry) => entry.layerId === layer?.layerId)?.name).toBe(
      'Foreground',
    );
    controller.redo();
    expect(controller.state.layers.find((entry) => entry.layerId === layer?.layerId)?.name).toBe(
      'Details',
    );

    controller.state.selectIds([first.id]);
    controller.groupSelection('Trees');
    const group = controller.state.groups[0];
    expect(group?.placementIds).toEqual([first.id]);
    controller.setPreferences({ gridSize: 5, snapPosition: true });
    controller.duplicateGroup(group.groupId);
    expect(controller.state.groups).toHaveLength(2);
    expect(controller.state.selectedPlacement?.position).toEqual({ x: 5, y: 2, z: 10 });
    controller.undo();
    expect(controller.state.groups).toHaveLength(1);
    controller.deleteGroup(group.groupId);
    expect(controller.state.groups).toEqual([]);
    expect(controller.state.placements).toHaveLength(1);
    controller.undo();
    expect(controller.state.groups).toHaveLength(1);
  });

  it('maps Shift click, Ctrl click, and empty-ground drag to additive, toggle, and rectangle selection', () => {
    const { controller, place, setPickedId, setProjected } = makeController();
    setProjected({ x: 0, y: 2, z: 0 });
    const first = place();
    setProjected({ x: 4, y: 2, z: 0 });
    const second = place();

    setPickedId(first.id);
    controller.primaryDown(0, 0);
    controller.pointerUp();
    setPickedId(second.id);
    controller.primaryDown(0, 0, { shiftKey: true });
    controller.pointerUp();
    expect(controller.state.selectedPlacementIds).toEqual([first.id, second.id]);
    setPickedId(first.id);
    controller.primaryDown(0, 0, { ctrlKey: true });
    expect(controller.state.selectedPlacementIds).toEqual([second.id]);

    setPickedId(null);
    setProjected({ x: -1, y: 2, z: -1 });
    controller.primaryDown(0, 0);
    setProjected({ x: 1, y: 2, z: 1 });
    controller.pointerMove(10, 10);
    controller.pointerUp();
    expect(controller.state.selectedPlacementIds).toEqual([first.id]);
  });

  it('cancels and cleans an in-progress selection rectangle on Escape and window blur', () => {
    const { blur, controller, pressEscape, render, setPickedId } = makeController();
    setPickedId(null);

    controller.primaryDown(0, 0);
    pressEscape();
    expect(render.syncSelectionRectangle).toHaveBeenLastCalledWith(null, null);

    controller.primaryDown(0, 0);
    blur();
    expect(render.syncSelectionRectangle).toHaveBeenLastCalledWith(null, null);
  });

  it('restores the active saved project when a new controller starts', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    } as unknown as Storage;
    const first = makeController(storage).controller;
    first.newProject('Restored Project');
    first.selectAsset('Grass_Large');
    first.startPlacement();
    first.primaryDown(0, 0);
    first.saveProject();

    const restored = makeController(storage).controller;
    expect(restored.state.projectData.name).toBe('Restored Project');
    expect(restored.state.placements).toHaveLength(1);
    expect(restored.state.placements[0].assetId).toBe('Grass_Large');
  });

  it('falls back to a unique project id when randomUUID collides with a stored project', () => {
    const memory = memoryStorage();
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'repeated-id') });
    try {
      const { controller } = makeController(memory.storage);
      controller.newProject('Second Project');
      const stored = JSON.parse(memory.values.get(NATURE_PLACEMENT_PROJECTS_KEY) ?? '{}') as {
        projects?: Array<{ projectId: string }>;
      };
      expect(stored.projects).toHaveLength(2);
      expect(new Set(stored.projects?.map((project) => project.projectId)).size).toBe(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
