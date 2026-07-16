import {
  cloneNaturePlacement,
  isNaturePlacementAssetId,
  NATURE_PLACEMENT_FORMAT_VERSION,
  NATURE_PLACEMENT_LIMITS,
  type NaturePlacement,
} from './placement_core';

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const PLACEMENT_ID = /^lab-placement-[A-Za-z0-9_-]{1,64}$/;

export class NaturePlacementJsonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NaturePlacementJsonError';
  }
}

function fail(message: string): never {
  throw new NaturePlacementJsonError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function rejectDangerousProperties(value: unknown): void {
  if (Array.isArray(value)) {
    for (const entry of value) rejectDangerousProperties(entry);
    return;
  }
  if (!isRecord(value)) return;
  for (const key of Object.keys(value)) {
    if (DANGEROUS_KEYS.has(key)) fail(`dangerous JSON property: ${key}`);
    rejectDangerousProperties(value[key]);
  }
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${label} must be finite`);
  return value;
}

function validatePlacement(value: unknown, index: number): NaturePlacement {
  if (!isRecord(value)) fail(`placement ${index} must be an object`);
  const id = value.id;
  if (typeof id !== 'string' || !PLACEMENT_ID.test(id)) fail(`placement ${index} has invalid id`);
  if (!isNaturePlacementAssetId(value.assetId)) {
    fail(`placement ${id} has unknown assetId`);
  }
  if (!isRecord(value.position)) fail(`placement ${id} has invalid position`);
  const x = finiteNumber(value.position.x, `placement ${id} position.x`);
  const y = finiteNumber(value.position.y, `placement ${id} position.y`);
  const z = finiteNumber(value.position.z, `placement ${id} position.z`);
  if (
    Math.abs(x) > NATURE_PLACEMENT_LIMITS.positionAbsMax ||
    y < NATURE_PLACEMENT_LIMITS.groundYMin ||
    y > NATURE_PLACEMENT_LIMITS.groundYMax ||
    Math.abs(z) > NATURE_PLACEMENT_LIMITS.positionAbsMax
  ) {
    fail(`placement ${id} position is outside laboratory limits`);
  }
  const rotationY = finiteNumber(value.rotationY, `placement ${id} rotationY`);
  if (rotationY < 0 || rotationY >= Math.PI * 2) {
    fail(`placement ${id} rotationY is outside laboratory limits`);
  }
  const scale = finiteNumber(value.scale, `placement ${id} scale`);
  if (scale < NATURE_PLACEMENT_LIMITS.scaleMin || scale > NATURE_PLACEMENT_LIMITS.scaleMax) {
    fail(`placement ${id} scale is outside laboratory limits`);
  }
  const groundOffsetY = finiteNumber(value.groundOffsetY, `placement ${id} groundOffsetY`);
  if (
    groundOffsetY < NATURE_PLACEMENT_LIMITS.groundOffsetMin ||
    groundOffsetY > NATURE_PLACEMENT_LIMITS.groundOffsetMax
  ) {
    fail(`placement ${id} groundOffsetY is outside laboratory limits`);
  }
  return {
    id,
    assetId: value.assetId,
    position: { x, y, z },
    rotationY,
    scale,
    groundOffsetY,
  };
}

export function validateNaturePlacementDocument(value: unknown): NaturePlacement[] {
  rejectDangerousProperties(value);
  if (!isRecord(value)) fail('placement document must be an object');
  if (value.version !== NATURE_PLACEMENT_FORMAT_VERSION) {
    fail(`unsupported placement format version: ${String(value.version)}`);
  }
  if (!Array.isArray(value.placements)) fail('placements must be an array');
  if (value.placements.length > NATURE_PLACEMENT_LIMITS.maxPlacements) {
    fail(`placement count exceeds ${NATURE_PLACEMENT_LIMITS.maxPlacements}`);
  }
  const placements = value.placements.map(validatePlacement);
  const ids = new Set<string>();
  for (const placement of placements) {
    if (ids.has(placement.id)) fail(`duplicate placement id: ${placement.id}`);
    ids.add(placement.id);
  }
  return placements;
}

export function parseNaturePlacementJson(source: string): NaturePlacement[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    fail('invalid placement JSON');
  }
  return validateNaturePlacementDocument(parsed);
}

function compareIds(a: NaturePlacement, b: NaturePlacement): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function serializeNaturePlacements(placements: readonly NaturePlacement[]): string {
  const validated = validateNaturePlacementDocument({
    version: NATURE_PLACEMENT_FORMAT_VERSION,
    placements: placements.map(cloneNaturePlacement),
  });
  const canonicalPlacements = validated.sort(compareIds).map((placement) => ({
    id: placement.id,
    assetId: placement.assetId,
    position: {
      x: placement.position.x,
      y: placement.position.y,
      z: placement.position.z,
    },
    rotationY: placement.rotationY,
    scale: placement.scale,
    groundOffsetY: placement.groundOffsetY,
  }));
  return `${JSON.stringify(
    { version: NATURE_PLACEMENT_FORMAT_VERSION, placements: canonicalPlacements },
    null,
    2,
  )}\n`;
}
