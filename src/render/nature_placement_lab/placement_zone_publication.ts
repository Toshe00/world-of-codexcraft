import {
  isNaturePlacementAssetId,
  NATURE_PLACEMENT_LIMITS,
  naturePlacementAsset,
  type NaturePlacementAssetId,
  type NaturePlacementPoint,
} from './placement_core';
import { NATURE_PLACEMENT_ASSET_METADATA } from './placement_asset_metadata';
import {
  cloneNaturePlacementProject,
  type NaturePlacementProject,
  type NatureProjectPlacement,
} from './placement_project_core';
import { validateNaturePlacementProject } from './placement_project_json';

export const NATURE_ZONE_PACKAGE_VERSION = 1 as const;
export const NATURE_ZONE_COORDINATE_SPACE = 'world' as const;

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const ZONE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
const PLACEMENT_ID_PATTERN = /^lab-placement-[A-Za-z0-9_-]{1,64}$/;
const MAX_ZONE_ID_LENGTH = 80;
const MAX_NAME_LENGTH = 100;

export interface NatureZoneBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

export interface NatureZonePlacement {
  id: string;
  assetId: NaturePlacementAssetId;
  layerId: string;
  position: NaturePlacementPoint;
  rotationY: number;
  scale: number;
  groundOffsetY: number;
}

export interface NatureZoneAssetSummary {
  assetId: NaturePlacementAssetId;
  assetPath: string;
  placementCount: number;
  estimatedTriangles: number;
  mediaBytes: number;
}

export interface NatureZoneStatistics {
  placementCount: number;
  estimatedTriangles: number;
  uniqueMediaBytes: number;
}

export interface NatureZonePackage {
  version: typeof NATURE_ZONE_PACKAGE_VERSION;
  zoneId: string;
  name: string;
  sourceProjectId: string;
  sourceProjectVersion: NaturePlacementProject['version'];
  coordinateSpace: typeof NATURE_ZONE_COORDINATE_SPACE;
  includedLayerIds: string[];
  bounds: NatureZoneBounds;
  placements: NatureZonePlacement[];
  assetSummary: NatureZoneAssetSummary[];
  statistics: NatureZoneStatistics;
}

export class NatureZonePackageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NatureZonePackageError';
  }
}

function fail(message: string): never {
  throw new NatureZonePackageError(message);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
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
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || DANGEROUS_KEYS.has(key)) {
      fail(`dangerous zone package property: ${String(key)}`);
    }
    rejectDangerousProperties(value[key]);
  }
}

