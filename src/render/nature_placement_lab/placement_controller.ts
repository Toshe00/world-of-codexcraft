import { formatNumber, t } from '../../ui/i18n';
import {
  cloneNaturePlacementEditSnapshot,
  equalNaturePlacementEditSnapshots,
  NATURE_PLACEMENT_ASSETS,
  type NaturePlacement,
  type NaturePlacementAssetId,
  type NaturePlacementEditSnapshot,
  type NaturePlacementPoint,
  NaturePlacementState,
  validNaturePlacementPoint,
} from './placement_core';
import { EditHistory } from './placement_history';
import { parseNaturePlacementJson, serializeNaturePlacements } from './placement_json';
import {
  loadNaturePlacementPreferences,
  type NaturePlacementPreferenceStorage,
  type NaturePlacementPreferences,
  normalizeNaturePlacementPreferences,
  saveNaturePlacementPreferences,
} from './placement_preferences';
import {
  type NaturePlacementShortcut,
  resolveNaturePlacementShortcut,
} from './placement_shortcuts';
import {
  placePointOnGround,
  snapPlacementPosition,
  snapPlacementRotation,
  snapPlacementScale,
} from './placement_snapping';
import {
  type NaturePlacementInspectorField,
  type NaturePlacementInspectorInput,
  validateNaturePlacementTransform,
} from './placement_transform_validation';

export interface NaturePlacementRenderAdapter {
  clearGhost(): void;
  dispose(): void;
  pickPlacement(clientX: number, clientY: number): string | null;
  sync(placements: readonly NaturePlacement[], selectedId: string | null): void;
  syncGrid(
    visible: boolean,
    cellSize: NaturePlacementPreferences['gridSize'],
    center: NaturePlacementPoint,
  ): void;
  updateGhost(
    assetId: NaturePlacementAssetId,
    point: NaturePlacementPoint,
    transform: NonNullable<NaturePlacementState['activeTransform']>,
  ): void;
}

export interface NaturePlacementUiView {
  assetIds: readonly NaturePlacementAssetId[];
  canRedo: boolean;
  canUndo: boolean;
  count: number;
  placing: boolean;
  preferences: NaturePlacementPreferences;
  selectedAssetId: NaturePlacementAssetId | null;
  selectedPlacement: NaturePlacement | null;
  status: string;
  statusSeverity: 'error' | 'info';
}

export interface NaturePlacementUiCallbacks {
  applyTransform(input: NaturePlacementInspectorInput): void;
  cancelPlacement(): void;
  clear(): void;
  deleteSelected(): void;
  duplicateSelected(): void;
  exportJson(): string;
  importJson(source: string): void;
  placeOnGround(): void;
  redo(): void;
  resetTransform(): void;
  selectAsset(assetId: NaturePlacementAssetId): void;
  setPreferences(patch: Partial<NaturePlacementPreferences>): void;
  startPlacement(): void;
  undo(): void;
}

export interface NaturePlacementUiAdapter {
  dispose(): void;
  update(view: NaturePlacementUiView): void;
}

interface ControllerOptions {
  canvas: HTMLCanvasElement;
  createUi: (callbacks: NaturePlacementUiCallbacks) => NaturePlacementUiAdapter;
  eventWindow: Window;
  initialWorkCenter: NaturePlacementPoint;
  preferenceStorage: NaturePlacementPreferenceStorage | null;
  projectTerrain: (clientX: number, clientY: number) => NaturePlacementPoint | null;
  render: NaturePlacementRenderAdapter;
  sampleGroundY: (x: number, z: number) => number;
}

function consume(event: Event): void {
  event.preventDefault();
  event.stopImmediatePropagation();
}

function transformMergeKey(
  id: string,
  before: NaturePlacement,
  after: NaturePlacement,
): string | null {
  const changed = [
    before.position.x !== after.position.x && 'positionX',
    before.position.y !== after.position.y && 'positionY',
    before.position.z !== after.position.z && 'positionZ',
    before.rotationY !== after.rotationY && 'rotationY',
    before.scale !== after.scale && 'scale',
    before.groundOffsetY !== after.groundOffsetY && 'groundOffsetY',
  ].filter((field): field is string => field !== false);
  return changed.length === 1 ? `inspector:${id}:${changed[0]}` : null;
}

