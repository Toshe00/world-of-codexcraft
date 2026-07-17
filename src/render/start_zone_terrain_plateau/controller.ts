import {
  START_ZONE_TERRAIN_PLATEAU_VERSION,
  cloneStartZoneTerrainPlateauPatch,
  parseStartZoneTerrainPlateauDocument,
  serializeStartZoneTerrainPlateauDocument,
  type StartZoneTerrainFalloff,
  type StartZoneTerrainPlateauPatch,
} from '../../sim/start_zone_terrain_plateau';
import type { ProtectedZone, TerrainSurveyBounds } from '../start_zone_terrain_survey/terrain_survey_core';

export const START_ZONE_TERRAIN_PLATEAU_STORAGE_KEY = 'dev.start-zone-terrain-plateau.v1';
export const DEFAULT_START_ZONE_TERRAIN_PLATEAU: StartZoneTerrainPlateauPatch = {
  id: 'starter-zone-plateau',
  type: 'flatten-plateau',
  centerX: 0,
  centerZ: 0,
  width: 90,
  depth: 70,
  rotationY: 0,
  targetHeight: 0,
  blendWidth: 20,
  falloff: 'smoothstep',
  enabled: true,
};

export interface PlateauStatistics {
  targetHeight: number;
  minimumOriginalHeight: number;
  maximumOriginalHeight: number;
  maximumRaised: number;
  maximumLowered: number;
  flatArea: number;
  transitionArea: number;
  protectedZones: readonly ProtectedZone[];
}

export interface PlateauRenderAdapter {
  dispose(): void;
  sync(
    patch: StartZoneTerrainPlateauPatch,
    protectedZones: readonly ProtectedZone[],
    protectedZonesVisible: boolean,
  ): void;
}

export interface PlateauUiView {
  patch: StartZoneTerrainPlateauPatch;
  statistics: PlateauStatistics;
  canRedo: boolean;
  canUndo: boolean;
  protectedZonesVisible: boolean;
}

export interface PlateauUiCallbacks {
  importPatch(value: string): boolean;
  redo(): void;
  reset(): void;
  setProtectedZonesVisible(visible: boolean): void;
  setField(field: keyof StartZoneTerrainPlateauPatch, value: number | boolean | StartZoneTerrainFalloff): void;
  setHeightAverage(): void;
  setHeightCursor(): void;
  undo(): void;
}

export interface PlateauUiAdapter {
  dispose(): void;
  update(view: PlateauUiView): void;
}

export interface PlateauPointerTarget {
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
}

export interface PlateauStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface PlateauControllerOptions {
  bounds: TerrainSurveyBounds;
  createUi: (callbacks: PlateauUiCallbacks) => PlateauUiAdapter;
  onPatchesChanged: (patches: readonly StartZoneTerrainPlateauPatch[]) => void;
  pointerTarget: PlateauPointerTarget;
  projectTerrain: (clientX: number, clientY: number) => { x: number; z: number } | null;
  protectedZones: readonly ProtectedZone[];
  render: PlateauRenderAdapter;
  sampleOriginalHeight: (x: number, z: number) => number;
  storage: PlateauStorage | null;
}

function insideBounds(patch: StartZoneTerrainPlateauPatch, bounds: TerrainSurveyBounds): boolean {
  return (
    patch.centerX >= bounds.minX &&
    patch.centerX <= bounds.maxX &&
    patch.centerZ >= bounds.minZ &&
    patch.centerZ <= bounds.maxZ
  );
}

function transformedDistance(patch: StartZoneTerrainPlateauPatch, x: number, z: number): number {
  const dx = x - patch.centerX;
  const dz = z - patch.centerZ;
  const cos = Math.cos(patch.rotationY);
  const sin = Math.sin(patch.rotationY);
  const localX = dx * cos - dz * sin;
  const localZ = dx * sin + dz * cos;
  return Math.hypot(
    Math.max(0, Math.abs(localX) - patch.width / 2),
    Math.max(0, Math.abs(localZ) - patch.depth / 2),
  );
}

