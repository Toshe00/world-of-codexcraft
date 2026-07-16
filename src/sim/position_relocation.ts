export interface HistoricalWorldPosition {
  readonly x: number;
  readonly y?: number;
  readonly z: number;
  readonly facing?: number;
}

export interface HistoricalPositionInput {
  readonly position: HistoricalWorldPosition;
  readonly sourceZoneId: string;
}

export interface RelocationRegion {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export interface RelocationSafePoint {
  readonly id: string;
  readonly zoneId: string;
  readonly position: HistoricalWorldPosition;
}

export interface RelocationMapping {
  readonly region: RelocationRegion;
  readonly safePointId: string;
  readonly reason: string;
  readonly preserveFacing?: boolean;
}

export interface ZoneRelocationPolicy {
  readonly targetZoneId: string;
  readonly validRegions: readonly RelocationRegion[];
  readonly relocations?: readonly RelocationMapping[];
  readonly fallback?: Omit<RelocationMapping, 'region'>;
}

export interface PositionRelocationPolicy {
  readonly id: string;
  readonly zones: Readonly<Record<string, ZoneRelocationPolicy>>;
  readonly safePoints: readonly RelocationSafePoint[];
}

export type PositionRelocationPolicyRegistry = Readonly<Record<string, PositionRelocationPolicy>>;

export type PositionRelocationStatus =
  | 'position-valid'
  | 'relocate-to-safe-point'
  | 'relocate-to-zone-fallback'
  | 'reject-missing-mapping'
  | 'manual-review-required';

export type PositionRelocationReason =
  | 'position-valid-under-policy'
  | 'position-not-finite'
  | 'policy-not-found'
  | 'policy-id-mismatch'
  | 'source-zone-not-mapped'
  | 'policy-region-invalid'
  | 'ambiguous-relocation-mapping'
  | 'position-outside-explicit-mappings'
  | 'safe-point-not-found'
  | 'safe-point-id-ambiguous'
  | 'safe-point-zone-mismatch'
  | 'safe-point-position-not-finite'
  | string;

export interface PositionRelocationDecision {
  readonly status: PositionRelocationStatus;
  readonly originalPosition: HistoricalWorldPosition;
  readonly proposedPosition: HistoricalWorldPosition | null;
  readonly reason: PositionRelocationReason;
  readonly policyId: string;
  readonly sourceZoneId: string;
  readonly targetZoneId: string | null;
  /** Null means the requested policy cannot determine whether a move is needed. */
  readonly changeRequired: boolean | null;
}

function copyPosition(position: HistoricalWorldPosition): HistoricalWorldPosition {
  return {
    x: position.x,
    ...(position.y === undefined ? {} : { y: position.y }),
    z: position.z,
    ...(position.facing === undefined ? {} : { facing: position.facing }),
  };
}

function positionIsFinite(position: HistoricalWorldPosition): boolean {
  return (
    Number.isFinite(position.x) &&
    Number.isFinite(position.z) &&
    (position.y === undefined || Number.isFinite(position.y)) &&
    (position.facing === undefined || Number.isFinite(position.facing))
  );
}

function regionIsFinite(region: RelocationRegion): boolean {
  return (
    Number.isFinite(region.minX) &&
    Number.isFinite(region.maxX) &&
    Number.isFinite(region.minZ) &&
    Number.isFinite(region.maxZ) &&
    region.minX <= region.maxX &&
    region.minZ <= region.maxZ
  );
}

function contains(region: RelocationRegion, position: HistoricalWorldPosition): boolean {
  return (
    regionIsFinite(region) &&
    position.x >= region.minX &&
    position.x <= region.maxX &&
    position.z >= region.minZ &&
    position.z <= region.maxZ
  );
}

function decision(
  input: HistoricalPositionInput,
  policyId: string,
  values: Omit<PositionRelocationDecision, 'originalPosition' | 'policyId' | 'sourceZoneId'>,
): PositionRelocationDecision {
  return {
    ...values,
    originalPosition: copyPosition(input.position),
    policyId,
    sourceZoneId: input.sourceZoneId,
  };
}

function relocationDecision(
  input: HistoricalPositionInput,
  policyId: string,
  policy: PositionRelocationPolicy,
  zone: ZoneRelocationPolicy,
  mapping: Omit<RelocationMapping, 'region'>,
  status: 'relocate-to-safe-point' | 'relocate-to-zone-fallback',
): PositionRelocationDecision {
  const matches = policy.safePoints.filter((point) => point.id === mapping.safePointId);
  if (matches.length === 0) {
    return decision(input, policyId, {
      status: 'reject-missing-mapping',
      proposedPosition: null,
      reason: 'safe-point-not-found',
      targetZoneId: zone.targetZoneId,
      changeRequired: true,
    });
  }
  if (matches.length !== 1) {
    return decision(input, policyId, {
      status: 'reject-missing-mapping',
      proposedPosition: null,
      reason: 'safe-point-id-ambiguous',
      targetZoneId: zone.targetZoneId,
      changeRequired: true,
    });
  }

  const safePoint = matches[0];
  if (safePoint.zoneId !== zone.targetZoneId) {
    return decision(input, policyId, {
      status: 'reject-missing-mapping',
      proposedPosition: null,
      reason: 'safe-point-zone-mismatch',
      targetZoneId: zone.targetZoneId,
      changeRequired: true,
    });
  }
  if (!positionIsFinite(safePoint.position)) {
    return decision(input, policyId, {
      status: 'reject-missing-mapping',
      proposedPosition: null,
      reason: 'safe-point-position-not-finite',
      targetZoneId: zone.targetZoneId,
      changeRequired: true,
    });
  }

  const proposedPosition = copyPosition(safePoint.position);
  return decision(input, policyId, {
    status,
    proposedPosition:
      mapping.preserveFacing && input.position.facing !== undefined
        ? { ...proposedPosition, facing: input.position.facing }
        : proposedPosition,
    reason: mapping.reason,
    targetZoneId: zone.targetZoneId,
    changeRequired: true,
  });
}

/**
 * Plan a coordinate relocation without mutating the save or consulting runtime state.
 * Policies are injected explicitly so this leaf ships with no active migration policy.
 */
export function planPositionRelocation(
  input: HistoricalPositionInput,
  policyId: string,
  policies: PositionRelocationPolicyRegistry,
): PositionRelocationDecision {
  if (!Object.hasOwn(policies, policyId)) {
    return decision(input, policyId, {
      status: 'reject-missing-mapping',
      proposedPosition: null,
      reason: 'policy-not-found',
      targetZoneId: null,
      changeRequired: null,
    });
  }
  const policy = policies[policyId];
  if (policy.id !== policyId) {
    return decision(input, policyId, {
      status: 'reject-missing-mapping',
      proposedPosition: null,
      reason: 'policy-id-mismatch',
      targetZoneId: null,
      changeRequired: null,
    });
  }
  if (!positionIsFinite(input.position)) {
    return decision(input, policyId, {
      status: 'manual-review-required',
      proposedPosition: null,
      reason: 'position-not-finite',
      targetZoneId: null,
      changeRequired: true,
    });
  }

  if (!Object.hasOwn(policy.zones, input.sourceZoneId)) {
    return decision(input, policyId, {
      status: 'reject-missing-mapping',
      proposedPosition: null,
      reason: 'source-zone-not-mapped',
      targetZoneId: null,
      changeRequired: null,
    });
  }
  const zone = policy.zones[input.sourceZoneId];
  const policyRegions = [
    ...zone.validRegions,
    ...(zone.relocations ?? []).map((mapping) => mapping.region),
  ];
  if (!policyRegions.every(regionIsFinite)) {
    return decision(input, policyId, {
      status: 'reject-missing-mapping',
      proposedPosition: null,
      reason: 'policy-region-invalid',
      targetZoneId: zone.targetZoneId,
      changeRequired: null,
    });
  }
  if (zone.validRegions.some((region) => contains(region, input.position))) {
    return decision(input, policyId, {
      status: 'position-valid',
      proposedPosition: copyPosition(input.position),
      reason: 'position-valid-under-policy',
      targetZoneId: zone.targetZoneId,
      changeRequired: false,
    });
  }

  const mappings = (zone.relocations ?? []).filter((mapping) =>
    contains(mapping.region, input.position),
  );
  if (mappings.length > 1) {
    return decision(input, policyId, {
      status: 'manual-review-required',
      proposedPosition: null,
      reason: 'ambiguous-relocation-mapping',
      targetZoneId: zone.targetZoneId,
      changeRequired: true,
    });
  }
  if (mappings.length === 1) {
    return relocationDecision(input, policyId, policy, zone, mappings[0], 'relocate-to-safe-point');
  }
  if (zone.fallback) {
    return relocationDecision(
      input,
      policyId,
      policy,
      zone,
      zone.fallback,
      'relocate-to-zone-fallback',
    );
  }
  return decision(input, policyId, {
    status: 'manual-review-required',
    proposedPosition: null,
    reason: 'position-outside-explicit-mappings',
    targetZoneId: zone.targetZoneId,
    changeRequired: true,
  });
}
