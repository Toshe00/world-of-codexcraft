import { describe, expect, it } from 'vitest';
import {
  NATURE_PLACEMENT_ASSETS,
  NATURE_PLACEMENT_LIMITS,
  NaturePlacementState,
  naturePlacementLabEnabled,
  normalizePlacementRotation,
} from '../src/render/nature_placement_lab/placement_core';

function requiredPlacement<T>(value: T | null): T {
  if (value === null) throw new Error('expected a laboratory placement');
  return value;
}

describe('nature placement laboratory activation and palette', () => {
  it('is absent without its dedicated flag and in production', () => {
    expect(naturePlacementLabEnabled({ DEV: true })).toBe(false);
    expect(
      naturePlacementLabEnabled({
        DEV: true,
        VITE_ASSET_REPLACEMENT_LAB: '1',
      }),
    ).toBe(false);
    expect(
      naturePlacementLabEnabled({
        DEV: false,
        VITE_NATURE_PLACEMENT_LAB: '1',
      }),
    ).toBe(false);
    expect(
      naturePlacementLabEnabled({
        DEV: true,
        VITE_NATURE_PLACEMENT_LAB: '1',
      }),
    ).toBe(true);
  });

  it('contains exactly the six approved laboratory assets', () => {
    expect(NATURE_PLACEMENT_ASSETS.map((asset) => asset.assetId)).toEqual([
      'BirchTree_1',
      'BirchTree_2',
      'Bush_Flowers',
      'Flower_1_Clump',
      'Grass_Large',
      'DeadTree_2',
    ]);
    expect(new Set(NATURE_PLACEMENT_ASSETS.map((asset) => asset.assetPath)).size).toBe(6);
    expect(NATURE_PLACEMENT_ASSETS.every((asset) => Number.isFinite(asset.baseScale))).toBe(true);
  });
});

describe('nature placement laboratory state', () => {
  it('pins finite transformation limits and adjustment steps', () => {
    expect(NATURE_PLACEMENT_LIMITS).toMatchObject({
      scaleMin: 0.25,
      scaleMax: 4,
      groundOffsetMin: -2,
      groundOffsetMax: 2,
      rotationStep: Math.PI / 12,
      scaleStep: 0.1,
      scaleStepFine: 0.02,
      groundOffsetStep: 0.05,
      groundOffsetStepFine: 0.01,
    });
    expect(Object.values(NATURE_PLACEMENT_LIMITS).every(Number.isFinite)).toBe(true);
  });

  it('creates a placement only for a valid terrain point', () => {
    const state = new NaturePlacementState();
    state.selectAsset('Bush_Flowers');
    state.startPlacement();

    expect(state.place(null)).toBeNull();
    expect(state.place({ x: Number.NaN, y: 2, z: 3 })).toBeNull();
    const placed = state.place({ x: 10, y: 2, z: 14 });

    expect(placed).toMatchObject({
      id: 'lab-placement-001',
      assetId: 'Bush_Flowers',
      position: { x: 10, y: 2, z: 14 },
      scale: 1,
      groundOffsetY: -0.08,
    });
    expect(state.placements).toHaveLength(1);
  });

  it('normalizes rotation and clamps scale and height adjustments', () => {
    const state = new NaturePlacementState();
    state.selectAsset('Grass_Large');
    state.startPlacement();
    const placed = requiredPlacement(state.place({ x: 1, y: 2, z: 3 }));
    state.selectPlacement(placed.id);

    for (let i = 0; i < 100; i++) state.rotateActive(1);
    expect(state.selectedPlacement?.rotationY).toBeGreaterThanOrEqual(0);
    expect(state.selectedPlacement?.rotationY).toBeLessThan(Math.PI * 2);
    expect(normalizePlacementRotation(-Math.PI / 2)).toBeCloseTo(Math.PI * 1.5);

    for (let i = 0; i < 200; i++) state.adjustScale(-1, false);
    expect(state.selectedPlacement?.scale).toBe(NATURE_PLACEMENT_LIMITS.scaleMin);
    for (let i = 0; i < 400; i++) state.adjustScale(1, true);
    expect(state.selectedPlacement?.scale).toBe(NATURE_PLACEMENT_LIMITS.scaleMax);

    for (let i = 0; i < 200; i++) state.adjustGroundOffset(-1, false);
    expect(state.selectedPlacement?.groundOffsetY).toBe(NATURE_PLACEMENT_LIMITS.groundOffsetMin);
    for (let i = 0; i < 400; i++) state.adjustGroundOffset(1, true);
    expect(state.selectedPlacement?.groundOffsetY).toBe(NATURE_PLACEMENT_LIMITS.groundOffsetMax);
  });

  it('selects, moves, deletes, and clears placed objects', () => {
    const state = new NaturePlacementState();
    state.selectAsset('BirchTree_1');
    state.startPlacement();
    const first = requiredPlacement(state.place({ x: 1, y: 2, z: 3 }));
    const second = requiredPlacement(state.place({ x: 4, y: 5, z: 6 }));

    expect(state.selectPlacement(first.id)).toBe(true);
    expect(state.moveSelected({ x: 7, y: 8, z: 9 })).toBe(true);
    expect(state.selectedPlacement?.position).toEqual({ x: 7, y: 8, z: 9 });
    expect(state.deleteSelected()).toBe(true);
    expect(state.placements.map((placement) => placement.id)).toEqual([second.id]);

    state.clear();
    expect(state.placements).toEqual([]);
    expect(state.selectedPlacement).toBeNull();
  });

  it('duplicates with a new local id while preserving the complete transform', () => {
    const state = new NaturePlacementState();
    state.selectAsset('BirchTree_1');
    state.startPlacement();
    const original = state.place({ x: 10, y: 3, z: 20 });
    expect(original).not.toBeNull();
    expect(state.selectPlacement(original?.id ?? null)).toBe(true);
    state.rotateActive(1);
    state.adjustScale(1, false);
    state.adjustGroundOffset(1, true);
    const transformed = state.selectedPlacement;

    const duplicate = state.duplicateSelected({ x: 0.5, y: 0, z: 0.5 });

    expect(duplicate).toMatchObject({
      assetId: 'BirchTree_1',
      position: { x: 10.5, y: 3, z: 20.5 },
      rotationY: transformed?.rotationY,
      scale: transformed?.scale,
      groundOffsetY: transformed?.groundOffsetY,
    });
    expect(duplicate?.id).not.toBe(original?.id);
    expect(state.selectedPlacementId).toBe(duplicate?.id);
  });
});
