import { describe, expect, it } from 'vitest';
import {
  type HistoricalPositionInput,
  type PositionRelocationPolicy,
  type PositionRelocationPolicyRegistry,
  planPositionRelocation,
} from '../src/sim/position_relocation';
import { loadHistoricalSaveFixtures } from './helpers/historical_save_fixture';

const FUTURE_MAP_FIXTURE = loadHistoricalSaveFixtures().find(
  (fixture) => fixture.scenario === 'position-potentially-invalid-on-future-map',
);
if (!FUTURE_MAP_FIXTURE) throw new Error('missing future-map fixture');

const POLICY_V1: PositionRelocationPolicy = {
  id: 'fixture-map-v1',
  safePoints: [
    {
      id: 'harbor-safe-point',
      zoneId: 'fixture_harbor',
      position: { x: 10, y: 4, z: 20, facing: 0.5 },
    },
    {
      id: 'harbor-zone-fallback',
      zoneId: 'fixture_harbor',
      position: { x: 0, y: 3, z: 0, facing: 0 },
    },
    {
      id: 'highlands-safe-point',
      zoneId: 'fixture_highlands',
      position: { x: 25, y: 8, z: 640, facing: -0.25 },
    },
  ],
  zones: {
    source_zone_a: {
      targetZoneId: 'fixture_harbor',
      validRegions: [{ minX: -100, maxX: 100, minZ: -100, maxZ: 100 }],
      relocations: [
        {
          region: { minX: 100, maxX: 180, minZ: -180, maxZ: 180 },
          safePointId: 'harbor-safe-point',
          reason: 'fixture-east-edge-replaced',
          preserveFacing: true,
        },
      ],
      fallback: {
        safePointId: 'harbor-zone-fallback',
        reason: 'fixture-zone-fallback',
        preserveFacing: true,
      },
    },
    source_zone_c: {
      targetZoneId: 'fixture_highlands',
      validRegions: [{ minX: -120, maxX: 120, minZ: 540, maxZ: 800 }],
      relocations: [
        {
          region: { minX: 120, maxX: 180, minZ: 540, maxZ: 900 },
          safePointId: 'highlands-safe-point',
          reason: 'fixture-highlands-rim-replaced',
          preserveFacing: true,
        },
      ],
    },
  },
};

const POLICY_V2: PositionRelocationPolicy = {
  ...POLICY_V1,
  id: 'fixture-map-v2',
  safePoints: POLICY_V1.safePoints.map((point) =>
    point.id === 'highlands-safe-point'
      ? { ...point, position: { x: 30, y: 9, z: 645, facing: -0.25 } }
      : point,
  ),
};

const POLICIES: PositionRelocationPolicyRegistry = {
  [POLICY_V1.id]: POLICY_V1,
  [POLICY_V2.id]: POLICY_V2,
};

const plan = (
  input: HistoricalPositionInput,
  policyId = POLICY_V1.id,
  policies: PositionRelocationPolicyRegistry = POLICIES,
) => planPositionRelocation(input, policyId, policies);