export class NaturePlacementController {
  readonly state = new NaturePlacementState();
  private readonly canvas: HTMLCanvasElement;
  private readonly eventWindow: Window;
  private readonly preferenceStorage: NaturePlacementPreferenceStorage | null;
  private readonly projectTerrain: ControllerOptions['projectTerrain'];
  private readonly render: NaturePlacementRenderAdapter;
  private readonly sampleGroundY: ControllerOptions['sampleGroundY'];
  private readonly ui: NaturePlacementUiAdapter;
  private readonly history = new EditHistory<NaturePlacementEditSnapshot>(
    cloneNaturePlacementEditSnapshot,
    equalNaturePlacementEditSnapshots,
  );
  private dragging = false;
  private dragStart: NaturePlacementEditSnapshot | null = null;
  private disposed = false;
  private lastPointer: { x: number; y: number } | null = null;
  private preferences: NaturePlacementPreferences;
  private status = t('hudChrome.naturePlacementLab.statusReady');
  private statusSeverity: NaturePlacementUiView['statusSeverity'] = 'info';
  private workCenter: NaturePlacementPoint;

  constructor(options: ControllerOptions) {
    this.canvas = options.canvas;
    this.eventWindow = options.eventWindow;
    this.preferenceStorage = options.preferenceStorage;
    this.projectTerrain = options.projectTerrain;
    this.render = options.render;
    this.sampleGroundY = options.sampleGroundY;
    this.workCenter = { ...options.initialWorkCenter };
    this.preferences = loadNaturePlacementPreferences(this.preferenceStorage);
    this.ui = options.createUi({
      applyTransform: (input) => this.applyTransform(input),
      cancelPlacement: () => this.cancelPlacement(),
      clear: () => this.clear(),
      deleteSelected: () => this.deleteSelected(),
      duplicateSelected: () => this.duplicateSelected(),
      exportJson: () => this.exportJson(),
      importJson: (source) => this.importJson(source),
      placeOnGround: () => this.placeOnGround(),
      redo: () => this.redo(),
      resetTransform: () => this.resetTransform(),
      selectAsset: (assetId) => this.selectAsset(assetId),
      setPreferences: (patch) => this.setPreferences(patch),
      startPlacement: () => this.startPlacement(),
      undo: () => this.undo(),
    });
    this.canvas.addEventListener('mousedown', this.onMouseDown, true);
    this.canvas.addEventListener('wheel', this.onWheel, { capture: true, passive: false });
    this.canvas.addEventListener('contextmenu', this.onContextMenu, true);
    this.eventWindow.addEventListener('mousemove', this.onMouseMove, true);
    this.eventWindow.addEventListener('mouseup', this.onMouseUp, true);
    this.eventWindow.addEventListener('keydown', this.onKeyDown, true);
    this.render.sync([], null);
    this.syncGrid();
    this.refreshUi();
  }

  selectAsset(assetId: NaturePlacementAssetId): void {
    this.state.selectAsset(assetId);
    this.render.clearGhost();
    this.setStatus(t('hudChrome.naturePlacementLab.statusAssetSelected', { assetId }));
    this.sync();
  }

  startPlacement(): void {
    if (!this.state.startPlacement()) {
      this.setStatus(t('hudChrome.naturePlacementLab.statusSelectAssetFirst'), 'error');
      this.refreshUi();
      return;
    }
    this.setStatus(t('hudChrome.naturePlacementLab.statusPlacementActive'));
    this.refreshGhost();
    this.sync();
  }

  cancelPlacement(): void {
    if (this.dragging && this.dragStart) this.state.restoreEditSnapshot(this.dragStart);
    this.state.cancelPlacement();
    this.dragging = false;
    this.dragStart = null;
    this.render.clearGhost();
    this.setStatus(t('hudChrome.naturePlacementLab.statusPlacementCancelled'));
    this.sync();
  }

  pointerMove(clientX: number, clientY: number): void {
    this.lastPointer = { x: clientX, y: clientY };
    const point = this.preparePoint(this.projectTerrain(clientX, clientY));
    if (this.dragging) {
      if (this.state.moveSelected(point)) {
        this.setStatus(t('hudChrome.naturePlacementLab.statusPlacementMoved'));
        this.sync();
      }
      return;
    }
    if (!this.state.placementActive) return;
    const transform = this.state.activeTransform;
    if (!point || !transform) {
      this.render.clearGhost();
      return;
    }
    this.render.updateGhost(transform.assetId, point, transform);
  }

