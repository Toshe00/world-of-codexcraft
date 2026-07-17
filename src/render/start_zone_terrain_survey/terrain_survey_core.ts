export const START_ZONE_TERRAIN_SURVEY_VERSION = 1 as const;
export const START_ZONE_TERRAIN_SURVEY_STORAGE_KEY =
  'dev.start-zone-terrain-survey.anchors.v1';

export const TERRAIN_SURVEY_RESOLUTIONS = [0.5, 1, 2, 5] as const;
export type TerrainSurveyResolution = (typeof TERRAIN_SURVEY_RESOLUTIONS)[number];
export const DEFAULT_TERRAIN_SURVEY_RESOLUTION: TerrainSurveyResolution = 1;

export const TERRAIN_SURVEY_CRITERIA = Object.freeze({
  flatSlopeDegrees: 5,
  moderateSlopeDegrees: 12,
  cornerToleranceMeters: 0.2,
  protectedClearanceMeters: 0.5,
  compatibilityCandidateStepMeters: 2,
  largestSurfaceLimit: 8,
});

export type TerrainSlopeClass = 'flat' | 'moderate' | 'steep';
export type TerrainAnchorType =
  | 'building-small'
  | 'building-medium'
  | 'building-large'
  | 'plaza'
  | 'road'
  | 'decorative'
  | 'avoid';

export const TERRAIN_ANCHOR_TYPES: readonly TerrainAnchorType[] = Object.freeze([
  'building-small',
  'building-medium',
  'building-large',
  'plaza',
  'road',
  'decorative',
  'avoid',
]);

export type FootprintTemplateId =
  | 'small-house'
  | 'medium-house'
  | 'large-house'
  | 'central-plaza'
  | 'road';

export interface FootprintTemplate {
  id: FootprintTemplateId;
  width: number;
  depth: number;
  maxHeightDifference: number;
  maxSlopeDegrees: number;
  proposedType: TerrainAnchorType;
}

export const FOOTPRINT_TEMPLATES: readonly FootprintTemplate[] = Object.freeze([
  Object.freeze({
    id: 'small-house',
    width: 6,
    depth: 6,
    maxHeightDifference: 0.8,
    maxSlopeDegrees: TERRAIN_SURVEY_CRITERIA.flatSlopeDegrees,
    proposedType: 'building-small',
  }),
  Object.freeze({
    id: 'medium-house',
    width: 10,
    depth: 8,
    maxHeightDifference: 1,
    maxSlopeDegrees: TERRAIN_SURVEY_CRITERIA.flatSlopeDegrees,
    proposedType: 'building-medium',
  }),
  Object.freeze({
    id: 'large-house',
    width: 14,
    depth: 12,
    maxHeightDifference: 1.2,
    maxSlopeDegrees: TERRAIN_SURVEY_CRITERIA.flatSlopeDegrees,
    proposedType: 'building-large',
  }),
  Object.freeze({
    id: 'central-plaza',
    width: 20,
    depth: 20,
    maxHeightDifference: 0.6,
    maxSlopeDegrees: TERRAIN_SURVEY_CRITERIA.flatSlopeDegrees,
    proposedType: 'plaza',
  }),
  Object.freeze({
    id: 'road',
    width: 4,
    depth: 12,
    maxHeightDifference: 2.5,
    maxSlopeDegrees: TERRAIN_SURVEY_CRITERIA.moderateSlopeDegrees,
    proposedType: 'road',
  }),
]);

const footprintTemplateById = new Map(
  FOOTPRINT_TEMPLATES.map((template) => [template.id, template]),
);

export interface TerrainSurveyEnvironment {
  DEV: boolean;
  PROD?: boolean;
  VITE_START_ZONE_TERRAIN_LAB?: string;
}

export interface TerrainSurveyBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface TerrainSurveyPoint2 {
  x: number;
  z: number;
}

export interface TerrainSurveyPoint3 extends TerrainSurveyPoint2 {
  y: number;
}

export type ProtectedElementKind =
  | 'npc'
  | 'merchant'
  | 'campfire'
  | 'well'
  | 'portal'
  | 'building'
  | 'building-entrance'
  | 'road'
  | 'quest-point'
  | 'spawn-point'
  | 'mailbox';

interface ProtectedZoneBase {
  id: string;
  name: string;
  kind: ProtectedElementKind;
}

export interface ProtectedCircleZone extends ProtectedZoneBase {
  shape: 'circle';
  x: number;
  z: number;
  radius: number;
}

export interface ProtectedCorridorZone extends ProtectedZoneBase {
  shape: 'corridor';
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  radius: number;
}

export interface ProtectedRectangleZone extends ProtectedZoneBase {
  shape: 'rectangle';
  x: number;
  z: number;
  width: number;
  depth: number;
  rotationY: number;
}

export type ProtectedZone =
  | ProtectedCircleZone
  | ProtectedCorridorZone
  | ProtectedRectangleZone;

export interface TerrainGridSample extends TerrainSurveyPoint3 {
  slopeDegrees: number;
  slopeOrientationRadians: number;
  slopeClass: TerrainSlopeClass;
  distanceToProtected: number;
  nearestProtectedZoneId: string | null;
}