function strictRecord(
  value: unknown,
  label: string,
  allowedKeys: readonly string[],
): Record<string, unknown> {
  if (!isRecord(value)) fail(`${label} must be an object`);
  const allowed = new Set(allowedKeys);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !allowed.has(key)) fail(`${label} has unknown property: ${String(key)}`);
  }
  for (const key of allowedKeys) {
    if (!Object.hasOwn(value, key)) fail(`${label} is missing property: ${key}`);
  }
  return value;
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${label} must be finite`);
  return value;
}

function nonNegativeInteger(value: unknown, label: string): number {
  const number = finiteNumber(value, label);
  if (!Number.isSafeInteger(number) || number < 0) fail(`${label} must be a non-negative integer`);
  return number;
}

function safeName(value: unknown): string {
  if (typeof value !== 'string' || value !== value.trim() || value.length === 0 || value.length > MAX_NAME_LENGTH) {
    fail('zone name is invalid');
  }
  return value;
}

export function validNatureZoneId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= MAX_ZONE_ID_LENGTH &&
    ZONE_ID_PATTERN.test(value)
  );
}

function safeZoneId(value: unknown): string {
  if (!validNatureZoneId(value)) fail('zoneId must use strict kebab-case');
  return value;
}

function safeLayerId(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SAFE_ID_PATTERN.test(value)) fail(`${label} is invalid`);
  return value;
}

function safePlacementId(value: unknown, label: string): string {
  if (typeof value !== 'string' || !PLACEMENT_ID_PATTERN.test(value)) fail(`${label} is invalid`);
  return value;
}

function point(value: unknown, label: string): NaturePlacementPoint {
  const record = strictRecord(value, label, ['x', 'y', 'z']);
  const x = finiteNumber(record.x, `${label}.x`);
  const y = finiteNumber(record.y, `${label}.y`);
  const z = finiteNumber(record.z, `${label}.z`);
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

function placement(value: unknown, index: number): NatureZonePlacement {
  const record = strictRecord(value, `placement ${index}`, [
    'id',
    'assetId',
    'layerId',
    'position',
    'rotationY',
    'scale',
    'groundOffsetY',
  ]);
  const id = safePlacementId(record.id, `placement ${index} id`);
  if (!isNaturePlacementAssetId(record.assetId)) fail(`placement ${id} has unknown assetId`);
  const rotationY = finiteNumber(record.rotationY, `placement ${id} rotationY`);
  const scale = finiteNumber(record.scale, `placement ${id} scale`);
  const groundOffsetY = finiteNumber(record.groundOffsetY, `placement ${id} groundOffsetY`);
  if (rotationY < 0 || rotationY >= Math.PI * 2) fail(`placement ${id} rotationY is outside limits`);
  if (scale < NATURE_PLACEMENT_LIMITS.scaleMin || scale > NATURE_PLACEMENT_LIMITS.scaleMax) {
    fail(`placement ${id} scale is outside limits`);
  }
  if (
    groundOffsetY < NATURE_PLACEMENT_LIMITS.groundOffsetMin ||
    groundOffsetY > NATURE_PLACEMENT_LIMITS.groundOffsetMax
  ) {
    fail(`placement ${id} groundOffsetY is outside limits`);
  }
  return {
    id,
    assetId: record.assetId,
    layerId: safeLayerId(record.layerId, `placement ${id} layerId`),
    position: point(record.position, `placement ${id} position`),
    rotationY,
    scale,
    groundOffsetY,
  };
}

function boundsForPlacements(placements: readonly NatureZonePlacement[]): NatureZoneBounds {
  if (placements.length === 0) fail('zone package must contain at least one placement');
  const first = placements[0];
  let minX = first.position.x;
  let maxX = first.position.x;
  let minY = first.position.y + first.groundOffsetY;
  let maxY = minY;
  let minZ = first.position.z;
  let maxZ = first.position.z;
  for (const entry of placements.slice(1)) {
    const worldY = entry.position.y + entry.groundOffsetY;
    minX = Math.min(minX, entry.position.x);
    maxX = Math.max(maxX, entry.position.x);
    minY = Math.min(minY, worldY);
    maxY = Math.max(maxY, worldY);
    minZ = Math.min(minZ, entry.position.z);
    maxZ = Math.max(maxZ, entry.position.z);
  }
  return { minX, maxX, minY, maxY, minZ, maxZ };
}

function summariesForPlacements(
  placements: readonly NatureZonePlacement[],
): NatureZoneAssetSummary[] {
  const counts = new Map<NaturePlacementAssetId, number>();
  for (const entry of placements) counts.set(entry.assetId, (counts.get(entry.assetId) ?? 0) + 1);
  return [...counts]
    .sort(([left], [right]) => compareText(left, right))
    .map(([assetId, placementCount]) => {
      const metadata = NATURE_PLACEMENT_ASSET_METADATA[assetId];
      return {
        assetId,
        assetPath: naturePlacementAsset(assetId).assetPath,
        placementCount,
        estimatedTriangles: metadata.triangles * placementCount,
        mediaBytes: metadata.mediaBytes,
      };
    });
}

function statisticsForSummaries(
  placementCount: number,
  summaries: readonly NatureZoneAssetSummary[],
): NatureZoneStatistics {
  return {
    placementCount,
    estimatedTriangles: summaries.reduce((sum, entry) => sum + entry.estimatedTriangles, 0),
    uniqueMediaBytes: summaries.reduce((sum, entry) => sum + entry.mediaBytes, 0),
  };
}

function exactNumbers(
  value: Record<string, unknown>,
  expected: NatureZoneBounds,
  label: string,
): void {
  for (const [key, expectedValue] of Object.entries(expected)) {
    const actual = finiteNumber(value[key], `${label}.${key}`);
    if (actual !== expectedValue) fail(`${label}.${key} is inconsistent`);
  }
}

function validateAssetPath(value: unknown, assetId: NaturePlacementAssetId): string {
  if (typeof value !== 'string' || value.length === 0) fail(`asset ${assetId} path is invalid`);
  if (
    value.startsWith('/') ||
    value.startsWith('\\') ||
    /^[A-Za-z]:[\\/]/.test(value) ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/.test(value) ||
    value.split(/[\\/]/).includes('..')
  ) {
    fail(`asset ${assetId} path must be local and relative`);
  }
  if (value !== naturePlacementAsset(assetId).assetPath) fail(`asset ${assetId} path is unknown`);
  return value;
}

export function compileNaturePlacementZone(
  project: NaturePlacementProject,
  zoneId: string,
  name: string,
  includedLayerIds: readonly string[],
): NatureZonePackage {
  const validatedProject = validateNaturePlacementProject(cloneNaturePlacementProject(project));
  const validatedZoneId = safeZoneId(zoneId);
  const validatedName = safeName(name);
  if (validatedProject.placements.length === 0) fail('cannot compile an empty project');
  if (includedLayerIds.length === 0) fail('includedLayerIds must not be empty');
  const selectedLayers = includedLayerIds.map((layerId, index) =>
    safeLayerId(layerId, `includedLayerIds ${index}`),
  );
  if (new Set(selectedLayers).size !== selectedLayers.length) fail('includedLayerIds has duplicates');
  const knownLayerIds = new Set(validatedProject.layers.map((layer) => layer.layerId));
  for (const layerId of selectedLayers) {
    if (!knownLayerIds.has(layerId)) fail(`unknown included layerId: ${layerId}`);
  }
  const included = new Set(selectedLayers);
  const placements = validatedProject.placements
    .filter((entry) => included.has(entry.layerId))
    .sort((left, right) => compareText(left.id, right.id))
    .map<NatureZonePlacement>((entry) => ({
      id: entry.id,
      assetId: entry.assetId,
      layerId: entry.layerId,
      position: { x: entry.position.x, y: entry.position.y, z: entry.position.z },
      rotationY: entry.rotationY,
      scale: entry.scale,
      groundOffsetY: entry.groundOffsetY,
    }));
  if (placements.length === 0) fail('selected layers contain no placements');
  const assetSummary = summariesForPlacements(placements);
  return validateNatureZonePackage({
    version: NATURE_ZONE_PACKAGE_VERSION,
    zoneId: validatedZoneId,
    name: validatedName,
    sourceProjectId: validatedProject.projectId,
    sourceProjectVersion: validatedProject.version,
    coordinateSpace: NATURE_ZONE_COORDINATE_SPACE,
    includedLayerIds: [...selectedLayers].sort(compareText),
    bounds: boundsForPlacements(placements),
    placements,
    assetSummary,
    statistics: statisticsForSummaries(placements.length, assetSummary),
  });
}

export function validateNatureZonePackage(value: unknown): NatureZonePackage {
  rejectDangerousProperties(value);
  const record = strictRecord(value, 'zone package', [
    'version',
    'zoneId',
    'name',
    'sourceProjectId',
    'sourceProjectVersion',
    'coordinateSpace',
    'includedLayerIds',
    'bounds',
    'placements',
    'assetSummary',
    'statistics',
  ]);
  if (record.version !== NATURE_ZONE_PACKAGE_VERSION) {
    fail(`unsupported zone package version: ${String(record.version)}`);
  }
  const zoneId = safeZoneId(record.zoneId);
  const name = safeName(record.name);
  const sourceProjectId = safeLayerId(record.sourceProjectId, 'sourceProjectId');
  if (record.sourceProjectVersion !== 2) fail('unsupported source project version');
  if (record.coordinateSpace !== NATURE_ZONE_COORDINATE_SPACE) fail('unsupported coordinateSpace');
  if (!Array.isArray(record.includedLayerIds) || record.includedLayerIds.length === 0) {
    fail('includedLayerIds must be a non-empty array');
  }
  const includedLayerIds = record.includedLayerIds.map((entry, index) =>
    safeLayerId(entry, `includedLayerIds ${index}`),
  );
  if (new Set(includedLayerIds).size !== includedLayerIds.length) fail('includedLayerIds has duplicates');
  const sortedLayerIds = [...includedLayerIds].sort(compareText);
  if (includedLayerIds.some((entry, index) => entry !== sortedLayerIds[index])) {
    fail('includedLayerIds must be sorted');
  }
  if (!Array.isArray(record.placements)) fail('placements must be an array');
  if (record.placements.length === 0 || record.placements.length > NATURE_PLACEMENT_LIMITS.maxPlacements) {
    fail(`placement count must be between 1 and ${NATURE_PLACEMENT_LIMITS.maxPlacements}`);
  }
  const placements = record.placements.map(placement);
  const placementIds = new Set<string>();
  const included = new Set(includedLayerIds);
  for (const entry of placements) {
    if (placementIds.has(entry.id)) fail(`duplicate placement id: ${entry.id}`);
    if (!included.has(entry.layerId)) fail(`placement ${entry.id} has undeclared layerId`);
    placementIds.add(entry.id);
  }
  const sortedPlacements = [...placements].sort((left, right) => compareText(left.id, right.id));
  if (placements.some((entry, index) => entry.id !== sortedPlacements[index].id)) {
    fail('placements must be sorted by id');
  }

  const expectedBounds = boundsForPlacements(placements);
  const boundsRecord = strictRecord(record.bounds, 'bounds', [
    'minX',
    'maxX',
    'minY',
    'maxY',
    'minZ',
    'maxZ',
  ]);
  exactNumbers(boundsRecord, expectedBounds, 'bounds');
  if (
    expectedBounds.minX > expectedBounds.maxX ||
    expectedBounds.minY > expectedBounds.maxY ||
    expectedBounds.minZ > expectedBounds.maxZ
  ) {
    fail('bounds are incoherent');
  }

  if (!Array.isArray(record.assetSummary)) fail('assetSummary must be an array');
  const expectedSummaries = summariesForPlacements(placements);
  if (record.assetSummary.length !== expectedSummaries.length) fail('assetSummary is inconsistent');
  const assetSummary = record.assetSummary.map((entry, index) => {
    const summary = strictRecord(entry, `assetSummary ${index}`, [
      'assetId',
      'assetPath',
      'placementCount',
      'estimatedTriangles',
      'mediaBytes',
    ]);
    if (!isNaturePlacementAssetId(summary.assetId)) fail(`assetSummary ${index} has unknown assetId`);
    const parsed: NatureZoneAssetSummary = {
      assetId: summary.assetId,
      assetPath: validateAssetPath(summary.assetPath, summary.assetId),
      placementCount: nonNegativeInteger(summary.placementCount, `assetSummary ${index}.placementCount`),
      estimatedTriangles: nonNegativeInteger(
        summary.estimatedTriangles,
        `assetSummary ${index}.estimatedTriangles`,
      ),
      mediaBytes: nonNegativeInteger(summary.mediaBytes, `assetSummary ${index}.mediaBytes`),
    };
    if (JSON.stringify(parsed) !== JSON.stringify(expectedSummaries[index])) {
      fail(`assetSummary ${index} is inconsistent`);
    }
    return parsed;
  });

  const expectedStatistics = statisticsForSummaries(placements.length, expectedSummaries);
  const statisticsRecord = strictRecord(record.statistics, 'statistics', [
    'placementCount',
    'estimatedTriangles',
    'uniqueMediaBytes',
  ]);
  const statistics: NatureZoneStatistics = {
    placementCount: nonNegativeInteger(statisticsRecord.placementCount, 'statistics.placementCount'),
    estimatedTriangles: nonNegativeInteger(
      statisticsRecord.estimatedTriangles,
      'statistics.estimatedTriangles',
    ),
    uniqueMediaBytes: nonNegativeInteger(
      statisticsRecord.uniqueMediaBytes,
      'statistics.uniqueMediaBytes',
    ),
  };
  if (JSON.stringify(statistics) !== JSON.stringify(expectedStatistics)) {
    fail('statistics are inconsistent');
  }

  return {
    version: NATURE_ZONE_PACKAGE_VERSION,
    zoneId,
    name,
    sourceProjectId,
    sourceProjectVersion: 2,
    coordinateSpace: NATURE_ZONE_COORDINATE_SPACE,
    includedLayerIds: [...includedLayerIds],
    bounds: { ...expectedBounds },
    placements: placements.map((entry) => ({ ...entry, position: { ...entry.position } })),
    assetSummary: assetSummary.map((entry) => ({ ...entry })),
    statistics: { ...statistics },
  };
}

export function parseNatureZonePackageJson(source: string): NatureZonePackage {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    fail('invalid zone package JSON');
  }
  return validateNatureZonePackage(parsed);
}

export function serializeNatureZonePackage(zonePackage: NatureZonePackage): string {
  const validated = validateNatureZonePackage(zonePackage);
  return `${JSON.stringify(validated, null, 2)}\n`;
}

export function natureZonePreviewPlacements(
  zonePackage: NatureZonePackage,
): NatureProjectPlacement[] {
  return validateNatureZonePackage(zonePackage).placements.map((entry) => ({
    ...entry,
    position: { ...entry.position },
  }));
}
