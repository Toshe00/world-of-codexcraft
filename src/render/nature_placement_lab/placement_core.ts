import { LABORATORY_NATURE_PALETTE_CONFIG } from '../laboratory_nature_palette_core';
import { NATURE_PLACEMENT_ASSET_METADATA } from './placement_asset_metadata';

export const NATURE_PLACEMENT_FORMAT_VERSION = 1 as const;

export const NATURE_PLACEMENT_LIMITS = Object.freeze({
  maxPlacements: 500,
  positionAbsMax: 100_000,
  groundYMin: -10_000,
  groundYMax: 10_000,
  scaleMin: 0.25,
  scaleMax: 4,
  groundOffsetMin: -2,
  groundOffsetMax: 2,
  rotationStep: Math.PI / 12,
  scaleStep: 0.1,
  scaleStepFine: 0.02,
  groundOffsetStep: 0.05,
  groundOffsetStepFine: 0.01,
});

const NATURE_PLACEMENT_ASSET_IDS = [
  'BirchTree_1',
  'BirchTree_2',
  'Bush_Flowers',
  'Flower_1_Clump',
  'Grass_Large',
  'DeadTree_2',
] as const;

export type NaturePlacementAssetId = (typeof NATURE_PLACEMENT_ASSET_IDS)[number];

export interface NaturePlacementAsset {
  readonly assetId: NaturePlacementAssetId;
  readonly assetPath: string;
  readonly baseScale: number;
  readonly defaultGroundOffsetY: number;
  readonly defaultRotationY: number;
  readonly shadows: boolean;
  readonly estimatedTriangles: number;
  readonly mediaBytes: number;
}

const allowedAssetIds = new Set<string>(NATURE_PLACEMENT_ASSET_IDS);

export const NATURE_PLACEMENT_ASSETS: readonly NaturePlacementAsset[] = Object.freeze(
  LABORATORY_NATURE_PALETTE_CONFIG.map((config) => {
    if (!allowedAssetIds.has(config.label)) {
      throw new Error(`unsupported nature placement laboratory asset: ${config.label}`);
    }
    return Object.freeze({
      assetId: config.label as NaturePlacementAssetId,
      assetPath: config.assetPath,
      baseScale: config.scale,
      defaultGroundOffsetY: config.groundOffsetY ?? 0,
      defaultRotationY: normalizePlacementRotation(config.rotationY),
      shadows: config.shadows,
      estimatedTriangles:
        NATURE_PLACEMENT_ASSET_METADATA[config.label as NaturePlacementAssetId].triangles,
      mediaBytes:
        NATURE_PLACEMENT_ASSET_METADATA[config.label as NaturePlacementAssetId].mediaBytes,
    });
  }),
);

const assetById = new Map(NATURE_PLACEMENT_ASSETS.map((asset) => [asset.assetId, asset]));

export interface NaturePlacementLabEnvironment {
  DEV: boolean;
  VITE_NATURE_PLACEMENT_LAB?: string;
  VITE_ASSET_REPLACEMENT_LAB?: string;
}

export interface NaturePlacementPoint {
  x: number;
  y: number;
  z: number;
}

export interface NaturePlacement {
  id: string;
  assetId: NaturePlacementAssetId;
  layerId?: string;
  position: NaturePlacementPoint;
  rotationY: number;
  scale: number;
  groundOffsetY: number;
}

export interface NaturePlacementTransform {
  assetId: NaturePlacementAssetId;
  rotationY: number;
  scale: number;
  groundOffsetY: number;
}

export interface NaturePlacementEditSnapshot {
  placements: NaturePlacement[];
  selectedPlacementId: string | null;
}

export function naturePlacementLabEnabled(environment: NaturePlacementLabEnvironment): boolean {
  return environment.DEV && environment.VITE_NATURE_PLACEMENT_LAB === '1';
}

export function isNaturePlacementAssetId(value: unknown): value is NaturePlacementAssetId {
  return typeof value === 'string' && allowedAssetIds.has(value);
}

