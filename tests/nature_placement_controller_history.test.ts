import { describe, expect, it, vi } from 'vitest';
import { NaturePlacementController } from '../src/render/nature_placement_lab/placement_controller';
import { naturePlacementAsset } from '../src/render/nature_placement_lab/placement_core';
import { serializeNaturePlacements } from '../src/render/nature_placement_lab/placement_json';

function makeController() {
  let projected = { x: 1, y: 2, z: 3 };
  let pickedId: string | null = null;
  const render = {
    clearGhost: vi.fn(),
    dispose: vi.fn(),
    pickPlacement: vi.fn(() => pickedId),
    sync: vi.fn(),
    syncGrid: vi.fn(),
    updateGhost: vi.fn(),
  };
  const ui = { dispose: vi.fn(), update: vi.fn() };
  const eventWindow = new EventTarget();
  const controller = new NaturePlacementController({
    canvas: new EventTarget() as HTMLCanvasElement,
    createUi: () => ui,
    eventWindow: eventWindow as Window,
    initialWorkCenter: { x: 0, y: 0, z: 0 },
    preferenceStorage: null,
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
    expect(controller.state.placements).toEqual(imported);

    controller.undo();
    expect(controller.state.placements).toEqual([previous]);
    controller.redo();
    expect(controller.state.placements).toEqual(imported);
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
});