  primaryDown(clientX: number, clientY: number): boolean {
    if (this.state.placementActive) {
      const before = this.state.editSnapshot;
      this.snapActiveTransform();
      const placed = this.state.place(this.preparePoint(this.projectTerrain(clientX, clientY)));
      if (!placed) {
        this.setStatus(t('hudChrome.naturePlacementLab.statusNoTerrain'), 'error');
        this.refreshUi();
        return true;
      }
      this.history.record(before, this.state.editSnapshot);
      this.setStatus(
        t('hudChrome.naturePlacementLab.statusAssetPlaced', { assetId: placed.assetId }),
      );
      this.sync();
      return true;
    }
    const id = this.render.pickPlacement(clientX, clientY);
    if (!id || !this.state.selectPlacement(id)) return false;
    this.dragging = true;
    this.dragStart = this.state.editSnapshot;
    this.setStatus(t('hudChrome.naturePlacementLab.statusPlacementSelected', { id }));
    this.sync();
    return true;
  }

  pointerUp(): void {
    if (!this.dragging) return;
    this.dragging = false;
    if (this.dragStart) this.history.record(this.dragStart, this.state.editSnapshot);
    this.dragStart = null;
    this.sync();
  }

  updateWorkCenter(center: NaturePlacementPoint): void {
    if (this.disposed || !validNaturePlacementPoint(center)) return;
    this.workCenter = { ...center };
    this.syncGrid();
  }

  undo(): void {
    const snapshot = this.history.undo();
    if (!snapshot) {
      this.setStatus(t('hudChrome.naturePlacementLab.statusNothingToUndo'), 'error');
      this.refreshUi();
      return;
    }
    this.restoreHistory(snapshot);
    this.setStatus(t('hudChrome.naturePlacementLab.statusUndone'));
    this.sync();
  }

  redo(): void {
    const snapshot = this.history.redo();
    if (!snapshot) {
      this.setStatus(t('hudChrome.naturePlacementLab.statusNothingToRedo'), 'error');
      this.refreshUi();
      return;
    }
    this.restoreHistory(snapshot);
    this.setStatus(t('hudChrome.naturePlacementLab.statusRedone'));
    this.sync();
  }

  duplicateSelected(): void {
    const selected = this.state.selectedPlacement;
    if (!selected) {
      this.setStatus(t('hudChrome.naturePlacementLab.statusNoSelection'), 'error');
      this.refreshUi();
      return;
    }
    const before = this.state.editSnapshot;
    const distance = Math.max(0.5, this.preferences.gridSize);
    let target = {
      ...selected.position,
      x: selected.position.x + distance,
      z: selected.position.z + distance,
    };
    if (this.preferences.snapPosition) {
      target = snapPlacementPosition(target, this.preferences.gridSize);
    }
    if (this.preferences.snapToGround) {
      const grounded = placePointOnGround(target, this.sampleGroundY);
      if (!grounded) {
        this.setStatus(t('hudChrome.naturePlacementLab.statusNoTerrain'), 'error');
        this.refreshUi();
        return;
      }
      target = grounded;
    }
    const duplicate = this.state.duplicateSelected({
      x: target.x - selected.position.x,
      y: target.y - selected.position.y,
      z: target.z - selected.position.z,
    });
    if (!duplicate) {
      this.setStatus(t('hudChrome.naturePlacementLab.statusDuplicateFailed'), 'error');
      this.refreshUi();
      return;
    }
    this.history.record(before, this.state.editSnapshot);
    this.setStatus(t('hudChrome.naturePlacementLab.statusDuplicated', { id: duplicate.id }));
    this.sync();
  }

  deleteSelected(): void {
    const before = this.state.editSnapshot;
    if (!this.state.deleteSelected()) {
      this.setStatus(t('hudChrome.naturePlacementLab.statusNoSelection'), 'error');
      this.refreshUi();
      return;
    }
    this.history.record(before, this.state.editSnapshot);
    this.dragging = false;
    this.dragStart = null;
    this.setStatus(t('hudChrome.naturePlacementLab.statusPlacementDeleted'));
    this.sync();
  }

