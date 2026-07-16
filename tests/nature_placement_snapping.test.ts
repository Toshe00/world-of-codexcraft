import { describe, expect, it } from 'vitest';
import {
  placePointOnGround,
  snapPlacementPosition,
  snapPlacementRotation,
  snapPlacementScale,
} from '../src/render/nature_placement_lab/placement_snapping';
import { validateNaturePlacementTransform } from '../src/render/nature_placement_lab/placement_transform_validation';

const snapOptions = {
  position: false,
  rotation: false,
  scale: false,
  gridSize: 1 as const,
  rotationStep: 15 as const,
  scaleStep: 0.1 as const,
};

describe('nature placement snapping', () => {
  it('snaps X and Z to the selected cell while leaving Y independent', () => {
    expect(snapPlacementPosition({ x: 1.24, y: 7.375, z: -1.76 }, 0.5)).toEqual({
      x: 1,
      y: 7.375,
      z: -2,
    });
  });

  it('snaps rotation to the selected degree step and normalizes it', () => {
    expect((snapPlacementRotation((22 * Math.PI) / 180, 15) * 180) / Math.PI).toBeCloseTo(15);
    expect((snapPlacementRotation((-44 * Math.PI) / 180, 45) * 180) / Math.PI).toBeCloseTo(315);
  });

  it('snaps scale to the selected finite step', () => {
    expect(snapPlacementScale(1.13, 0.25)).toBe(1.25);
    expect(snapPlacementScale(0.26, 0.05)).toBe(0.25);
  });

  it('places on ground through the injected existing terrain sampler', () => {
    const sampler = (x: number, z: number): number => x * 2 - z;
    expect(placePointOnGround({ x: 3, y: 999, z: 1 }, sampler)).toEqual({ x: 3, y: 5, z: 1 });
  });
});

describe('nature placement inspector validation', () => {
  const valid = {
    positionX: '1.25',
    positionY: '2.5',
    positionZ: '-3.75',
    rotationY: '45',
    scale: '1.2',
    groundOffsetY: '0.1',
  };

  it('validates every numeric field before returning a transform', () => {
    const result = validateNaturePlacementTransform(valid, snapOptions);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.position).toEqual({ x: 1.25, y: 2.5, z: -3.75 });
      expect((result.value.rotationY * 180) / Math.PI).toBeCloseTo(45);
      expect(result.value.scale).toBe(1.2);
    }
  });

  it.each(['NaN', 'Infinity', '-Infinity', ''])('rejects non-finite numeric input %s', (value) => {
    expect(validateNaturePlacementTransform({ ...valid, positionX: value }, snapOptions)).toEqual({
      ok: false,
      error: { kind: 'finite', field: 'positionX' },
    });
  });

  it.each([
    ['positionX', '100001'],
    ['positionY', '-10001'],
    ['rotationY', '361'],
    ['scale', '4.01'],
    ['groundOffsetY', '-2.01'],
  ] as const)('rejects out-of-range %s', (field, value) => {
    const result = validateNaturePlacementTransform({ ...valid, [field]: value }, snapOptions);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatchObject({ kind: 'range', field });
  });

  it('applies enabled snapping only after all fields validate', () => {
    const result = validateNaturePlacementTransform(
      { ...valid, positionX: '1.24', positionY: '2.37', rotationY: '22', scale: '1.13' },
      {
        position: true,
        rotation: true,
        scale: true,
        gridSize: 0.5,
        rotationStep: 15,
        scaleStep: 0.25,
      },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.position.x).toBe(1);
      expect(result.value.position.y).toBe(2.37);
      expect((result.value.rotationY * 180) / Math.PI).toBeCloseTo(15);
      expect(result.value.scale).toBe(1.25);
    }
  });
});