export interface TerrainSurveyGrid {
  bounds: TerrainSurveyBounds;
  resolution: TerrainSurveyResolution;
  columns: number;
  rows: number;
  samples: TerrainGridSample[];
}

export interface ContiguousSurface {
  sampleCount: number;
  areaSquareMeters: number;
  bounds: TerrainSurveyBounds;
  center: TerrainSurveyPoint2;
}

export interface CompatibilitySummary {
  templateId: FootprintTemplateId;
  compatibleCandidateCount: number;
  compatibleSurfaceCount: number;
  largestSurfaceAreaSquareMeters: number;
}

export interface TerrainSurveyStatistics {
  minimumHeight: number;
  maximumHeight: number;
  totalHeightDifference: number;
  averageSlopeDegrees: number;
  maximumSlopeDegrees: number;
  flatSurfacePercent: number;
  moderateSurfacePercent: number;
  steepSurfacePercent: number;
  largestFlatSurfaces: ContiguousSurface[];
  compatibility: Record<FootprintTemplateId, CompatibilitySummary>;
}

export type FootprintCornerName = 'north-west' | 'north-east' | 'south-east' | 'south-west';

export interface FootprintCornerResult extends TerrainSurveyPoint3 {
  name: FootprintCornerName;
  differenceFromAverage: number;
  status: 'level' | 'floating' | 'buried';
}

export interface FootprintRequest {
  centerX: number;
  centerZ: number;
  width: number;
  depth: number;
  rotationY: number;
}

export interface FootprintAnalysis extends FootprintRequest {
  averageHeight: number;
  maximumHeightDifference: number;
  maximumSlopeDegrees: number;
  floatingCorners: FootprintCornerResult[];
  buriedCorners: FootprintCornerResult[];
  corners: FootprintCornerResult[];
  compatible: boolean;
  protectedZoneIds: string[];
  recommendedVerticalCorrection: number;
}

export interface TerrainAnchor {
  id: string;
  name: string;
  position: TerrainSurveyPoint3;
  rotationY: number;
  width: number;
  depth: number;
  averageHeight: number;
  maximumHeightDifference: number;
  maximumSlopeDegrees: number;
  proposedType: TerrainAnchorType;
  notes: string;
}

export interface TerrainSurveyZoneDescription {
  id: string;
  name: string;
  center: TerrainSurveyPoint2;
  bounds: TerrainSurveyBounds;
}

export interface TerrainSurveyReport {
  version: typeof START_ZONE_TERRAIN_SURVEY_VERSION;
  analyzedZone: TerrainSurveyZoneDescription;
  samplingParameters: {
    resolution: TerrainSurveyResolution;
    heightSource: 'terrainHeight';
    flatSlopeDegrees: number;
    moderateSlopeDegrees: number;
  };
  statistics: TerrainSurveyStatistics;
  protectedZones: ProtectedZone[];
  anchors: TerrainAnchor[];
  recommendations: TerrainSurveyRecommendation[];
}

export interface TerrainSurveyRecommendation {
  strategy: 'platform' | 'separate-buildings' | 'integrated-floor';
  recommended: boolean;
  reasonCodes: string[];
}