  clear(): void {
    const before = this.state.editSnapshot;
    this.state.clear();
    this.history.record(before, this.state.editSnapshot);
    this.dragging = false;
    this.dragStart = null;
    this.render.clearGhost();
    this.setStatus(t('hudChrome.naturePlacementLab.statusCleared'));
    this.sync();
  }

  applyTransform(input: NaturePlacementInspectorInput): void {
    const selected = this.state.selectedPlacement;
    if (!selected) {
      this.setStatus(t('hudChrome.naturePlacementLab.statusNoSelection'), 'error');
      this.refreshUi();
      return;
    }
    const result = validateNaturePlacementTransform(input, {
      position: this.preferences.snapPosition,
      rotation: this.preferences.snapRotation,
      scale: this.preferences.snapScale,
      gridSize: this.preferences.gridSize,
      rotationStep: this.preferences.rotationStep,
      scaleStep: this.preferences.scaleStep,
    });
    if (!result.ok) {
      this.showValidationError(result.error);
      return;
    }
    let value = result.value;
    if (this.preferences.snapToGround) {
      const grounded = placePointOnGround(value.position, this.sampleGroundY);
      if (!grounded) {
        this.setStatus(t('hudChrome.naturePlacementLab.statusNoTerrain'), 'error');
        this.refreshUi();
        return;
      }
      value = { ...value, position: grounded };
    }
    const before = this.state.editSnapshot;
    if (!this.state.updateSelectedTransform(value)) {
      this.setStatus(t('hudChrome.naturePlacementLab.statusTransformRejected'), 'error');
      this.refreshUi();
      return;
    }
    const after = this.state.selectedPlacement;
    this.history.record(
      before,
      this.state.editSnapshot,
      after ? transformMergeKey(selected.id, selected, after) : null,
    );
    this.setStatus(t('hudChrome.naturePlacementLab.statusTransformApplied'));
    this.sync();
  }

  resetTransform(): void {
    const before = this.state.editSnapshot;
    if (!this.state.resetSelectedTransform()) {
      this.setStatus(t('hudChrome.naturePlacementLab.statusNoSelection'), 'error');
      this.refreshUi();
      return;
    }
    this.history.record(before, this.state.editSnapshot);
    this.setStatus(t('hudChrome.naturePlacementLab.statusTransformReset'));
    this.sync();
  }

  placeOnGround(): void {
    const selected = this.state.selectedPlacement;
    if (!selected) {
      this.setStatus(t('hudChrome.naturePlacementLab.statusNoSelection'), 'error');
      this.refreshUi();
      return;
    }
    const grounded = placePointOnGround(selected.position, this.sampleGroundY);
    if (!grounded) {
      this.setStatus(t('hudChrome.naturePlacementLab.statusNoTerrain'), 'error');
      this.refreshUi();
      return;
    }
    const before = this.state.editSnapshot;
    this.state.moveSelected(grounded);
    this.history.record(before, this.state.editSnapshot);
    this.setStatus(t('hudChrome.naturePlacementLab.statusPlacedOnGround'));
    this.sync();
  }

  setPreferences(patch: Partial<NaturePlacementPreferences>): void {
    this.preferences = normalizeNaturePlacementPreferences({ ...this.preferences, ...patch });
    saveNaturePlacementPreferences(this.preferenceStorage, this.preferences);
    this.syncGrid();
    this.setStatus(t('hudChrome.naturePlacementLab.statusPreferencesSaved'));
    this.refreshGhost();
    this.refreshUi();
  }

  exportJson(): string {
    const json = serializeNaturePlacements(this.state.placements);
    this.setStatus(
      t('hudChrome.naturePlacementLab.statusExported', {
        count: formatNumber(this.state.placements.length),
      }),
    );
    this.refreshUi();
    return json;
  }

