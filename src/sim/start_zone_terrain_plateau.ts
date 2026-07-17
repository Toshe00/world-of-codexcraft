/** Development-only, reversible terrain overlay. This module never mutates source terrain data. */
export const START_ZONE_TERRAIN_PLATEAU_VERSION = 1 as const;
export const START_ZONE_TERRAIN_PLATEAU_MAX_PATCHES = 1;

export type StartZoneTerrainFalloff = 'linear' | 'smoothstep' | 'smootherstep';
export type StartZoneTerrainPatchType = 'flatten-plateau';
export type TerrainEntityHeightSource = 'original' | 'modified';

export interface StartZoneTerrainPlateauPatch {
  id: string;
  type: StartZoneTerrainPatchType;
  centerX: number;
  centerZ: number;
  width: number;
  depth: number;
  rotationY: number;
  targetHeight: number;
  blendWidth: number;
  falloff: StartZoneTerrainFalloff;
  enabled: boolean;
}

export interface StartZoneTerrainPlateauDocument {
  version: typeof START_ZONE_TERRAIN_PLATEAU_VERSION;
  patches: readonly StartZoneTerrainPlateauPatch[];
}

const FALLOFFS = new Set<StartZoneTerrainFalloff>(['linear', 'smoothstep', 'smootherstep']);
let activePatches: readonly StartZoneTerrainPlateauPatch[] = [];
let terrainRevision = 0;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function eased(value: number, falloff: StartZoneTerrainFalloff): number {
  const t = clamp01(value);
  if (falloff === 'linear') return t;
  if (falloff === 'smootherstep') return t * t * t * (t * (t * 6 - 15) + 10);
  return t * t * (3 - 2 * t);
}

export function isStartZoneTerrainPlateauPatch(value: unknown): value is StartZoneTerrainPlateauPatch {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const patch = value as Record<string, unknown>;
  const keys = Object.keys(patch);
  const expected = [
    'id',
    'type',
    'centerX',
    'centerZ',
    'width',
    'depth',
    'rotationY',
    'targetHeight',
    'blendWidth',
    'falloff',
    'enabled',
  ];
  if (keys.length !== expected.length || keys.some((key) => !expected.includes(key))) return false;
  if (typeof patch.id !== 'string' || patch.id.length === 0 || patch.id.length > 80) return false;
  if (patch.type !== 'flatten-plateau' || typeof patch.enabled !== 'boolean') return false;
  if (typeof patch.falloff !== 'string' || !FALLOFFS.has(patch.falloff as StartZoneTerrainFalloff)) return false;
  const numeric = ['centerX', 'centerZ', 'width', 'depth', 'rotationY', 'targetHeight', 'blendWidth'];
  if (numeric.some((key) => typeof patch[key] !== 'number' || !Number.isFinite(patch[key]))) return false;
  return (
    (patch.width as number) > 0 &&
    (patch.depth as number) > 0 &&
    (patch.width as number) <= 300 &&
    (patch.depth as number) <= 300 &&
    (patch.blendWidth as number) > 0 &&
    (patch.blendWidth as number) <= 120 &&
    Math.abs(patch.rotationY as number) <= Math.PI * 2
  );
}

export function cloneStartZoneTerrainPlateauPatch(
  patch: StartZoneTerrainPlateauPatch,
): StartZoneTerrainPlateauPatch {
  return { ...patch };
}

/**
 * Presentation-only ground anchor. The caller supplies the object's unmodified
 * source Y every time, so edits, undo, hiding, and disposal never accumulate a
 * terrain delta into a rendered object position.
 */
export function terrainAnchoredObjectY(
  originalObjectY: number,
  originalTerrainY: number,
  modifiedTerrainY: number,
  terrainAnchored: boolean,
): number {
  if (
    !terrainAnchored ||
    !Number.isFinite(originalObjectY) ||
    !Number.isFinite(originalTerrainY) ||
    !Number.isFinite(modifiedTerrainY)
  ) {
    return originalObjectY;
  }
  const delta = modifiedTerrainY - originalTerrainY;
  return delta === 0 ? originalObjectY : originalObjectY + delta;
}