function protectedIntersection(
  patch: StartZoneTerrainPlateauPatch,
  zones: readonly ProtectedZone[],
): ProtectedZone[] {
  return zones.filter((zone) => {
    if (zone.shape === 'circle') return transformedDistance(patch, zone.x, zone.z) <= patch.blendWidth + zone.radius;
    if (zone.shape === 'rectangle') return transformedDistance(patch, zone.x, zone.z) <= patch.blendWidth + Math.hypot(zone.width, zone.depth) / 2;
    const samples = [
      [zone.x1, zone.z1],
      [zone.x2, zone.z2],
      [(zone.x1 + zone.x2) / 2, (zone.z1 + zone.z2) / 2],
    ];
    return samples.some(([x, z]) => transformedDistance(patch, x, z) <= patch.blendWidth + zone.radius);
  });
}

function stats(
  patch: StartZoneTerrainPlateauPatch,
  bounds: TerrainSurveyBounds,
  sample: (x: number, z: number) => number,
  zones: readonly ProtectedZone[],
): PlateauStatistics {
  let minimumOriginalHeight = Infinity;
  let maximumOriginalHeight = -Infinity;
  let maximumRaised = 0;
  let maximumLowered = 0;
  const step = 2;
  for (let z = bounds.minZ; z <= bounds.maxZ; z += step) {
    for (let x = bounds.minX; x <= bounds.maxX; x += step) {
      const original = sample(x, z);
      minimumOriginalHeight = Math.min(minimumOriginalHeight, original);
      maximumOriginalHeight = Math.max(maximumOriginalHeight, original);
      const distance = transformedDistance(patch, x, z);
      if (distance > patch.blendWidth) continue;
      const weight = distance === 0 ? 1 : 1 - distance / patch.blendWidth;
      const change = (patch.targetHeight - original) * weight;
      maximumRaised = Math.max(maximumRaised, change);
      maximumLowered = Math.max(maximumLowered, -change);
    }
  }
  return {
    targetHeight: patch.targetHeight,
    minimumOriginalHeight: minimumOriginalHeight === Infinity ? 0 : minimumOriginalHeight,
    maximumOriginalHeight: maximumOriginalHeight === -Infinity ? 0 : maximumOriginalHeight,
    maximumRaised,
    maximumLowered,
    flatArea: patch.width * patch.depth,
    transitionArea: (patch.width + patch.depth) * 2 * patch.blendWidth + Math.PI * patch.blendWidth ** 2,
    protectedZones: protectedIntersection(patch, zones),
  };
}

export class StartZoneTerrainPlateauController {
  private patch: StartZoneTerrainPlateauPatch;
  private undoStack: StartZoneTerrainPlateauPatch[] = [];
  private redoStack: StartZoneTerrainPlateauPatch[] = [];
  private cursor: { x: number; z: number } | null = null;
  private protectedZonesVisible = false;
  private readonly ui: PlateauUiAdapter;
  private disposed = false;

  constructor(private readonly options: PlateauControllerOptions) {
    const stored = this.readStored();
    this.patch = stored ?? { ...DEFAULT_START_ZONE_TERRAIN_PLATEAU, centerX: (options.bounds.minX + options.bounds.maxX) / 2, centerZ: (options.bounds.minZ + options.bounds.maxZ) / 2 };
    if (!stored) this.patch.targetHeight = this.averageHeight(this.patch);
    this.ui = options.createUi({
      importPatch: (value) => this.importPatch(value),
      redo: () => this.redo(),
      reset: () => this.reset(),
      setProtectedZonesVisible: (visible) => this.setProtectedZonesVisible(visible),
      setField: (field, value) => this.setField(field, value),
      setHeightAverage: () => this.setHeightAverage(),
      setHeightCursor: () => this.setHeightCursor(),
      undo: () => this.undo(),
    });
    options.pointerTarget.addEventListener('pointermove', this.onPointerMove);
    this.publish();
  }

  get currentPatch(): StartZoneTerrainPlateauPatch {
    return cloneStartZoneTerrainPlateauPatch(this.patch);
  }

  exportPatch(): string {
    return serializeStartZoneTerrainPlateauDocument({ version: START_ZONE_TERRAIN_PLATEAU_VERSION, patches: [this.patch] });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.options.pointerTarget.removeEventListener('pointermove', this.onPointerMove);
    this.options.onPatchesChanged([]);
    this.ui.dispose();
    this.options.render.dispose();
  }

  private readonly onPointerMove = (event: Event): void => {
    const pointer = event as PointerEvent;
    this.cursor = this.options.projectTerrain(pointer.clientX, pointer.clientY);
  };