  importJson(source: string): void {
    if (this.disposed) return;
    try {
      const placements = parseNaturePlacementJson(source);
      const before = this.state.editSnapshot;
      this.state.replacePlacements(placements);
      this.history.record(before, this.state.editSnapshot);
      this.dragging = false;
      this.dragStart = null;
      this.render.clearGhost();
      this.setStatus(
        t('hudChrome.naturePlacementLab.statusImported', {
          count: formatNumber(placements.length),
        }),
      );
      this.sync();
    } catch (error) {
      console.warn('Nature Placement Lab import rejected', error);
      this.setStatus(t('hudChrome.naturePlacementLab.statusImportFailed'), 'error');
      this.refreshUi();
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.canvas.removeEventListener('mousedown', this.onMouseDown, true);
    this.canvas.removeEventListener('wheel', this.onWheel, true);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu, true);
    this.eventWindow.removeEventListener('mousemove', this.onMouseMove, true);
    this.eventWindow.removeEventListener('mouseup', this.onMouseUp, true);
    this.eventWindow.removeEventListener('keydown', this.onKeyDown, true);
    this.render.clearGhost();
    this.ui.dispose();
    this.render.dispose();
    this.history.clear();
    this.dragStart = null;
    this.lastPointer = null;
  }

  private preparePoint(point: NaturePlacementPoint | null): NaturePlacementPoint | null {
    if (!point || !validNaturePlacementPoint(point)) return null;
    let prepared = { ...point };
    if (this.preferences.snapPosition) {
      prepared = snapPlacementPosition(prepared, this.preferences.gridSize);
    }
    if (this.preferences.snapToGround) {
      return placePointOnGround(prepared, this.sampleGroundY);
    }
    return prepared;
  }

  private restoreHistory(snapshot: NaturePlacementEditSnapshot): void {
    this.state.restoreEditSnapshot(snapshot);
    this.dragging = false;
    this.dragStart = null;
    this.render.clearGhost();
  }

  private snapActiveTransform(): void {
    const active = this.state.activeTransform;
    if (!active) return;
    this.state.setActiveTransform({
      ...active,
      rotationY: this.preferences.snapRotation
        ? snapPlacementRotation(active.rotationY, this.preferences.rotationStep)
        : active.rotationY,
      scale: this.preferences.snapScale
        ? snapPlacementScale(active.scale, this.preferences.scaleStep)
        : active.scale,
    });
  }

  private sync(): void {
    this.render.sync(this.state.placements, this.state.selectedPlacementId);
    this.refreshGhost();
    this.refreshUi();
  }

  private syncGrid(): void {
    this.render.syncGrid(this.preferences.gridVisible, this.preferences.gridSize, this.workCenter);
  }

  private refreshGhost(): void {
    if (!this.state.placementActive || !this.lastPointer) {
      this.render.clearGhost();
      return;
    }
    const point = this.preparePoint(this.projectTerrain(this.lastPointer.x, this.lastPointer.y));
    const transform = this.state.activeTransform;
    if (!point || !transform) {
      this.render.clearGhost();
      return;
    }
    this.render.updateGhost(transform.assetId, point, transform);
  }

  private refreshUi(): void {
    this.ui.update({
      assetIds: NATURE_PLACEMENT_ASSETS.map((asset) => asset.assetId),
      canRedo: this.history.canRedo,
      canUndo: this.history.canUndo,
      count: this.state.placements.length,
      placing: this.state.placementActive,
      preferences: { ...this.preferences },
      selectedAssetId: this.state.selectedAssetId,
      selectedPlacement: this.state.selectedPlacement,
      status: this.status,
      statusSeverity: this.statusSeverity,
    });
  }

  private adjustActive(
    kind: 'rotate' | 'scale' | 'height',
    direction: number,
    fine: boolean,
  ): void {
    const before = this.state.editSnapshot;
    const selectedId = this.state.selectedPlacementId;
    let changed = false;
    const active = this.state.activeTransform;
    if (active && kind === 'rotate' && this.preferences.snapRotation) {
      const step = (this.preferences.rotationStep * Math.PI) / 180;
      changed = this.state.setActiveTransform({
        ...active,
        rotationY: snapPlacementRotation(
          active.rotationY + Math.sign(direction) * step,
          this.preferences.rotationStep,
        ),
      });
    } else if (active && kind === 'scale' && this.preferences.snapScale) {
      changed = this.state.setActiveTransform({
        ...active,
        scale: snapPlacementScale(
          active.scale + Math.sign(direction) * this.preferences.scaleStep,
          this.preferences.scaleStep,
        ),
      });
    } else {
      changed =
        kind === 'rotate'
          ? this.state.rotateActive(direction)
          : kind === 'scale'
            ? this.state.adjustScale(direction, fine)
            : this.state.adjustGroundOffset(direction, fine);
    }
    if (!changed) return;
    if (selectedId) {
      this.history.record(before, this.state.editSnapshot, `shortcut:${selectedId}:${kind}`);
    }
    this.setStatus(t('hudChrome.naturePlacementLab.statusTransformAdjusted'));
    this.sync();
  }