/**
 * The local player is already authoritative against modified terrain, while
 * remote dynamic entities retain the server's original terrain height. Apply
 * the visual delta only to the latter. CharacterVisual keeps its model-pivot
 * offset below this group-level position, so either path preserves that
 * historical offset unchanged.
 */
export function terrainAnchoredEntityY(
  authoritativeObjectY: number,
  originalTerrainY: number,
  modifiedTerrainY: number,
  terrainAnchored: boolean,
  heightSource: TerrainEntityHeightSource,
): number {
  return terrainAnchoredObjectY(
    authoritativeObjectY,
    heightSource === 'modified' ? modifiedTerrainY : originalTerrainY,
    modifiedTerrainY,
    terrainAnchored,
  );
}

export function applyStartZoneTerrainPlateauPatches(
  originalHeight: number,
  x: number,
  z: number,
  patches: readonly StartZoneTerrainPlateauPatch[],
): number {
  if (!Number.isFinite(originalHeight) || !Number.isFinite(x) || !Number.isFinite(z)) return originalHeight;
  let height = originalHeight;
  for (const patch of patches) {
    if (!patch.enabled || !isStartZoneTerrainPlateauPatch(patch)) continue;
    const dx = x - patch.centerX;
    const dz = z - patch.centerZ;
    const cos = Math.cos(patch.rotationY);
    const sin = Math.sin(patch.rotationY);
    const localX = dx * cos - dz * sin;
    const localZ = dx * sin + dz * cos;
    const outsideX = Math.max(0, Math.abs(localX) - patch.width / 2);
    const outsideZ = Math.max(0, Math.abs(localZ) - patch.depth / 2);
    const distance = Math.hypot(outsideX, outsideZ);
    if (distance >= patch.blendWidth) continue;
    const weight = 1 - eased(distance / patch.blendWidth, patch.falloff);
    height += (patch.targetHeight - height) * weight;
  }
  return Number.isFinite(height) ? height : originalHeight;
}

export function setActiveStartZoneTerrainPlateauPatches(
  patches: readonly StartZoneTerrainPlateauPatch[],
): void {
  const next = patches
    .filter(isStartZoneTerrainPlateauPatch)
    .slice(0, START_ZONE_TERRAIN_PLATEAU_MAX_PATCHES)
    .map(cloneStartZoneTerrainPlateauPatch);
  activePatches = next;
  terrainRevision++;
}

export function clearActiveStartZoneTerrainPlateauPatches(): void {
  if (activePatches.length === 0) return;
  activePatches = [];
  terrainRevision++;
}

export function activeStartZoneTerrainPlateauPatches(): readonly StartZoneTerrainPlateauPatch[] {
  return activePatches;
}

export function startZoneTerrainPlateauRevision(): number {
  return terrainRevision;
}

export function serializeStartZoneTerrainPlateauDocument(
  document: StartZoneTerrainPlateauDocument,
): string {
  return `${JSON.stringify(
    {
      patches: document.patches.map(cloneStartZoneTerrainPlateauPatch).sort((a, b) => a.id.localeCompare(b.id)),
      version: document.version,
    },
    null,
    2,
  )}\n`;
}

export function parseStartZoneTerrainPlateauDocument(value: string): StartZoneTerrainPlateauDocument | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const document = parsed as Record<string, unknown>;
    if (Object.keys(document).length !== 2 || document.version !== START_ZONE_TERRAIN_PLATEAU_VERSION) return null;
    if (!Array.isArray(document.patches) || document.patches.length > START_ZONE_TERRAIN_PLATEAU_MAX_PATCHES) return null;
    if (!document.patches.every(isStartZoneTerrainPlateauPatch)) return null;
    return {
      version: START_ZONE_TERRAIN_PLATEAU_VERSION,
      patches: document.patches.map(cloneStartZoneTerrainPlateauPatch).sort((a, b) => a.id.localeCompare(b.id)),
    };
  } catch {
    return null;
  }
}