  private readStored(): StartZoneTerrainPlateauPatch | null {
    try {
      const document = parseStartZoneTerrainPlateauDocument(this.options.storage?.getItem(START_ZONE_TERRAIN_PLATEAU_STORAGE_KEY) ?? '');
      const patch = document?.patches[0];
      return patch && insideBounds(patch, this.options.bounds) ? patch : null;
    } catch {
      return null;
    }
  }

  private setField(field: keyof StartZoneTerrainPlateauPatch, value: number | boolean | StartZoneTerrainFalloff): void {
    if (this.disposed) return;
    const next = { ...this.patch, [field]: value } as StartZoneTerrainPlateauPatch;
    if (!insideBounds(next, this.options.bounds) || !Number.isFinite(next.rotationY)) return;
    if (next.width <= 0 || next.depth <= 0 || next.blendWidth <= 0) return;
    this.commit(next);
  }

  private setHeightAverage(): void {
    this.commit({ ...this.patch, targetHeight: this.averageHeight(this.patch) });
  }

  private setProtectedZonesVisible(visible: boolean): void {
    if (this.disposed || this.protectedZonesVisible === visible) return;
    this.protectedZonesVisible = visible;
    this.options.render.sync(this.patch, this.options.protectedZones, visible);
    this.refreshUi();
  }

  private setHeightCursor(): void {
    if (!this.cursor) return;
    this.commit({ ...this.patch, targetHeight: this.options.sampleOriginalHeight(this.cursor.x, this.cursor.z) });
  }

  private averageHeight(patch: StartZoneTerrainPlateauPatch): number {
    let sum = 0;
    let count = 0;
    for (let z = -patch.depth / 2; z <= patch.depth / 2; z += 4) {
      for (let x = -patch.width / 2; x <= patch.width / 2; x += 4) {
        const cos = Math.cos(patch.rotationY);
        const sin = Math.sin(patch.rotationY);
        sum += this.options.sampleOriginalHeight(patch.centerX + x * cos + z * sin, patch.centerZ - x * sin + z * cos);
        count++;
      }
    }
    return count > 0 ? sum / count : 0;
  }

  private importPatch(value: string): boolean {
    const document = parseStartZoneTerrainPlateauDocument(value);
    const patch = document?.patches[0];
    if (!patch || !insideBounds(patch, this.options.bounds)) return false;
    this.commit(patch);
    return true;
  }

  private reset(): void {
    this.commit({ ...DEFAULT_START_ZONE_TERRAIN_PLATEAU, centerX: (this.options.bounds.minX + this.options.bounds.maxX) / 2, centerZ: (this.options.bounds.minZ + this.options.bounds.maxZ) / 2, targetHeight: this.averageHeight(this.patch) });
  }

  private undo(): void {
    const previous = this.undoStack.pop();
    if (!previous) return;
    this.redoStack.push(cloneStartZoneTerrainPlateauPatch(this.patch));
    this.patch = previous;
    this.publish();
  }

  private redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(cloneStartZoneTerrainPlateauPatch(this.patch));
    this.patch = next;
    this.publish();
  }

  private commit(next: StartZoneTerrainPlateauPatch): void {
    if (JSON.stringify(next) === JSON.stringify(this.patch)) return;
    this.undoStack.push(cloneStartZoneTerrainPlateauPatch(this.patch));
    this.redoStack = [];
    this.patch = cloneStartZoneTerrainPlateauPatch(next);
    this.publish();
  }

  private publish(): void {
    const patch = cloneStartZoneTerrainPlateauPatch(this.patch);
    this.options.onPatchesChanged([patch]);
    this.options.render.sync(patch, this.options.protectedZones, this.protectedZonesVisible);
    try {
      this.options.storage?.setItem(START_ZONE_TERRAIN_PLATEAU_STORAGE_KEY, this.exportPatch());
    } catch {
      // The live developer session remains usable when browser storage is unavailable.
    }
    this.refreshUi();
  }

  private refreshUi(): void {
    const patch = cloneStartZoneTerrainPlateauPatch(this.patch);
    this.ui.update({
      patch,
      statistics: stats(patch, this.options.bounds, this.options.sampleOriginalHeight, this.options.protectedZones),
      canRedo: this.redoStack.length > 0,
      canUndo: this.undoStack.length > 0,
      protectedZonesVisible: this.protectedZonesVisible,
    });
  }
}