export type HeightSampler = (x: number, z: number) => number;

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite`);
}

function assertPositive(value: number, label: string): void {
  assertFinite(value, label);
  if (value <= 0) throw new RangeError(`${label} must be positive`);
}

function assertBounds(bounds: TerrainSurveyBounds): void {
  assertFinite(bounds.minX, 'bounds.minX');
  assertFinite(bounds.maxX, 'bounds.maxX');
  assertFinite(bounds.minZ, 'bounds.minZ');
  assertFinite(bounds.maxZ, 'bounds.maxZ');
  if (bounds.minX >= bounds.maxX || bounds.minZ >= bounds.maxZ) {
    throw new RangeError('survey bounds must have positive area');
  }
}

function isResolution(value: number): value is TerrainSurveyResolution {
  return TERRAIN_SURVEY_RESOLUTIONS.some((resolution) => resolution === value);
}

function cloneBounds(bounds: TerrainSurveyBounds): TerrainSurveyBounds {
  return { minX: bounds.minX, maxX: bounds.maxX, minZ: bounds.minZ, maxZ: bounds.maxZ };
}

function round(value: number, digits = 6): number {
  const scale = 10 ** digits;
  const result = Math.round(value * scale) / scale;
  return Object.is(result, -0) ? 0 : result;
}

function distanceToSegment(
  x: number,
  z: number,
  x1: number,
  z1: number,
  x2: number,
  z2: number,
): number {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared === 0) return Math.hypot(x - x1, z - z1);
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / lengthSquared));
  return Math.hypot(x - (x1 + dx * t), z - (z1 + dz * t));
}

function rotatedLocalPoint(
  x: number,
  z: number,
  centerX: number,
  centerZ: number,
  rotationY: number,
): TerrainSurveyPoint2 {
  const dx = x - centerX;
  const dz = z - centerZ;
  const c = Math.cos(rotationY);
  const s = Math.sin(rotationY);
  return { x: dx * c - dz * s, z: dx * s + dz * c };
}

function signedDistanceToRectangle(
  x: number,
  z: number,
  zone: ProtectedRectangleZone,
): number {
  const local = rotatedLocalPoint(x, z, zone.x, zone.z, zone.rotationY);
  const dx = Math.abs(local.x) - zone.width / 2;
  const dz = Math.abs(local.z) - zone.depth / 2;
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dz, 0));
  const inside = Math.min(Math.max(dx, dz), 0);
  return outside + inside;
}

export function starterZoneTerrainSurveyEnabled(environment: TerrainSurveyEnvironment): boolean {
  return (
    environment.DEV &&
    environment.PROD !== true &&
    environment.VITE_START_ZONE_TERRAIN_LAB === '1'
  );
}

export function footprintTemplate(id: FootprintTemplateId): FootprintTemplate {
  const template = footprintTemplateById.get(id);
  if (!template) throw new RangeError(`unknown footprint template: ${id}`);
  return template;
}

export function classifyTerrainSlope(slopeDegrees: number): TerrainSlopeClass {
  assertFinite(slopeDegrees, 'slopeDegrees');
  if (slopeDegrees < TERRAIN_SURVEY_CRITERIA.flatSlopeDegrees) return 'flat';
  if (slopeDegrees <= TERRAIN_SURVEY_CRITERIA.moderateSlopeDegrees) return 'moderate';
  return 'steep';
}

export function distanceToProtectedZone(x: number, z: number, zone: ProtectedZone): number {
  assertFinite(x, 'x');
  assertFinite(z, 'z');
  if (zone.shape === 'circle') {
    assertFinite(zone.x, 'protected circle x');
    assertFinite(zone.z, 'protected circle z');
    assertPositive(zone.radius, 'protected circle radius');
    return Math.hypot(x - zone.x, z - zone.z) - zone.radius;
  }
  if (zone.shape === 'corridor') {
    assertFinite(zone.x1, 'protected corridor x1');
    assertFinite(zone.z1, 'protected corridor z1');
    assertFinite(zone.x2, 'protected corridor x2');
    assertFinite(zone.z2, 'protected corridor z2');
    assertPositive(zone.radius, 'protected corridor radius');
    return distanceToSegment(x, z, zone.x1, zone.z1, zone.x2, zone.z2) - zone.radius;
  }
  assertFinite(zone.x, 'protected rectangle x');
  assertFinite(zone.z, 'protected rectangle z');
  assertPositive(zone.width, 'protected rectangle width');
  assertPositive(zone.depth, 'protected rectangle depth');
  assertFinite(zone.rotationY, 'protected rectangle rotationY');
  return signedDistanceToRectangle(x, z, zone);
}

function nearestProtected(
  x: number,
  z: number,
  protectedZones: readonly ProtectedZone[],
): { distance: number; id: string | null } {
  let distance = Number.POSITIVE_INFINITY;
  let id: string | null = null;
  for (const zone of protectedZones) {
    const candidate = distanceToProtectedZone(x, z, zone);
    if (candidate < distance || (candidate === distance && zone.id < (id ?? '\uffff'))) {
      distance = candidate;
      id = zone.id;
    }
  }
  return { distance, id };
}

export function sampleTerrainGrid(options: {
  bounds: TerrainSurveyBounds;
  resolution: TerrainSurveyResolution;
  sampleHeight: HeightSampler;
  protectedZones?: readonly ProtectedZone[];
}): TerrainSurveyGrid {
  assertBounds(options.bounds);
  if (!isResolution(options.resolution)) throw new RangeError('unsupported terrain resolution');
  const protectedZones = options.protectedZones ?? [];
  const columns = Math.floor((options.bounds.maxX - options.bounds.minX) / options.resolution) + 1;
  const rows = Math.floor((options.bounds.maxZ - options.bounds.minZ) / options.resolution) + 1;
  const gradientStep = options.resolution;
  const samples: TerrainGridSample[] = [];
  for (let row = 0; row < rows; row++) {
    const z = options.bounds.minZ + row * options.resolution;
    for (let column = 0; column < columns; column++) {
      const x = options.bounds.minX + column * options.resolution;
      const y = options.sampleHeight(x, z);
      const dx =
        (options.sampleHeight(x + gradientStep, z) -
          options.sampleHeight(x - gradientStep, z)) /
        (2 * gradientStep);
      const dz =
        (options.sampleHeight(x, z + gradientStep) -
          options.sampleHeight(x, z - gradientStep)) /
        (2 * gradientStep);
      assertFinite(y, 'sampleHeight result');
      assertFinite(dx, 'terrain x gradient');
      assertFinite(dz, 'terrain z gradient');
      const slopeDegrees = (Math.atan(Math.hypot(dx, dz)) * 180) / Math.PI;
      const nearest = nearestProtected(x, z, protectedZones);
      samples.push({
        x,
        y,
        z,
        slopeDegrees,
        slopeOrientationRadians: Math.atan2(dz, dx),
        slopeClass: classifyTerrainSlope(slopeDegrees),
        distanceToProtected: nearest.distance,
        nearestProtectedZoneId: nearest.id,
      });
    }
  }
  return {
    bounds: cloneBounds(options.bounds),
    resolution: options.resolution,
    columns,
    rows,
    samples,
  };
}

function sampleAt(grid: TerrainSurveyGrid, column: number, row: number): TerrainGridSample {
  const sample = grid.samples[row * grid.columns + column];
  if (!sample) throw new RangeError('terrain grid index outside samples');
  return sample;
}

function surfaceFromIndices(grid: TerrainSurveyGrid, indices: readonly number[]): ContiguousSurface {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  let sumX = 0;
  let sumZ = 0;
  for (const index of indices) {
    const sample = grid.samples[index];
    if (!sample) continue;
    minX = Math.min(minX, sample.x);
    maxX = Math.max(maxX, sample.x);
    minZ = Math.min(minZ, sample.z);
    maxZ = Math.max(maxZ, sample.z);
    sumX += sample.x;
    sumZ += sample.z;
  }
  return {
    sampleCount: indices.length,
    areaSquareMeters: indices.length * grid.resolution * grid.resolution,
    bounds: { minX, maxX, minZ, maxZ },
    center: { x: sumX / indices.length, z: sumZ / indices.length },
  };
}

function contiguousFlatSurfaces(grid: TerrainSurveyGrid): ContiguousSurface[] {
  const visited = new Uint8Array(grid.samples.length);
  const surfaces: ContiguousSurface[] = [];
  for (let start = 0; start < grid.samples.length; start++) {
    const startSample = grid.samples[start];
    if (
      visited[start] ||
      !startSample ||
      startSample.slopeClass !== 'flat' ||
      startSample.distanceToProtected < TERRAIN_SURVEY_CRITERIA.protectedClearanceMeters
    ) {
      continue;
    }
    const queue = [start];
    const component: number[] = [];
    visited[start] = 1;
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const index = queue[cursor];
      if (index === undefined) continue;
      component.push(index);
      const column = index % grid.columns;
      const row = Math.floor(index / grid.columns);
      const neighbors = [
        column > 0 ? index - 1 : -1,
        column + 1 < grid.columns ? index + 1 : -1,
        row > 0 ? index - grid.columns : -1,
        row + 1 < grid.rows ? index + grid.columns : -1,
      ];
      for (const neighbor of neighbors) {
        if (neighbor < 0 || visited[neighbor]) continue;
        const sample = grid.samples[neighbor];
        if (
          sample?.slopeClass === 'flat' &&
          sample.distanceToProtected >= TERRAIN_SURVEY_CRITERIA.protectedClearanceMeters
        ) {
          visited[neighbor] = 1;
          queue.push(neighbor);
        }
      }
    }
    surfaces.push(surfaceFromIndices(grid, component));
  }
  return surfaces
    .sort(
      (left, right) =>
        right.areaSquareMeters - left.areaSquareMeters ||
        left.center.x - right.center.x ||
        left.center.z - right.center.z,
    )
    .slice(0, TERRAIN_SURVEY_CRITERIA.largestSurfaceLimit);
}

function gridCandidateCompatible(
  grid: TerrainSurveyGrid,
  centerColumn: number,
  centerRow: number,
  template: FootprintTemplate,
): boolean {
  const halfColumns = Math.ceil(template.width / (2 * grid.resolution));
  const halfRows = Math.ceil(template.depth / (2 * grid.resolution));
  if (
    centerColumn - halfColumns < 0 ||
    centerColumn + halfColumns >= grid.columns ||
    centerRow - halfRows < 0 ||
    centerRow + halfRows >= grid.rows
  ) {
    return false;
  }
  let minimumHeight = Number.POSITIVE_INFINITY;
  let maximumHeight = Number.NEGATIVE_INFINITY;
  for (let row = centerRow - halfRows; row <= centerRow + halfRows; row++) {
    for (let column = centerColumn - halfColumns; column <= centerColumn + halfColumns; column++) {
      const sample = sampleAt(grid, column, row);
      if (
        sample.slopeDegrees > template.maxSlopeDegrees ||
        sample.distanceToProtected < TERRAIN_SURVEY_CRITERIA.protectedClearanceMeters
      ) {
        return false;
      }
      minimumHeight = Math.min(minimumHeight, sample.y);
      maximumHeight = Math.max(maximumHeight, sample.y);
      if (maximumHeight - minimumHeight > template.maxHeightDifference) return false;
    }
  }
  return true;
}

function compatibilitySummary(
  grid: TerrainSurveyGrid,
  template: FootprintTemplate,
): CompatibilitySummary {
  const stride = Math.max(
    1,
    Math.round(TERRAIN_SURVEY_CRITERIA.compatibilityCandidateStepMeters / grid.resolution),
  );
  const candidateColumns = Math.ceil(grid.columns / stride);
  const candidateRows = Math.ceil(grid.rows / stride);
  const compatible = new Uint8Array(candidateColumns * candidateRows);
  let compatibleCandidateCount = 0;
  for (let candidateRow = 0; candidateRow < candidateRows; candidateRow++) {
    const row = candidateRow * stride;
    if (row >= grid.rows) continue;
    for (let candidateColumn = 0; candidateColumn < candidateColumns; candidateColumn++) {
      const column = candidateColumn * stride;
      if (column >= grid.columns) continue;
      if (gridCandidateCompatible(grid, column, row, template)) {
        compatible[candidateRow * candidateColumns + candidateColumn] = 1;
        compatibleCandidateCount++;
      }
    }
  }
  const visited = new Uint8Array(compatible.length);
  let compatibleSurfaceCount = 0;
  let largestCandidateCount = 0;
  for (let start = 0; start < compatible.length; start++) {
    if (!compatible[start] || visited[start]) continue;
    compatibleSurfaceCount++;
    let componentCount = 0;
    const queue = [start];
    visited[start] = 1;
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const index = queue[cursor];
      if (index === undefined) continue;
      componentCount++;
      const column = index % candidateColumns;
      const row = Math.floor(index / candidateColumns);
      const neighbors = [
        column > 0 ? index - 1 : -1,
        column + 1 < candidateColumns ? index + 1 : -1,
        row > 0 ? index - candidateColumns : -1,
        row + 1 < candidateRows ? index + candidateColumns : -1,
      ];
      for (const neighbor of neighbors) {
        if (neighbor >= 0 && compatible[neighbor] && !visited[neighbor]) {
          visited[neighbor] = 1;
          queue.push(neighbor);
        }
      }
    }
    largestCandidateCount = Math.max(largestCandidateCount, componentCount);
  }
  const step = stride * grid.resolution;
  return {
    templateId: template.id,
    compatibleCandidateCount,
    compatibleSurfaceCount,
    largestSurfaceAreaSquareMeters: largestCandidateCount * step * step,
  };
}

export function analyzeTerrainSurvey(grid: TerrainSurveyGrid): TerrainSurveyStatistics {
  if (grid.samples.length === 0) throw new RangeError('terrain grid must contain samples');
  let minimumHeight = Number.POSITIVE_INFINITY;
  let maximumHeight = Number.NEGATIVE_INFINITY;
  let slopeSum = 0;
  let maximumSlopeDegrees = 0;
  let flat = 0;
  let moderate = 0;
  let steep = 0;
  for (const sample of grid.samples) {
    minimumHeight = Math.min(minimumHeight, sample.y);
    maximumHeight = Math.max(maximumHeight, sample.y);
    slopeSum += sample.slopeDegrees;
    maximumSlopeDegrees = Math.max(maximumSlopeDegrees, sample.slopeDegrees);
    if (sample.slopeClass === 'flat') flat++;
    else if (sample.slopeClass === 'moderate') moderate++;
    else steep++;
  }
  const compatibilityEntries = FOOTPRINT_TEMPLATES.map((template) => [
    template.id,
    compatibilitySummary(grid, template),
  ]) as [FootprintTemplateId, CompatibilitySummary][];
  return {
    minimumHeight,
    maximumHeight,
    totalHeightDifference: maximumHeight - minimumHeight,
    averageSlopeDegrees: slopeSum / grid.samples.length,
    maximumSlopeDegrees,
    flatSurfacePercent: (flat / grid.samples.length) * 100,
    moderateSurfacePercent: (moderate / grid.samples.length) * 100,
    steepSurfacePercent: (steep / grid.samples.length) * 100,
    largestFlatSurfaces: contiguousFlatSurfaces(grid),
    compatibility: Object.fromEntries(compatibilityEntries) as Record<
      FootprintTemplateId,
      CompatibilitySummary
    >,
  };
}

function worldFootprintPoint(
  request: FootprintRequest,
  localX: number,
  localZ: number,
): TerrainSurveyPoint2 {
  const c = Math.cos(request.rotationY);
  const s = Math.sin(request.rotationY);
  return {
    x: request.centerX + localX * c + localZ * s,
    z: request.centerZ - localX * s + localZ * c,
  };
}

function protectedIdsUnderFootprint(
  request: FootprintRequest,
  protectedZones: readonly ProtectedZone[],
  step: number,
): string[] {
  const ids = new Set<string>();
  const xSteps = Math.max(1, Math.ceil(request.width / step));
  const zSteps = Math.max(1, Math.ceil(request.depth / step));
  for (let zi = 0; zi <= zSteps; zi++) {
    const localZ = -request.depth / 2 + (request.depth * zi) / zSteps;
    for (let xi = 0; xi <= xSteps; xi++) {
      const localX = -request.width / 2 + (request.width * xi) / xSteps;
      const point = worldFootprintPoint(request, localX, localZ);
      for (const zone of protectedZones) {
        if (
          distanceToProtectedZone(point.x, point.z, zone) <
          TERRAIN_SURVEY_CRITERIA.protectedClearanceMeters
        ) {
          ids.add(zone.id);
        }
      }
    }
  }
  return [...ids].sort();
}

export function analyzeRectangularFootprint(options: {
  request: FootprintRequest;
  sampleHeight: HeightSampler;
  protectedZones?: readonly ProtectedZone[];
  sampleStep?: number;
  maxHeightDifference?: number;
  maxSlopeDegrees?: number;
}): FootprintAnalysis {
  const request = options.request;
  assertFinite(request.centerX, 'centerX');
  assertFinite(request.centerZ, 'centerZ');
  assertPositive(request.width, 'width');
  assertPositive(request.depth, 'depth');
  assertFinite(request.rotationY, 'rotationY');
  const sampleStep = options.sampleStep ?? 1;
  assertPositive(sampleStep, 'sampleStep');
  const maxHeightDifference = options.maxHeightDifference ?? 1;
  const maxSlopeDegrees =
    options.maxSlopeDegrees ?? TERRAIN_SURVEY_CRITERIA.flatSlopeDegrees;
  assertPositive(maxHeightDifference, 'maxHeightDifference');
  assertPositive(maxSlopeDegrees, 'maxSlopeDegrees');
  const xSteps = Math.max(1, Math.ceil(request.width / sampleStep));
  const zSteps = Math.max(1, Math.ceil(request.depth / sampleStep));
  const heights: number[] = [];
  let maximumSlope = 0;
  for (let zi = 0; zi <= zSteps; zi++) {
    const localZ = -request.depth / 2 + (request.depth * zi) / zSteps;
    for (let xi = 0; xi <= xSteps; xi++) {
      const localX = -request.width / 2 + (request.width * xi) / xSteps;
      const point = worldFootprintPoint(request, localX, localZ);
      const height = options.sampleHeight(point.x, point.z);
      const dx =
        (options.sampleHeight(point.x + sampleStep, point.z) -
          options.sampleHeight(point.x - sampleStep, point.z)) /
        (2 * sampleStep);
      const dz =
        (options.sampleHeight(point.x, point.z + sampleStep) -
          options.sampleHeight(point.x, point.z - sampleStep)) /
        (2 * sampleStep);
      assertFinite(height, 'footprint terrain height');
      assertFinite(dx, 'footprint x gradient');
      assertFinite(dz, 'footprint z gradient');
      heights.push(height);
      maximumSlope = Math.max(maximumSlope, (Math.atan(Math.hypot(dx, dz)) * 180) / Math.PI);
    }
  }
  const averageHeight = heights.reduce((sum, height) => sum + height, 0) / heights.length;
  const minimumHeight = Math.min(...heights);
  const maximumHeight = Math.max(...heights);
  const cornerInputs: readonly [FootprintCornerName, number, number][] = [
    ['north-west', -request.width / 2, request.depth / 2],
    ['north-east', request.width / 2, request.depth / 2],
    ['south-east', request.width / 2, -request.depth / 2],
    ['south-west', -request.width / 2, -request.depth / 2],
  ];
  const corners = cornerInputs.map(([name, localX, localZ]): FootprintCornerResult => {
    const point = worldFootprintPoint(request, localX, localZ);
    const y = options.sampleHeight(point.x, point.z);
    assertFinite(y, 'footprint corner height');
    const differenceFromAverage = y - averageHeight;
    const status =
      differenceFromAverage < -TERRAIN_SURVEY_CRITERIA.cornerToleranceMeters
        ? 'floating'
        : differenceFromAverage > TERRAIN_SURVEY_CRITERIA.cornerToleranceMeters
          ? 'buried'
          : 'level';
    return { name, x: point.x, y, z: point.z, differenceFromAverage, status };
  });
  const protectedZoneIds = protectedIdsUnderFootprint(
    request,
    options.protectedZones ?? [],
    sampleStep,
  );
  const centerHeight = options.sampleHeight(request.centerX, request.centerZ);
  const maximumHeightDifference = maximumHeight - minimumHeight;
  return {
    ...request,
    averageHeight,
    maximumHeightDifference,
    maximumSlopeDegrees: maximumSlope,
    floatingCorners: corners.filter((corner) => corner.status === 'floating'),
    buriedCorners: corners.filter((corner) => corner.status === 'buried'),
    corners,
    compatible:
      maximumHeightDifference <= maxHeightDifference &&
      maximumSlope <= maxSlopeDegrees &&
      protectedZoneIds.length === 0,
    protectedZoneIds,
    recommendedVerticalCorrection: averageHeight - centerHeight,
  };
}

function isAnchorType(value: unknown): value is TerrainAnchorType {
  return TERRAIN_ANCHOR_TYPES.some((type) => type === value);
}

export function nextTerrainAnchorId(anchors: readonly TerrainAnchor[]): string {
  const taken = new Set(anchors.map((anchor) => anchor.id));
  let value = 1;
  let id = `survey-anchor-${String(value).padStart(3, '0')}`;
  while (taken.has(id)) {
    value++;
    id = `survey-anchor-${String(value).padStart(3, '0')}`;
  }
  return id;
}

export function createTerrainAnchor(options: {
  existingAnchors: readonly TerrainAnchor[];
  name: string;
  proposedType: TerrainAnchorType;
  notes: string;
  footprint: FootprintAnalysis;
}): TerrainAnchor {
  if (!isAnchorType(options.proposedType)) throw new RangeError('invalid terrain anchor type');
  if (typeof options.name !== 'string' || options.name.trim().length === 0) {
    throw new RangeError('terrain anchor name is required');
  }
  if (typeof options.notes !== 'string') throw new RangeError('terrain anchor notes must be text');
  const footprint = options.footprint;
  for (const [label, value] of Object.entries({
    centerX: footprint.centerX,
    centerZ: footprint.centerZ,
    rotationY: footprint.rotationY,
    width: footprint.width,
    depth: footprint.depth,
    averageHeight: footprint.averageHeight,
    maximumHeightDifference: footprint.maximumHeightDifference,
    maximumSlopeDegrees: footprint.maximumSlopeDegrees,
  })) {
    assertFinite(value, label);
  }
  return {
    id: nextTerrainAnchorId(options.existingAnchors),
    name: options.name.trim().slice(0, 80),
    position: {
      x: footprint.centerX,
      y: footprint.averageHeight,
      z: footprint.centerZ,
    },
    rotationY: footprint.rotationY,
    width: footprint.width,
    depth: footprint.depth,
    averageHeight: footprint.averageHeight,
    maximumHeightDifference: footprint.maximumHeightDifference,
    maximumSlopeDegrees: footprint.maximumSlopeDegrees,
    proposedType: options.proposedType,
    notes: options.notes.trim().slice(0, 500),
  };
}

export function parseTerrainAnchors(value: string | null): TerrainAnchor[] {
  if (!value) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const anchors: TerrainAnchor[] = [];
  const ids = new Set<string>();
  for (const candidate of parsed) {
    if (!candidate || typeof candidate !== 'object') continue;
    const record = candidate as Partial<TerrainAnchor>;
    if (
      typeof record.id !== 'string' ||
      !/^survey-anchor-\d{3,}$/.test(record.id) ||
      ids.has(record.id) ||
      typeof record.name !== 'string' ||
      record.name.trim().length === 0 ||
      typeof record.notes !== 'string' ||
      !record.position ||
      !isAnchorType(record.proposedType)
    ) {
      continue;
    }
    const numbers = [
      record.position.x,
      record.position.y,
      record.position.z,
      record.rotationY,
      record.width,
      record.depth,
      record.averageHeight,
      record.maximumHeightDifference,
      record.maximumSlopeDegrees,
    ];
    if (numbers.some((entry) => !Number.isFinite(entry))) continue;
    const anchor: TerrainAnchor = {
      id: record.id,
      name: record.name.slice(0, 80),
      position: { x: record.position.x, y: record.position.y, z: record.position.z },
      rotationY: record.rotationY as number,
      width: record.width as number,
      depth: record.depth as number,
      averageHeight: record.averageHeight as number,
      maximumHeightDifference: record.maximumHeightDifference as number,
      maximumSlopeDegrees: record.maximumSlopeDegrees as number,
      proposedType: record.proposedType,
      notes: record.notes.slice(0, 500),
    };
    if (anchor.width <= 0 || anchor.depth <= 0) continue;
    ids.add(anchor.id);
    anchors.push(anchor);
  }
  return anchors.sort((left, right) => left.id.localeCompare(right.id));
}

export function serializeTerrainAnchors(anchors: readonly TerrainAnchor[]): string {
  return `${JSON.stringify(canonicalAnchors(anchors), null, 2)}\n`;
}

function canonicalProtectedZones(zones: readonly ProtectedZone[]): ProtectedZone[] {
  return [...zones]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((zone) => {
      if (zone.shape === 'circle') {
        return {
          id: zone.id,
          name: zone.name,
          kind: zone.kind,
          shape: zone.shape,
          x: round(zone.x),
          z: round(zone.z),
          radius: round(zone.radius),
        };
      }
      if (zone.shape === 'corridor') {
        return {
          id: zone.id,
          name: zone.name,
          kind: zone.kind,
          shape: zone.shape,
          x1: round(zone.x1),
          z1: round(zone.z1),
          x2: round(zone.x2),
          z2: round(zone.z2),
          radius: round(zone.radius),
        };
      }
      return {
        id: zone.id,
        name: zone.name,
        kind: zone.kind,
        shape: zone.shape,
        x: round(zone.x),
        z: round(zone.z),
        width: round(zone.width),
        depth: round(zone.depth),
        rotationY: round(zone.rotationY),
      };
    });
}

function canonicalAnchors(anchors: readonly TerrainAnchor[]): TerrainAnchor[] {
  return [...anchors]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((anchor) => ({
      id: anchor.id,
      name: anchor.name,
      position: {
        x: round(anchor.position.x),
        y: round(anchor.position.y),
        z: round(anchor.position.z),
      },
      rotationY: round(anchor.rotationY),
      width: round(anchor.width),
      depth: round(anchor.depth),
      averageHeight: round(anchor.averageHeight),
      maximumHeightDifference: round(anchor.maximumHeightDifference),
      maximumSlopeDegrees: round(anchor.maximumSlopeDegrees),
      proposedType: anchor.proposedType,
      notes: anchor.notes,
    }));
}

function canonicalSurface(surface: ContiguousSurface): ContiguousSurface {
  return {
    sampleCount: surface.sampleCount,
    areaSquareMeters: round(surface.areaSquareMeters),
    bounds: {
      minX: round(surface.bounds.minX),
      maxX: round(surface.bounds.maxX),
      minZ: round(surface.bounds.minZ),
      maxZ: round(surface.bounds.maxZ),
    },
    center: { x: round(surface.center.x), z: round(surface.center.z) },
  };
}

function canonicalStatistics(statistics: TerrainSurveyStatistics): TerrainSurveyStatistics {
  const compatibility = Object.fromEntries(
    FOOTPRINT_TEMPLATES.map((template) => {
      const value = statistics.compatibility[template.id];
      return [
        template.id,
        {
          templateId: value.templateId,
          compatibleCandidateCount: value.compatibleCandidateCount,
          compatibleSurfaceCount: value.compatibleSurfaceCount,
          largestSurfaceAreaSquareMeters: round(value.largestSurfaceAreaSquareMeters),
        },
      ];
    }),
  ) as Record<FootprintTemplateId, CompatibilitySummary>;
  return {
    minimumHeight: round(statistics.minimumHeight),
    maximumHeight: round(statistics.maximumHeight),
    totalHeightDifference: round(statistics.totalHeightDifference),
    averageSlopeDegrees: round(statistics.averageSlopeDegrees),
    maximumSlopeDegrees: round(statistics.maximumSlopeDegrees),
    flatSurfacePercent: round(statistics.flatSurfacePercent),
    moderateSurfacePercent: round(statistics.moderateSurfacePercent),
    steepSurfacePercent: round(statistics.steepSurfacePercent),
    largestFlatSurfaces: statistics.largestFlatSurfaces.map(canonicalSurface),
    compatibility,
  };
}

export function terrainSurveyRecommendations(
  statistics: TerrainSurveyStatistics,
): TerrainSurveyRecommendation[] {
  const plaza = statistics.compatibility['central-plaza'];
  const large = statistics.compatibility['large-house'];
  const reliefIsIrregular =
    statistics.totalHeightDifference > 3 || statistics.maximumSlopeDegrees > 12;
  const separateBuildingsSafe = large.compatibleSurfaceCount > 0;
  const integratedFloorSafe =
    plaza.compatibleSurfaceCount > 0 &&
    statistics.totalHeightDifference <= 1 &&
    statistics.flatSurfacePercent >= 80;
  return [
    {
      strategy: 'platform',
      recommended: !separateBuildingsSafe && reliefIsIrregular,
      reasonCodes: reliefIsIrregular ? ['irregular-relief', 'terrain-must-remain-unchanged'] : [],
    },
    {
      strategy: 'separate-buildings',
      recommended: separateBuildingsSafe && !integratedFloorSafe,
      reasonCodes: separateBuildingsSafe
        ? ['multiple-local-surfaces', 'anchors-preserve-existing-routes']
        : ['no-large-compatible-surface'],
    },
    {
      strategy: 'integrated-floor',
      recommended: integratedFloorSafe,
      reasonCodes: integratedFloorSafe
        ? ['broad-flat-surface']
        : ['requires-exact-terrain-match'],
    },
  ];
}

export function buildTerrainSurveyReport(options: {
  zone: TerrainSurveyZoneDescription;
  resolution: TerrainSurveyResolution;
  statistics: TerrainSurveyStatistics;
  protectedZones: readonly ProtectedZone[];
  anchors: readonly TerrainAnchor[];
}): TerrainSurveyReport {
  assertBounds(options.zone.bounds);
  if (!isResolution(options.resolution)) throw new RangeError('unsupported terrain resolution');
  return {
    version: START_ZONE_TERRAIN_SURVEY_VERSION,
    analyzedZone: {
      id: options.zone.id,
      name: options.zone.name,
      center: { x: round(options.zone.center.x), z: round(options.zone.center.z) },
      bounds: {
        minX: round(options.zone.bounds.minX),
        maxX: round(options.zone.bounds.maxX),
        minZ: round(options.zone.bounds.minZ),
        maxZ: round(options.zone.bounds.maxZ),
      },
    },
    samplingParameters: {
      resolution: options.resolution,
      heightSource: 'terrainHeight',
      flatSlopeDegrees: TERRAIN_SURVEY_CRITERIA.flatSlopeDegrees,
      moderateSlopeDegrees: TERRAIN_SURVEY_CRITERIA.moderateSlopeDegrees,
    },
    statistics: canonicalStatistics(options.statistics),
    protectedZones: canonicalProtectedZones(options.protectedZones),
    anchors: canonicalAnchors(options.anchors),
    recommendations: terrainSurveyRecommendations(options.statistics),
  };
}

export function serializeTerrainSurveyReport(report: TerrainSurveyReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}
