import {
  isNaturePlacementAssetId,
  NATURE_PLACEMENT_FORMAT_VERSION,
  NATURE_PLACEMENT_LIMITS,
  type NaturePlacementPoint,
} from './placement_core';
import { validateNaturePlacementDocument } from './placement_json';
import {
  cloneNaturePlacementProject,
  migrateLegacyPlacementsToProject,
  NATURE_PLACEMENT_PROJECT_LIMITS,
  NATURE_PLACEMENT_PROJECT_VERSION,
  type NaturePlacementGroup,
  type NaturePlacementLayer,
  type NaturePlacementProject,
  type NaturePlacementWorkArea,
  type NatureProjectPlacement,
} from './placement_project_core';

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
const PLACEMENT_ID = /^lab-placement-[A-Za-z0-9_-]{1,64}$/;
const MAX_NAME_LENGTH = 100;
const MAX_NOTES_LENGTH = 2_000;

export class NaturePlacementProjectJsonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NaturePlacementProjectJsonError';
  }
}

export interface NaturePlacementProjectParseOptions {
  createProjectId: () => string;
  legacyName: string;
  now?: () => Date;
  existingProjectIds?: ReadonlySet<string>;
  allowExistingProjectId?: string;
}

function fail(message: string): never {
  throw new NaturePlacementProjectJsonError(message);
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

function safeId(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) fail(`${label} is invalid`);
  return value;
}

function safeName(value: unknown, label: string): string {
  if (typeof value !== 'string') fail(`${label} must be a string`);
  const name = value.trim();
  if (name.length === 0 || name.length > MAX_NAME_LENGTH) fail(`${label} is invalid`);
  return name;
}

function isoDate(value: unknown, label: string): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) fail(`${label} is invalid`);
  return value;
}

function point(value: unknown, label: string): NaturePlacementPoint {
  if (!isRecord(value)) fail(`${label} must be an object`);
  const x = finiteNumber(value.x, `${label}.x`);
  const y = finiteNumber(value.y, `${label}.y`);
  const z = finiteNumber(value.z, `${label}.z`);
  if (
    Math.abs(x) > NATURE_PLACEMENT_LIMITS.positionAbsMax ||
    y < NATURE_PLACEMENT_LIMITS.groundYMin ||
    y > NATURE_PLACEMENT_LIMITS.groundYMax ||
    Math.abs(z) > NATURE_PLACEMENT_LIMITS.positionAbsMax
  ) {
    fail(`${label} is outside laboratory limits`);
  }
  return { x, y, z };
}

function layer(value: unknown, index: number): NaturePlacementLayer {
  if (!isRecord(value)) fail(`layer ${index} must be an object`);
  if (typeof value.visible !== 'boolean' || typeof value.locked !== 'boolean') {
    fail(`layer ${index} has invalid state`);
  }
  if (value.locked && !value.visible) fail(`layer ${index} cannot be locked and hidden`);
  return {
    layerId: safeId(value.layerId, `layer ${index} layerId`),
    name: safeName(value.name, `layer ${index} name`),
    visible: value.visible,
    locked: value.locked,
  };
}

function placement(value: unknown, index: number): NatureProjectPlacement {
  if (!isRecord(value)) fail(`placement ${index} must be an object`);
  if (typeof value.id !== 'string' || !PLACEMENT_ID.test(value.id)) {
    fail(`placement ${index} has invalid id`);
  }
  if (!isNaturePlacementAssetId(value.assetId)) fail(`placement ${value.id} has unknown assetId`);
  const rotationY = finiteNumber(value.rotationY, `placement ${value.id} rotationY`);
  const scale = finiteNumber(value.scale, `placement ${value.id} scale`);
  const groundOffsetY = finiteNumber(value.groundOffsetY, `placement ${value.id} groundOffsetY`);
  if (rotationY < 0 || rotationY >= Math.PI * 2)
    fail(`placement ${value.id} rotationY is outside laboratory limits`);
  if (scale < NATURE_PLACEMENT_LIMITS.scaleMin || scale > NATURE_PLACEMENT_LIMITS.scaleMax) {
    fail(`placement ${value.id} scale is outside laboratory limits`);
  }
  if (
    groundOffsetY < NATURE_PLACEMENT_LIMITS.groundOffsetMin ||
    groundOffsetY > NATURE_PLACEMENT_LIMITS.groundOffsetMax
  ) {
    fail(`placement ${value.id} groundOffsetY is outside laboratory limits`);
  }
  return {
    id: value.id,
    assetId: value.assetId,
    layerId: safeId(value.layerId, `placement ${value.id} layerId`),
    position: point(value.position, `placement ${value.id} position`),
    rotationY,
    scale,
    groundOffsetY,
  };
}