  private showValidationError(error: {
    kind: 'finite' | 'range';
    field: NaturePlacementInspectorField;
    min?: number;
    max?: number;
  }): void {
    const field = this.inspectorFieldLabel(error.field);
    const message =
      error.kind === 'finite'
        ? t('hudChrome.naturePlacementLab.statusFiniteRequired', { field })
        : t('hudChrome.naturePlacementLab.statusOutsideLimits', {
            field,
            min: formatNumber(error.min ?? 0),
            max: formatNumber(error.max ?? 0),
          });
    this.setStatus(message, 'error');
    this.refreshUi();
  }

  private inspectorFieldLabel(field: NaturePlacementInspectorField): string {
    const keys = {
      positionX: 'hudChrome.naturePlacementLab.positionX',
      positionY: 'hudChrome.naturePlacementLab.positionY',
      positionZ: 'hudChrome.naturePlacementLab.positionZ',
      rotationY: 'hudChrome.naturePlacementLab.rotationYDegrees',
      scale: 'hudChrome.naturePlacementLab.scale',
      groundOffsetY: 'hudChrome.naturePlacementLab.groundOffsetY',
    } as const;
    return t(keys[field]);
  }

  private setStatus(
    status: string,
    severity: NaturePlacementUiView['statusSeverity'] = 'info',
  ): void {
    this.status = status;
    this.statusSeverity = severity;
  }

  private toggleGrid(): void {
    this.setPreferences({ gridVisible: !this.preferences.gridVisible });
  }

  private toggleSnapPosition(): void {
    this.setPreferences({ snapPosition: !this.preferences.snapPosition });
  }

  private runShortcut(action: NaturePlacementShortcut, shiftKey: boolean): void {
    if (action === 'undo') this.undo();
    else if (action === 'redo') this.redo();
    else if (action === 'duplicate') this.duplicateSelected();
    else if (action === 'toggleGrid') this.toggleGrid();
    else if (action === 'toggleSnapPosition') this.toggleSnapPosition();
    else if (action === 'placeOnGround') this.placeOnGround();
    else if (action === 'delete') this.deleteSelected();
    else if (action === 'cancel') this.cancelPlacement();
    else if (action === 'rotate') this.adjustActive('rotate', 1, shiftKey);
    else if (action === 'scaleUp') this.adjustActive('scale', 1, shiftKey);
    else if (action === 'scaleDown') this.adjustActive('scale', -1, shiftKey);
    else if (action === 'heightUp') this.adjustActive('height', 1, shiftKey);
    else this.adjustActive('height', -1, shiftKey);
  }

  private readonly onMouseDown = (event: MouseEvent): void => {
    if (event.button === 2 && (this.state.placementActive || this.dragging)) {
      this.cancelPlacement();
      consume(event);
      return;
    }
    if (event.button !== 0) return;
    if (this.primaryDown(event.clientX, event.clientY)) consume(event);
  };

  private readonly onMouseMove = (event: MouseEvent): void => {
    if (!this.state.placementActive && !this.dragging) return;
    this.pointerMove(event.clientX, event.clientY);
    consume(event);
  };

  private readonly onMouseUp = (event: MouseEvent): void => {
    if (event.button !== 0 || (!this.state.placementActive && !this.dragging)) return;
    this.pointerUp();
    consume(event);
  };

  private readonly onWheel = (event: WheelEvent): void => {
    if (!this.state.placementActive && this.state.selectedPlacementId === null) return;
    this.adjustActive('scale', event.deltaY < 0 ? 1 : -1, event.shiftKey);
    consume(event);
  };

  private readonly onContextMenu = (event: MouseEvent): void => {
    if (!this.state.placementActive && !this.dragging) return;
    this.cancelPlacement();
    consume(event);
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const action = resolveNaturePlacementShortcut(event, {
      activeTransform: this.state.placementActive || this.state.selectedPlacementId !== null,
      placementActive: this.state.placementActive || this.dragging,
      selectedPlacement: this.state.selectedPlacementId !== null,
    });
    if (!action) return;
    this.runShortcut(action, event.shiftKey);
    consume(event);
  };
}
