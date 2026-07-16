import { describe, expect, it } from 'vitest';
import type { NaturePlacement } from '../src/render/nature_placement_lab/placement_core';
import {
  parseNaturePlacementJson,
  serializeNaturePlacements,
  validateNaturePlacementDocument,
} from '../src/render/nature_placement_lab/placement_json';

function placement(overrides: Partial<NaturePlacement> = {}): NaturePlacement {
  return {
    id: 'lab-placement-002',
    assetId: 'Bush_Flowers',
    position: { x: 10, y: 2, z: 14 },
    rotationY: 0,
    scale: 1,
    groundOffsetY: -0.08,
    ...overrides,
  };
}

describe('nature placement laboratory JSON', () => {
  it('accepts an unchanged phase 4D version 1 document', () => {
    const phase4d = `{
  "version": 1,
  "placements": [
    {
      "id": "lab-placement-004",
      "assetId": "DeadTree_2",
      "position": { "x": 12.5, "y": 3.25, "z": -8.75 },
      "rotationY": 1.5,
      "scale": 0.8,
      "groundOffsetY": -0.1
    }
  ]
}`;

    expect(parseNaturePlacementJson(phase4d)).toEqual([
      {
        id: 'lab-placement-004',
        assetId: 'DeadTree_2',
        position: { x: 12.5, y: 3.25, z: -8.75 },
        rotationY: 1.5,
        scale: 0.8,
        groundOffsetY: -0.1,
      },
    ]);
  });

  it('exports deterministic readable JSON sorted by id and never exports a ghost', () => {
    const result = serializeNaturePlacements([
      placement(),
      placement({ id: 'lab-placement-001', assetId: 'Grass_Large' }),
    ]);

    expect(result).toBe(serializeNaturePlacements(parseNaturePlacementJson(result)));
    expect(result.endsWith('\n')).toBe(true);
    expect(result.indexOf('lab-placement-001')).toBeLessThan(result.indexOf('lab-placement-002'));
    expect(result).not.toContain('ghost');
    expect(JSON.parse(result)).toEqual({
      version: 1,
      placements: [placement({ id: 'lab-placement-001', assetId: 'Grass_Large' }), placement()],
    });
  });

  it('imports valid placements without mutating the input value', () => {
    const input = {
      version: 1,
      placements: [placement()],
    };
    const before = structuredClone(input);

    const restored = validateNaturePlacementDocument(input);

    expect(restored).toEqual(input.placements);
    expect(input).toEqual(before);
    expect(restored[0]).not.toBe(input.placements[0]);
    expect(restored[0].position).not.toBe(input.placements[0].position);
  });

  it.each([
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ])('rejects the non-finite value %s', (scale) => {
    expect(() =>
      validateNaturePlacementDocument({ version: 1, placements: [placement({ scale })] }),
    ).toThrow();
  });

  it.each([
    ['position.x', (value: NaturePlacement) => (value.position.x = Number.NaN)],
    ['position.y', (value: NaturePlacement) => (value.position.y = Number.POSITIVE_INFINITY)],
    ['position.z', (value: NaturePlacement) => (value.position.z = Number.NEGATIVE_INFINITY)],
    ['rotationY', (value: NaturePlacement) => (value.rotationY = Number.NaN)],
    ['groundOffsetY', (value: NaturePlacement) => (value.groundOffsetY = Number.POSITIVE_INFINITY)],
  ])('rejects a non-finite %s', (_label, mutate) => {
    const value = placement();
    mutate(value);
    expect(() => validateNaturePlacementDocument({ version: 1, placements: [value] })).toThrow();
  });

  it.each([
    ['invalid JSON', '{'],
    ['unknown version', JSON.stringify({ version: 2, placements: [] })],
    [
      'unknown asset',
      JSON.stringify({ version: 1, placements: [placement({ assetId: 'Unknown' as never })] }),
    ],
    ['duplicate ids', JSON.stringify({ version: 1, placements: [placement(), placement()] })],
    [
      'non finite value',
      JSON.stringify({ version: 1, placements: [placement({ scale: null as never })] }),
    ],
    [
      'out of bounds scale',
      JSON.stringify({ version: 1, placements: [placement({ scale: 100 })] }),
    ],
    ['dangerous property', '{"version":1,"placements":[],"constructor":{"polluted":true}}'],
    ['dangerous proto property', '{"version":1,"placements":[],"__proto__":{"polluted":true}}'],
    [
      'nested dangerous prototype property',
      '{"version":1,"placements":[{"id":"lab-placement-001","assetId":"Grass_Large","position":{"x":0,"y":0,"z":0,"prototype":{}},"rotationY":0,"scale":1,"groundOffsetY":0}]}',
    ],
  ])('rejects %s', (_label, value) => {
    expect(() => parseNaturePlacementJson(value)).toThrow();
  });

  it('rejects an excessive placement count', () => {
    const placements = Array.from({ length: 501 }, (_, index) =>
      placement({ id: `lab-placement-${String(index + 1).padStart(3, '0')}` }),
    );
    expect(() => parseNaturePlacementJson(JSON.stringify({ version: 1, placements }))).toThrow();
  });

  it('accepts the maximum placement count boundary', () => {
    const placements = Array.from({ length: 500 }, (_, index) =>
      placement({ id: `lab-placement-${String(index + 1).padStart(3, '0')}` }),
    );
    expect(validateNaturePlacementDocument({ version: 1, placements })).toHaveLength(500);
  });
});