function group(value: unknown, index: number): NaturePlacementGroup {
  if (!isRecord(value)) fail(`group ${index} must be an object`);
  if (!Array.isArray(value.placementIds)) fail(`group ${index} placementIds must be an array`);
  const placementIds = value.placementIds.map((id, placementIndex) => {
    if (typeof id !== 'string' || !PLACEMENT_ID.test(id)) {
      fail(`group ${index} placement ${placementIndex} is invalid`);
    }
    return id;
  });
  if (new Set(placementIds).size !== placementIds.length)
    fail(`group ${index} repeats a placement`);
  return {
    groupId: safeId(value.groupId, `group ${index} groupId`),
    name: safeName(value.name, `group ${index} name`),
    placementIds,
  };
}

function workArea(value: unknown): NaturePlacementWorkArea | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) fail('workArea must be an object');
  const result: NaturePlacementWorkArea = {};
  if (value.center !== undefined) result.center = point(value.center, 'workArea center');
  for (const key of ['width', 'depth'] as const) {
    if (value[key] === undefined) continue;
    const size = finiteNumber(value[key], `workArea ${key}`);
    if (size <= 0 || size > NATURE_PLACEMENT_LIMITS.positionAbsMax * 2) {
      fail(`workArea ${key} is outside laboratory limits`);
    }
    result[key] = size;
  }
  if (value.notes !== undefined) {
    if (typeof value.notes !== 'string' || value.notes.length > MAX_NOTES_LENGTH) {
      fail('workArea notes are invalid');
    }
    result.notes = value.notes;
  }
  return result;
}