export function naturePlacementAsset(assetId: NaturePlacementAssetId): NaturePlacementAsset {
  const asset = assetById.get(assetId);
  if (!asset) throw new Error(`unknown nature placement laboratory asset: ${assetId}`);
  return asset;
}

export function normalizePlacementRotation(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const fullTurn = Math.PI * 2;
  const normalized = value % fullTurn;
  return normalized < 0 ? normalized + fullTurn : normalized;
}

function roundTransform(value: number): number {
  const rounded = Math.round(value * 1_000_000) / 1_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function validNaturePlacementPoint(
  point: NaturePlacementPoint | null,
): point is NaturePlacementPoint {
  return (
    point !== null &&
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    Number.isFinite(point.z) &&
    Math.abs(point.x) <= NATURE_PLACEMENT_LIMITS.positionAbsMax &&
    point.y >= NATURE_PLACEMENT_LIMITS.groundYMin &&
    point.y <= NATURE_PLACEMENT_LIMITS.groundYMax &&
    Math.abs(point.z) <= NATURE_PLACEMENT_LIMITS.positionAbsMax
  );
}

function clonePoint(point: NaturePlacementPoint): NaturePlacementPoint {
  return { x: point.x, y: point.y, z: point.z };
}

export function cloneNaturePlacement(placement: NaturePlacement): NaturePlacement {
  return { ...placement, position: clonePoint(placement.position) };
}

export function cloneNaturePlacementEditSnapshot(
  snapshot: NaturePlacementEditSnapshot,
): NaturePlacementEditSnapshot {
  return {
    placements: snapshot.placements.map(cloneNaturePlacement),
    selectedPlacementId: snapshot.selectedPlacementId,
  };
}

export function equalNaturePlacementEditSnapshots(
  left: NaturePlacementEditSnapshot,
  right: NaturePlacementEditSnapshot,
): boolean {
  if (
    left.selectedPlacementId !== right.selectedPlacementId ||
    left.placements.length !== right.placements.length
  ) {
    return false;
  }
  return left.placements.every((placement, index) => {
    const other = right.placements[index];
    return (
      other !== undefined &&
      placement.id === other.id &&
      placement.assetId === other.assetId &&
      placement.position.x === other.position.x &&
      placement.position.y === other.position.y &&
      placement.position.z === other.position.z &&
      placement.rotationY === other.rotationY &&
      placement.scale === other.scale &&
      placement.groundOffsetY === other.groundOffsetY
    );
  });
}

export class NaturePlacementState {
  private readonly records = new Map<string, NaturePlacement>();
  private selectedAsset: NaturePlacementAssetId | null = null;
  private selected: string | null = null;
  private placing = false;
  private draft: NaturePlacementTransform | null = null;
  private nextId = 1;

  get placements(): NaturePlacement[] {
    return [...this.records.values()].map(cloneNaturePlacement);
  }

  get selectedAssetId(): NaturePlacementAssetId | null {
    return this.selectedAsset;
  }

  get selectedPlacementId(): string | null {
    return this.selected;
  }

  get selectedPlacement(): NaturePlacement | null {
    const placement = this.selected === null ? undefined : this.records.get(this.selected);
    return placement ? cloneNaturePlacement(placement) : null;
  }

  get placementActive(): boolean {
    return this.placing;
  }

  get editSnapshot(): NaturePlacementEditSnapshot {
    return {
      placements: this.placements,
      selectedPlacementId: this.selected,
    };
  }

  get activeTransform(): NaturePlacementTransform | null {
    const selected = this.selected === null ? undefined : this.records.get(this.selected);
    if (selected) {
      return {
        assetId: selected.assetId,
        rotationY: selected.rotationY,
        scale: selected.scale,
        groundOffsetY: selected.groundOffsetY,
      };
    }
    return this.draft ? { ...this.draft } : null;
  }

  selectAsset(assetId: NaturePlacementAssetId): void {
    const asset = naturePlacementAsset(assetId);
    this.selectedAsset = assetId;
    this.selected = null;
    this.placing = false;
    this.draft = {
      assetId,
      rotationY: asset.defaultRotationY,
      scale: 1,
      groundOffsetY: asset.defaultGroundOffsetY,
    };
  }

  startPlacement(): boolean {
    if (!this.draft) return false;
    this.selected = null;
    this.placing = true;
    return true;
  }

  cancelPlacement(): void {
    this.placing = false;
  }

  place(point: NaturePlacementPoint | null): NaturePlacement | null {
    if (!this.placing || !this.draft || !validNaturePlacementPoint(point)) return null;
    if (this.records.size >= NATURE_PLACEMENT_LIMITS.maxPlacements) return null;
    const placement: NaturePlacement = {
      id: this.allocateId(),
      assetId: this.draft.assetId,
      position: clonePoint(point),
      rotationY: this.draft.rotationY,
      scale: this.draft.scale,
      groundOffsetY: this.draft.groundOffsetY,
    };
    this.records.set(placement.id, placement);
    return cloneNaturePlacement(placement);
  }

  selectPlacement(id: string | null): boolean {
    this.placing = false;
    if (id === null) {
      this.selected = null;
      return true;
    }
    if (!this.records.has(id)) return false;
    this.selected = id;
    return true;
  }

  moveSelected(point: NaturePlacementPoint | null): boolean {
    if (this.selected === null || !validNaturePlacementPoint(point)) return false;
    const placement = this.records.get(this.selected);
    if (!placement) return false;
    placement.position = clonePoint(point);
    return true;
  }

  updateSelectedTransform(transform: {
    position: NaturePlacementPoint;
    rotationY: number;
    scale: number;
    groundOffsetY: number;
  }): boolean {
    if (this.selected === null || !validNaturePlacementPoint(transform.position)) return false;
    if (
      !Number.isFinite(transform.rotationY) ||
      !Number.isFinite(transform.scale) ||
      !Number.isFinite(transform.groundOffsetY) ||
      transform.scale < NATURE_PLACEMENT_LIMITS.scaleMin ||
      transform.scale > NATURE_PLACEMENT_LIMITS.scaleMax ||
      transform.groundOffsetY < NATURE_PLACEMENT_LIMITS.groundOffsetMin ||
      transform.groundOffsetY > NATURE_PLACEMENT_LIMITS.groundOffsetMax
    ) {
      return false;
    }
    const placement = this.records.get(this.selected);
    if (!placement) return false;
    placement.position = clonePoint(transform.position);
    placement.rotationY = normalizePlacementRotation(transform.rotationY);
    placement.scale = roundTransform(transform.scale);
    placement.groundOffsetY = roundTransform(transform.groundOffsetY);
    return true;
  }

  setActiveTransform(transform: NaturePlacementTransform): boolean {
    if (
      !Number.isFinite(transform.rotationY) ||
      !Number.isFinite(transform.scale) ||
      !Number.isFinite(transform.groundOffsetY) ||
      transform.scale < NATURE_PLACEMENT_LIMITS.scaleMin ||
      transform.scale > NATURE_PLACEMENT_LIMITS.scaleMax ||
      transform.groundOffsetY < NATURE_PLACEMENT_LIMITS.groundOffsetMin ||
      transform.groundOffsetY > NATURE_PLACEMENT_LIMITS.groundOffsetMax
    ) {
      return false;
    }
    return this.updateActive((active) => {
      active.rotationY = normalizePlacementRotation(transform.rotationY);
      active.scale = roundTransform(transform.scale);
      active.groundOffsetY = roundTransform(transform.groundOffsetY);
    });
  }

  duplicateSelected(offset: NaturePlacementPoint): NaturePlacement | null {
    if (this.selected === null || this.records.size >= NATURE_PLACEMENT_LIMITS.maxPlacements) {
      return null;
    }
    const source = this.records.get(this.selected);
    if (!source) return null;
    const position = {
      x: source.position.x + offset.x,
      y: source.position.y + offset.y,
      z: source.position.z + offset.z,
    };
    if (!validNaturePlacementPoint(position)) return null;
    const duplicate: NaturePlacement = {
      ...cloneNaturePlacement(source),
      id: this.allocateId(),
      position,
    };
    this.records.set(duplicate.id, duplicate);
    this.selected = duplicate.id;
    this.placing = false;
    return cloneNaturePlacement(duplicate);
  }

  resetSelectedTransform(): boolean {
    if (this.selected === null) return false;
    const placement = this.records.get(this.selected);
    if (!placement) return false;
    const asset = naturePlacementAsset(placement.assetId);
    placement.rotationY = asset.defaultRotationY;
    placement.scale = 1;
    placement.groundOffsetY = asset.defaultGroundOffsetY;
    return true;
  }

  deleteSelected(): boolean {
    if (this.selected === null) return false;
    const removed = this.records.delete(this.selected);
    this.selected = null;
    return removed;
  }

  clear(): void {
    this.records.clear();
    this.selected = null;
    this.placing = false;
  }

  rotateActive(direction: number): boolean {
    if (!Number.isFinite(direction) || direction === 0) return false;
    return this.updateActive((transform) => {
      transform.rotationY = normalizePlacementRotation(
        transform.rotationY + Math.sign(direction) * NATURE_PLACEMENT_LIMITS.rotationStep,
      );
    });
  }

  adjustScale(direction: number, fine: boolean): boolean {
    if (!Number.isFinite(direction) || direction === 0) return false;
    const step = fine ? NATURE_PLACEMENT_LIMITS.scaleStepFine : NATURE_PLACEMENT_LIMITS.scaleStep;
    return this.updateActive((transform) => {
      transform.scale = roundTransform(
        clamp(
          transform.scale + Math.sign(direction) * step,
          NATURE_PLACEMENT_LIMITS.scaleMin,
          NATURE_PLACEMENT_LIMITS.scaleMax,
        ),
      );
    });
  }

  adjustGroundOffset(direction: number, fine: boolean): boolean {
    if (!Number.isFinite(direction) || direction === 0) return false;
    const step = fine
      ? NATURE_PLACEMENT_LIMITS.groundOffsetStepFine
      : NATURE_PLACEMENT_LIMITS.groundOffsetStep;
    return this.updateActive((transform) => {
      transform.groundOffsetY = roundTransform(
        clamp(
          transform.groundOffsetY + Math.sign(direction) * step,
          NATURE_PLACEMENT_LIMITS.groundOffsetMin,
          NATURE_PLACEMENT_LIMITS.groundOffsetMax,
        ),
      );
    });
  }

  replacePlacements(placements: readonly NaturePlacement[]): void {
    this.records.clear();
    for (const placement of placements)
      this.records.set(placement.id, cloneNaturePlacement(placement));
    this.selected = null;
    this.placing = false;
    this.nextId = 1;
    while (this.records.has(this.formatId(this.nextId))) this.nextId++;
  }

  restoreEditSnapshot(snapshot: NaturePlacementEditSnapshot): void {
    this.replacePlacements(snapshot.placements);
    if (snapshot.selectedPlacementId && this.records.has(snapshot.selectedPlacementId)) {
      this.selected = snapshot.selectedPlacementId;
    }
  }

  private updateActive(update: (transform: NaturePlacementTransform) => void): boolean {
    const selected = this.selected === null ? undefined : this.records.get(this.selected);
    if (selected) {
      update(selected);
      return true;
    }
    if (!this.draft) return false;
    update(this.draft);
    return true;
  }

  private formatId(value: number): string {
    return `lab-placement-${String(value).padStart(3, '0')}`;
  }

  private allocateId(): string {
    let id = this.formatId(this.nextId++);
    while (this.records.has(id)) id = this.formatId(this.nextId++);
    return id;
  }
}