describe('pure historical position relocation planning', () => {
  it('never moves a position that is explicitly valid', () => {
    const input = {
      sourceZoneId: 'source_zone_a',
      position: { x: 25, y: 6, z: 30, facing: 1.2 },
    } as const;
    const result = plan(input);
    expect(result).toMatchObject({
      status: 'position-valid',
      originalPosition: input.position,
      proposedPosition: input.position,
      reason: 'position-valid-under-policy',
      policyId: 'fixture-map-v1',
      sourceZoneId: 'source_zone_a',
      targetZoneId: 'fixture_harbor',
      changeRequired: false,
    });
    expect(result.proposedPosition).not.toBe(input.position);
  });

  it('relocates an out-of-bounds position only to an explicit safe point', () => {
    const input = {
      sourceZoneId: 'source_zone_c',
      position: {
        ...FUTURE_MAP_FIXTURE.character.state.pos,
        facing: FUTURE_MAP_FIXTURE.character.state.facing,
      },
    } as const;
    const result = plan(input);
    expect(result).toMatchObject({
      status: 'relocate-to-safe-point',
      proposedPosition: { x: 25, y: 8, z: 640, facing: -1.1 },
      reason: 'fixture-highlands-rim-replaced',
      targetZoneId: 'fixture_highlands',
      changeRequired: true,
    });
    expect(POLICY_V1.safePoints.some((point) => point.id === 'highlands-safe-point')).toBe(true);
  });

  it.each([
    { x: Number.NaN, z: 0 },
    { x: Number.POSITIVE_INFINITY, z: 0 },
    { x: 0, z: Number.NEGATIVE_INFINITY },
    { x: 0, y: Number.NaN, z: 0 },
    { x: 0, z: 0, facing: Number.POSITIVE_INFINITY },
  ])('refuses non-finite coordinates without a destination', (position) => {
    expect(plan({ sourceZoneId: 'source_zone_a', position })).toMatchObject({
      status: 'manual-review-required',
      proposedPosition: null,
      reason: 'position-not-finite',
      targetZoneId: null,
      changeRequired: true,
    });
  });

  it('rejects an unknown source zone without inventing a destination', () => {
    expect(plan({ sourceZoneId: 'unknown_zone', position: { x: 0, z: 0 } })).toMatchObject({
      status: 'reject-missing-mapping',
      proposedPosition: null,
      reason: 'source-zone-not-mapped',
      targetZoneId: null,
      changeRequired: null,
    });
  });

  it.each([
    '__proto__',
    'constructor',
    'toString',
  ])('rejects inherited source-zone key %s without throwing', (sourceZoneId) => {
    expect(plan({ sourceZoneId, position: { x: 0, z: 0 } })).toMatchObject({
      status: 'reject-missing-mapping',
      proposedPosition: null,
      reason: 'source-zone-not-mapped',
      targetZoneId: null,
      changeRequired: null,
    });
  });

  it('rejects a malformed policy region before an explicit fallback can move the input', () => {
    const broken: PositionRelocationPolicy = {
      ...POLICY_V1,
      zones: {
        ...POLICY_V1.zones,
        source_zone_a: {
          ...POLICY_V1.zones.source_zone_a,
          validRegions: [{ minX: Number.NaN, maxX: 100, minZ: -100, maxZ: 100 }],
        },
      },
    };
    expect(
      plan({ sourceZoneId: 'source_zone_a', position: { x: -150, z: 150 } }, POLICY_V1.id, {
        [POLICY_V1.id]: broken,
      }),
    ).toMatchObject({
      status: 'reject-missing-mapping',
      proposedPosition: null,
      reason: 'policy-region-invalid',
      targetZoneId: 'fixture_harbor',
      changeRequired: null,
    });
  });

  it('rejects a missing safe point', () => {
    const broken: PositionRelocationPolicy = {
      ...POLICY_V1,
      zones: {
        ...POLICY_V1.zones,
        source_zone_c: {
          ...POLICY_V1.zones.source_zone_c,
          relocations: [
            {
              region: { minX: 120, maxX: 180, minZ: 540, maxZ: 900 },
              safePointId: 'missing-safe-point',
              reason: 'fixture-broken-reference',
            },
          ],
        },
      },
    };
    expect(
      plan({ sourceZoneId: 'source_zone_c', position: { x: 170, z: 700 } }, POLICY_V1.id, {
        [POLICY_V1.id]: broken,
      }),
    ).toMatchObject({
      status: 'reject-missing-mapping',
      proposedPosition: null,
      reason: 'safe-point-not-found',
      changeRequired: true,
    });
  });

  it('uses an explicit zone fallback when no relocation region matches', () => {
    expect(plan({ sourceZoneId: 'source_zone_a', position: { x: -150, z: 150 } })).toMatchObject({
      status: 'relocate-to-zone-fallback',
      proposedPosition: { x: 0, y: 3, z: 0, facing: 0 },
      reason: 'fixture-zone-fallback',
      changeRequired: true,
    });
  });

  it('requires manual review when neither a mapping nor a fallback exists', () => {
    expect(plan({ sourceZoneId: 'source_zone_c', position: { x: -150, z: 850 } })).toMatchObject({
      status: 'manual-review-required',
      proposedPosition: null,
      reason: 'position-outside-explicit-mappings',
      changeRequired: true,
    });
  });

  it('is deterministic and selects policy versions explicitly', () => {
    const input = {
      sourceZoneId: 'source_zone_c',
      position: { x: 170, z: 700, facing: 0.9 },
    } as const;
    expect(plan(input)).toEqual(plan(input));
    expect(plan(input, 'fixture-map-v1').proposedPosition).toEqual({
      x: 25,
      y: 8,
      z: 640,
      facing: 0.9,
    });
    expect(plan(input, 'fixture-map-v2').proposedPosition).toEqual({
      x: 30,
      y: 9,
      z: 645,
      facing: 0.9,
    });
  });

  it('rejects an unknown policy version', () => {
    expect(
      plan({ sourceZoneId: 'source_zone_a', position: { x: 0, z: 0 } }, 'fixture-map-v99'),
    ).toMatchObject({
      status: 'reject-missing-mapping',
      proposedPosition: null,
      reason: 'policy-not-found',
      policyId: 'fixture-map-v99',
      changeRequired: null,
    });
  });

  it('does not mutate the input or policy registry', () => {
    const input = {
      sourceZoneId: 'source_zone_a',
      position: { x: 150, z: 20, facing: -2 },
    };
    const inputBefore = structuredClone(input);
    const policiesBefore = structuredClone(POLICIES);
    plan(input);
    expect(input).toEqual(inputBefore);
    expect(POLICIES).toEqual(policiesBefore);
  });
});