export function validateNaturePlacementProject(
  value: unknown,
  existingProjectIds: ReadonlySet<string> = new Set(),
  allowExistingProjectId?: string,
): NaturePlacementProject {
  rejectDangerousProperties(value);
  if (!isRecord(value)) fail('project document must be an object');
  if (value.version !== NATURE_PLACEMENT_PROJECT_VERSION) {
    fail(`unsupported project format version: ${String(value.version)}`);
  }
  const projectId = safeId(value.projectId, 'projectId');
  if (existingProjectIds.has(projectId) && projectId !== allowExistingProjectId) {
    fail(`duplicate projectId: ${projectId}`);
  }
  if (!Array.isArray(value.layers)) fail('layers must be an array');
  if (!Array.isArray(value.placements)) fail('placements must be an array');
  if (!Array.isArray(value.groups)) fail('groups must be an array');
  if (
    value.layers.length === 0 ||
    value.layers.length > NATURE_PLACEMENT_PROJECT_LIMITS.maxLayers
  ) {
    fail(`layer count exceeds ${NATURE_PLACEMENT_PROJECT_LIMITS.maxLayers}`);
  }
  if (value.placements.length > NATURE_PLACEMENT_LIMITS.maxPlacements) {
    fail(`placement count exceeds ${NATURE_PLACEMENT_LIMITS.maxPlacements}`);
  }
  if (value.groups.length > NATURE_PLACEMENT_PROJECT_LIMITS.maxGroups) {
    fail(`group count exceeds ${NATURE_PLACEMENT_PROJECT_LIMITS.maxGroups}`);
  }
  const layers = value.layers.map(layer);
  const placements = value.placements.map(placement);
  const groups = value.groups.map(group);
  const layerIds = new Set<string>();
  for (const entry of layers) {
    if (layerIds.has(entry.layerId)) fail(`duplicate layerId: ${entry.layerId}`);
    layerIds.add(entry.layerId);
  }
  const placementIds = new Set<string>();
  for (const entry of placements) {
    if (placementIds.has(entry.id)) fail(`duplicate placement id: ${entry.id}`);
    if (!layerIds.has(entry.layerId)) fail(`placement ${entry.id} has unknown layerId`);
    placementIds.add(entry.id);
  }
  const groupIds = new Set<string>();
  const groupedPlacements = new Set<string>();
  for (const entry of groups) {
    if (groupIds.has(entry.groupId)) fail(`duplicate groupId: ${entry.groupId}`);
    groupIds.add(entry.groupId);
    for (const placementId of entry.placementIds) {
      if (!placementIds.has(placementId))
        fail(`group ${entry.groupId} references missing placement`);
      if (groupedPlacements.has(placementId))
        fail(`placement ${placementId} belongs to multiple groups`);
      groupedPlacements.add(placementId);
    }
  }
  const optionalWorkArea = workArea(value.workArea);
  return {
    version: NATURE_PLACEMENT_PROJECT_VERSION,
    projectId,
    name: safeName(value.name, 'project name'),
    createdAt: isoDate(value.createdAt, 'createdAt'),
    modifiedAt: isoDate(value.modifiedAt, 'modifiedAt'),
    placements,
    layers,
    groups,
    ...(optionalWorkArea ? { workArea: optionalWorkArea } : {}),
  };
}

export function parseNaturePlacementProjectJson(
  source: string,
  options: NaturePlacementProjectParseOptions,
): NaturePlacementProject {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    fail('invalid project JSON');
  }
  rejectDangerousProperties(parsed);
  if (isRecord(parsed) && parsed.version === NATURE_PLACEMENT_FORMAT_VERSION) {
    const placements = validateNaturePlacementDocument(parsed);
    const projectId = options.createProjectId();
    if (options.existingProjectIds?.has(projectId)) fail(`duplicate projectId: ${projectId}`);
    return migrateLegacyPlacementsToProject(placements, projectId, options.legacyName, options.now);
  }
  return validateNaturePlacementProject(
    parsed,
    options.existingProjectIds,
    options.allowExistingProjectId,
  );
}

function compareId<T>(field: keyof T): (left: T, right: T) => number {
  return (left, right) => {
    const a = String(left[field]);
    const b = String(right[field]);
    return a < b ? -1 : a > b ? 1 : 0;
  };
}

export function serializeNaturePlacementProject(project: NaturePlacementProject): string {
  const validated = validateNaturePlacementProject(cloneNaturePlacementProject(project));
  const canonical = {
    version: NATURE_PLACEMENT_PROJECT_VERSION,
    projectId: validated.projectId,
    name: validated.name,
    createdAt: validated.createdAt,
    modifiedAt: validated.modifiedAt,
    placements: validated.placements.sort(compareId<NatureProjectPlacement>('id')).map((entry) => ({
      id: entry.id,
      assetId: entry.assetId,
      layerId: entry.layerId,
      position: { x: entry.position.x, y: entry.position.y, z: entry.position.z },
      rotationY: entry.rotationY,
      scale: entry.scale,
      groundOffsetY: entry.groundOffsetY,
    })),
    layers: validated.layers
      .sort(compareId<NaturePlacementLayer>('layerId'))
      .map((entry) => ({ ...entry })),
    groups: validated.groups.sort(compareId<NaturePlacementGroup>('groupId')).map((entry) => ({
      groupId: entry.groupId,
      name: entry.name,
      placementIds: [...entry.placementIds].sort(),
    })),
    ...(validated.workArea ? { workArea: validated.workArea } : {}),
  };
  return `${JSON.stringify(canonical, null, 2)}\n`;
}
