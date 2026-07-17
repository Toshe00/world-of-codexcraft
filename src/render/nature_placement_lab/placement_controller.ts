import { formatNumber, t } from '../../ui/i18n';
import {
  NATURE_PLACEMENT_ASSETS,
  NATURE_PLACEMENT_LIMITS,
  type NaturePlacement,
  type NaturePlacementAssetId,
  type NaturePlacementPoint,
  validNaturePlacementPoint,
} from './placement_core';
import { EditHistory } from './placement_history';
import {
  loadNaturePlacementPreferences,
  type NaturePlacementPreferenceStorage,
  type NaturePlacementPreferences,
  normalizeNaturePlacementPreferences,
  saveNaturePlacementPreferences,
} from './placement_preferences';
import {
  cloneNaturePlacementProjectSnapshot,
  createNaturePlacementProject,
  DEFAULT_NATURE_PLACEMENT_PROJECT_NAME,
  equalNaturePlacementProjectSnapshots,
  IMPORTED_NATURE_PLACEMENT_PROJECT_NAME,
  type NaturePlacementGroup,
  type NaturePlacementLayer,
  type NaturePlacementProject,
  type NaturePlacementProjectSnapshot,
  type NatureProjectPlacement,
  selectionCenter,
} from './placement_project_core';
import {
  parseNaturePlacementProjectJson,
  serializeNaturePlacementProject,
} from './placement_project_json';
import {
  type NaturePlacementProjectStorage,
  NaturePlacementProjectStore,
} from './placement_project_storage';
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
  calculateNaturePlacementStatistics,
  type NaturePlacementStatistics,
} from './placement_statistics_core';
import {
  type NaturePlacementInspectorField,
  type NaturePlacementInspectorInput,
  validateNaturePlacementTransform,
} from './placement_transform_validation';
import { NaturePlacementWorkspace } from './placement_workspace_core';
import {
  compileNaturePlacementZone,
  natureZonePreviewPlacements,
  serializeNatureZonePackage,
  type NatureZonePackage,
} from './placement_zone_publication';

export interface NaturePlacementRenderAdapter {
  clearGhost(): void;
  dispose(): void;
  pickPlacement(clientX: number, clientY: number): string | null;
  sync(placements: readonly NaturePlacement[], selectedIds: readonly string[]): void;
  syncSelectionRectangle?(
    start: NaturePlacementPoint | null,
    end: NaturePlacementPoint | null,
  ): void;
  syncGrid(
    visible: boolean,
    cellSize: NaturePlacementPreferences['gridSize'],
    center: NaturePlacementPoint,
  ): void;
  startCompiledPreview?(placements: readonly NaturePlacement[]): void;
  stopCompiledPreview?(): void;
  updateGhost(
    assetId: NaturePlacementAssetId,
    point: NaturePlacementPoint,
    transform: NonNullable<NaturePlacementWorkspace['activeTransform']>,
  ): void;
}

export interface NaturePlacementUiView {
  assetIds: readonly NaturePlacementAssetId[];
  canRedo: boolean;
  canUndo: boolean;
  count: number;
  project: NaturePlacementProject;
  projects: readonly Pick<NaturePlacementProject, 'projectId' | 'name' | 'modifiedAt'>[];
  layers: readonly NaturePlacementLayer[];
  groups: readonly NaturePlacementGroup[];
  placing: boolean;
  compiledZonePackage: NatureZonePackage | null;
  previewActive: boolean;
  publicationWarnings: readonly string[];
  preferences: NaturePlacementPreferences;
  selectedAssetId: NaturePlacementAssetId | null;
  selectedPlacement: NaturePlacement | null;
  selectedPlacements: readonly NatureProjectPlacement[];
  statistics: NaturePlacementStatistics;
  status: string;
  statusSeverity: 'error' | 'info';
}

export interface NaturePlacementUiCallbacks {
  applyTransform(input: NaturePlacementInspectorInput): void;
  buildZonePackage(input: {
    zoneId: string;
    name: string;
    includedLayerIds: readonly string[];
  }): void;
  cancelPlacement(): void;
  clear(): void;
  deleteSelected(): void;
  duplicateSelected(): void;
  exportJson(): string;
  exportZonePackage(): { fileName: string; source: string } | null;
  importJson(source: string): void;
  languageChanged(): void;
  newProject(name: string): void;
  renameProject(name: string): void;
  saveProject(): void;
  saveProjectAs(name: string): void;
  loadProject(projectId: string): void;
  deleteProject(): void;
  createLayer(name: string): void;
  renameLayer(layerId: string, name: string): void;
  deleteLayer(layerId: string): void;
  deleteLayerPlacements(layerId: string): void;
  setLayerVisible(layerId: string, visible: boolean): void;
  setLayerLocked(layerId: string, locked: boolean): void;
  selectLayer(layerId: string): void;
  selectAll(): void;
  deselectAll(): void;
  invertSelection(): void;
  selectAssetPlacements(assetId: NaturePlacementAssetId): void;
  moveSelectionToLayer(layerId: string): void;
  applyGroupTransform(input: {
    moveX: string;
    moveY: string;
    moveZ: string;
    rotationDegrees: string;
    scaleFactor: string;
    groundOffsetDelta: string;
  }): void;
  groupSelection(name: string): void;
  ungroupSelection(): void;
  renameGroup(groupId: string, name: string): void;
  selectGroup(groupId: string): void;
  duplicateGroup(groupId: string): void;
  deleteGroup(groupId: string): void;
  deleteGroupAndPlacements(groupId: string): void;
  placeOnGround(): void;
  previewCompiledZone(): void;
  redo(): void;
  resetTransform(): void;
  selectAsset(assetId: NaturePlacementAssetId): void;
  setPreferences(patch: Partial<NaturePlacementPreferences>): void;
  startPlacement(): void;
  stopPreview(): void;
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
  projectStorage?: NaturePlacementProjectStorage | null;
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
  readonly state: NaturePlacementWorkspace;
  private readonly canvas: HTMLCanvasElement;
  private readonly eventWindow: Window;
  private readonly preferenceStorage: NaturePlacementPreferenceStorage | null;
  private readonly projectPersistenceAvailable: boolean;
  private readonly projectStore: NaturePlacementProjectStore;
  private readonly projectTerrain: ControllerOptions['projectTerrain'];
  private readonly render: NaturePlacementRenderAdapter;
  private readonly sampleGroundY: ControllerOptions['sampleGroundY'];
  private readonly ui: NaturePlacementUiAdapter;
  private readonly history = new EditHistory<NaturePlacementProjectSnapshot>(
    cloneNaturePlacementProjectSnapshot,
    equalNaturePlacementProjectSnapshots,
  );
  private readonly importedProjectIds = new Set<string>();
  private dragging = false;
  private dragStart: NaturePlacementProjectSnapshot | null = null;
  private dragPointerOffset: NaturePlacementPoint | null = null;
  private marqueeStart: NaturePlacementPoint | null = null;
  private marqueeEnd: NaturePlacementPoint | null = null;
  private marqueeMode: 'replace' | 'add' | 'toggle' = 'replace';
  private disposed = false;
  private lastPointer: { x: number; y: number } | null = null;
  private preferences: NaturePlacementPreferences;
  private status = t('hudChrome.naturePlacementLab.statusReady');
  private statusSeverity: NaturePlacementUiView['statusSeverity'] = 'info';
  private workCenter: NaturePlacementPoint;
  private compiledZonePackage: NatureZonePackage | null = null;
  private compiledProjectSignature: string | null = null;
  private previewActive = false;

  constructor(options: ControllerOptions) {
    this.canvas = options.canvas;
    this.eventWindow = options.eventWindow;
    this.preferenceStorage = options.preferenceStorage;
    const projectStorage =
      options.projectStorage === undefined ? options.preferenceStorage : options.projectStorage;
    this.projectPersistenceAvailable = projectStorage !== null;
    this.projectStore = new NaturePlacementProjectStore(projectStorage);
    this.projectTerrain = options.projectTerrain;
    this.render = options.render;
    this.sampleGroundY = options.sampleGroundY;
    this.workCenter = { ...options.initialWorkCenter };
    const restoredProject = this.projectStore.loadActive();
    const initialProject =
      restoredProject ??
      createNaturePlacementProject(
        this.createProjectId(),
        DEFAULT_NATURE_PLACEMENT_PROJECT_NAME,
        () => new Date(),
        { center: options.initialWorkCenter },
      );
    if (!restoredProject) this.projectStore.save(initialProject);
    this.state = new NaturePlacementWorkspace(initialProject);
    this.preferences = loadNaturePlacementPreferences(this.preferenceStorage);
    this.ui = options.createUi({
      applyTransform: (input) => this.applyTransform(input),
      buildZonePackage: (input) => this.buildZonePackage(input),
      cancelPlacement: () => this.cancelPlacement(),
      clear: () => this.clear(),
      deleteSelected: () => this.deleteSelected(),
      duplicateSelected: () => this.duplicateSelected(),
      exportJson: () => this.exportJson(),
      exportZonePackage: () => this.exportZonePackage(),
      importJson: (source) => this.importJson(source),
      languageChanged: () => this.languageChanged(),
      newProject: (name) => this.newProject(name),
      renameProject: (name) => this.renameProject(name),
      saveProject: () => this.saveProject(),
      saveProjectAs: (name) => this.saveProjectAs(name),
      loadProject: (projectId) => this.loadProject(projectId),
      deleteProject: () => this.deleteProject(),
      createLayer: (name) => this.createLayer(name),
      renameLayer: (layerId, name) => this.renameLayer(layerId, name),
      deleteLayer: (layerId) => this.deleteLayer(layerId),
      deleteLayerPlacements: (layerId) => this.deleteLayerPlacements(layerId),
      setLayerVisible: (layerId, visible) => this.setLayerVisible(layerId, visible),
      setLayerLocked: (layerId, locked) => this.setLayerLocked(layerId, locked),
      selectLayer: (layerId) => this.selectLayer(layerId),
      selectAll: () => this.selectAll(),
      deselectAll: () => this.deselectAll(),
      invertSelection: () => this.invertSelection(),
      selectAssetPlacements: (assetId) => this.selectAssetPlacements(assetId),
      moveSelectionToLayer: (layerId) => this.moveSelectionToLayer(layerId),
      applyGroupTransform: (input) => this.applyGroupTransform(input),
      groupSelection: (name) => this.groupSelection(name),
      ungroupSelection: () => this.ungroupSelection(),
      renameGroup: (groupId, name) => this.renameGroup(groupId, name),
      selectGroup: (groupId) => this.selectGroup(groupId),
      duplicateGroup: (groupId) => this.duplicateGroup(groupId),
      deleteGroup: (groupId) => this.deleteGroup(groupId),
      deleteGroupAndPlacements: (groupId) => this.deleteGroupAndPlacements(groupId),
      placeOnGround: () => this.placeOnGround(),
      previewCompiledZone: () => this.previewCompiledZone(),
      redo: () => this.redo(),
      resetTransform: () => this.resetTransform(),
      selectAsset: (assetId) => this.selectAsset(assetId),
      setPreferences: (patch) => this.setPreferences(patch),
      startPlacement: () => this.startPlacement(),
      stopPreview: () => this.stopPreview(),
      undo: () => this.undo(),
    });
    this.canvas.addEventListener('mousedown', this.onMouseDown, true);
    this.canvas.addEventListener('wheel', this.onWheel, { capture: true, passive: false });
    this.canvas.addEventListener('contextmenu', this.onContextMenu, true);
    this.eventWindow.addEventListener('mousemove', this.onMouseMove, true);
    this.eventWindow.addEventListener('mouseup', this.onMouseUp, true);
    this.eventWindow.addEventListener('keydown', this.onKeyDown, true);
    this.eventWindow.addEventListener('blur', this.onBlur);
    this.render.sync(this.state.visiblePlacements, []);
    this.syncGrid();
    this.refreshUi();
  }

  selectAsset(assetId: NaturePlacementAssetId): void {
    this.state.selectAsset(assetId);
    this.render.clearGhost();
    this.setStatus(t('hudChrome.naturePlacementLab.statusAssetSelected', { assetId }));
    this.sync();
  }

  languageChanged(): void {
    this.setStatus(
      this.previewActive
        ? t('hudChrome.naturePlacementLab.publishedZonePreview')
        : t('hudChrome.naturePlacementLab.statusReady'),
    );
    this.refreshUi();
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
    this.dragPointerOffset = null;
    this.marqueeStart = null;
    this.marqueeEnd = null;
    this.render.syncSelectionRectangle?.(null, null);
    this.render.clearGhost();
    this.setStatus(t('hudChrome.naturePlacementLab.statusPlacementCancelled'));
    this.sync();
  }

  pointerMove(clientX: number, clientY: number): void {
    if (this.previewActive) return;
    this.lastPointer = { x: clientX, y: clientY };
    const point = this.preparePoint(this.projectTerrain(clientX, clientY));
    if (this.dragging) {
      const center = this.state.selectionCenter;
      if (
        point &&
        center &&
        this.state.applySelectionTransform(
          {
            moveTo: {
              x: point.x + (this.dragPointerOffset?.x ?? 0),
              y: point.y + (this.dragPointerOffset?.y ?? 0),
              z: point.z + (this.dragPointerOffset?.z ?? 0),
            },
          },
          this.groupSnapOptions(),
          this.sampleGroundY,
        )
      ) {
        this.setStatus(t('hudChrome.naturePlacementLab.statusPlacementMoved'));
        this.syncScene();
      }
      return;
    }
    if (this.marqueeStart) {
      const rawPoint = this.projectTerrain(clientX, clientY);
      if (rawPoint && validNaturePlacementPoint(rawPoint)) {
        this.marqueeEnd = { ...rawPoint };
        this.render.syncSelectionRectangle?.(this.marqueeStart, this.marqueeEnd);
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

  primaryDown(
    clientX: number,
    clientY: number,
    modifiers: { ctrlKey?: boolean; shiftKey?: boolean } = {},
  ): boolean {
    if (this.previewActive) return false;
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
    if (!id) {
      const point = this.projectTerrain(clientX, clientY);
      if (!point || !validNaturePlacementPoint(point)) return false;
      this.marqueeStart = { ...point };
      this.marqueeEnd = { ...point };
      this.marqueeMode = modifiers.ctrlKey ? 'toggle' : modifiers.shiftKey ? 'add' : 'replace';
      if (this.marqueeMode === 'replace') this.state.deselectAll();
      this.render.syncSelectionRectangle?.(this.marqueeStart, this.marqueeEnd);
      this.sync();
      return true;
    }
    const mode = modifiers.ctrlKey
      ? 'toggle'
      : modifiers.shiftKey || this.state.selectedPlacementIds.includes(id)
        ? 'add'
        : 'replace';
    if (!this.state.selectPlacement(id, mode)) return false;
    if (!this.state.selectedPlacementIds.includes(id)) {
      this.sync();
      return true;
    }
    this.dragging = true;
    this.dragStart = this.state.editSnapshot;
    const pointerPoint = this.projectTerrain(clientX, clientY);
    const center = this.state.selectionCenter;
    this.dragPointerOffset =
      pointerPoint && center
        ? {
            x: center.x - pointerPoint.x,
            y: center.y - pointerPoint.y,
            z: center.z - pointerPoint.z,
          }
        : null;
    this.setStatus(t('hudChrome.naturePlacementLab.statusPlacementSelected', { id }));
    this.sync();
    return true;
  }

  pointerUp(): void {
    if (this.previewActive) return;
    if (this.marqueeStart) {
      if (this.marqueeEnd) {
        this.state.selectInRectangle(this.marqueeStart, this.marqueeEnd, this.marqueeMode);
      }
      this.marqueeStart = null;
      this.marqueeEnd = null;
      this.render.syncSelectionRectangle?.(null, null);
      this.sync();
      return;
    }
    if (!this.dragging) return;
    this.dragging = false;
    if (this.dragStart) this.history.record(this.dragStart, this.state.editSnapshot);
    this.dragStart = null;
    this.dragPointerOffset = null;
    this.sync();
  }

  updateWorkCenter(center: NaturePlacementPoint): void {
    if (this.disposed || !validNaturePlacementPoint(center)) return;
    this.workCenter = { ...center };
    this.syncGrid();
  }

  undo(): void {
    if (this.rejectPreviewEdit()) return;
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
    if (this.rejectPreviewEdit()) return;
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
    const selected = this.state.selectedPlacements;
    const center = this.state.selectionCenter;
    if (selected.length === 0 || !center) {
      this.setStatus(t('hudChrome.naturePlacementLab.statusNoSelection'), 'error');
      this.refreshUi();
      return;
    }
    const before = this.state.editSnapshot;
    const distance = Math.max(0.5, this.preferences.gridSize);
    let target = {
      ...center,
      x: center.x + distance,
      z: center.z + distance,
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
    const duplicates = this.state.duplicateSelected({
      x: target.x - center.x,
      y: target.y - center.y,
      z: target.z - center.z,
    });
    if (!duplicates) {
      this.setStatus(t('hudChrome.naturePlacementLab.statusDuplicateFailed'), 'error');
      this.refreshUi();
      return;
    }
    this.history.record(before, this.state.editSnapshot);
    this.setStatus(
      t('hudChrome.naturePlacementLab.statusDuplicated', {
        id: duplicates.map((placement) => placement.id).join(', '),
      }),
    );
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
    if (!this.state.clear()) {
      this.setStatus(t('hudChrome.naturePlacementLab.statusLockedLayer'), 'error');
      this.refreshUi();
      return;
    }
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
    if (this.state.selectedPlacementIds.length === 0) {
      this.setStatus(t('hudChrome.naturePlacementLab.statusNoSelection'), 'error');
      this.refreshUi();
      return;
    }
    const before = this.state.editSnapshot;
    if (
      !this.state.applySelectionTransform(
        { placeOnGround: true },
        this.groupSnapOptions(),
        this.sampleGroundY,
      )
    ) {
      this.setStatus(t('hudChrome.naturePlacementLab.statusNoTerrain'), 'error');
      this.refreshUi();
      return;
    }
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
    const json = serializeNaturePlacementProject(this.state.projectData);
    this.setStatus(
      t('hudChrome.naturePlacementLab.statusExported', {
        count: formatNumber(this.state.placements.length),
      }),
    );
    this.refreshUi();
    return json;
  }

  buildZonePackage(input: {
    zoneId: string;
    name: string;
    includedLayerIds: readonly string[];
  }): void {
    if (this.previewActive) {
      this.setStatus(t('hudChrome.naturePlacementLab.statusStopPreviewFirst'), 'error');
      this.refreshUi();
      return;
    }
    if (this.dragging || this.marqueeStart) {
      this.setStatus(t('hudChrome.naturePlacementLab.statusFinishEditFirst'), 'error');
      this.refreshUi();
      return;
    }
    this.state.cancelPlacement();
    this.render.clearGhost();
    try {
      const project = this.state.projectData;
      this.compiledZonePackage = compileNaturePlacementZone(
        project,
        input.zoneId,
        input.name,
        input.includedLayerIds,
      );
      this.compiledProjectSignature = serializeNaturePlacementProject(project);
      this.setStatus(
        t('hudChrome.naturePlacementLab.statusZonePackageBuilt', {
          count: formatNumber(this.compiledZonePackage.statistics.placementCount),
        }),
      );
    } catch (error) {
      console.warn('Nature Placement Lab zone package build rejected', error);
      this.compiledZonePackage = null;
      this.compiledProjectSignature = null;
      this.setStatus(t('hudChrome.naturePlacementLab.statusZonePackageBuildFailed'), 'error');
    }
    this.sync();
  }

  previewCompiledZone(): void {
    if (!this.compiledZonePackage) {
      this.setStatus(t('hudChrome.naturePlacementLab.statusBuildZonePackageFirst'), 'error');
      this.refreshUi();
      return;
    }
    if (!this.render.startCompiledPreview) {
      this.setStatus(t('hudChrome.naturePlacementLab.statusPreviewUnavailable'), 'error');
      this.refreshUi();
      return;
    }
    if (this.dragging || this.marqueeStart) {
      this.setStatus(t('hudChrome.naturePlacementLab.statusFinishEditFirst'), 'error');
      this.refreshUi();
      return;
    }
    this.state.cancelPlacement();
    this.render.clearGhost();
    this.render.startCompiledPreview(natureZonePreviewPlacements(this.compiledZonePackage));
    this.previewActive = true;
    this.setStatus(t('hudChrome.naturePlacementLab.publishedZonePreview'));
    this.refreshUi();
  }

  stopPreview(): void {
    if (!this.previewActive) return;
    this.render.stopCompiledPreview?.();
    this.previewActive = false;
    this.setStatus(t('hudChrome.naturePlacementLab.statusPreviewStopped'));
    this.sync();
  }

  exportZonePackage(): { fileName: string; source: string } | null {
    if (!this.compiledZonePackage) {
      this.setStatus(t('hudChrome.naturePlacementLab.statusBuildZonePackageFirst'), 'error');
      this.refreshUi();
      return null;
    }
    const source = serializeNatureZonePackage(this.compiledZonePackage);
    this.setStatus(
      t('hudChrome.naturePlacementLab.statusZonePackageExported', {
        count: formatNumber(this.compiledZonePackage.statistics.placementCount),
      }),
    );
    this.refreshUi();
    return { fileName: `${this.compiledZonePackage.zoneId}.json`, source };
  }

  importJson(source: string): void {
    if (this.disposed) return;
    try {
      const project = parseNaturePlacementProjectJson(source, {
        createProjectId: () => this.createProjectId(),
        existingProjectIds: this.projectStore.projectIds(),
        legacyName: IMPORTED_NATURE_PLACEMENT_PROJECT_NAME,
      });
      if (this.projectPersistenceAvailable && !this.projectStore.save(project)) {
        this.setStatus(t('hudChrome.naturePlacementLab.statusProjectFailed'), 'error');
        this.refreshUi();
        return;
      }
      const before = this.state.editSnapshot;
      this.state.replaceProject(project);
      this.history.record(before, this.state.editSnapshot);
      this.importedProjectIds.add(project.projectId);
      this.dragging = false;
      this.dragStart = null;
      this.render.clearGhost();
      this.setStatus(
        t('hudChrome.naturePlacementLab.statusImported', {
          count: formatNumber(project.placements.length),
        }),
      );
      this.sync();
    } catch (error) {
      console.warn('Nature Placement Lab import rejected', error);
      this.setStatus(t('hudChrome.naturePlacementLab.statusImportFailed'), 'error');
      this.refreshUi();
    }
  }

  newProject(name: string): void {
    const project = createNaturePlacementProject(this.createProjectId(), name);
    if (!this.projectStore.save(project)) {
      this.setStatus(t('hudChrome.naturePlacementLab.statusProjectFailed'), 'error');
      this.refreshUi();
      return;
    }
    this.state.replaceProject(project);
    this.history.clear();
    this.importedProjectIds.clear();
    this.setStatus(t('hudChrome.naturePlacementLab.statusProjectCreated'));
    this.sync();
  }

  renameProject(name: string): void {
    const project = this.state.projectData;
    const selectedPlacementIds = this.state.selectedPlacementIds;
    project.name = name;
    project.modifiedAt = new Date().toISOString();
    if (!this.projectStore.save(project)) {
      this.setStatus(t('hudChrome.naturePlacementLab.statusProjectFailed'), 'error');
      this.refreshUi();
      return;
    }
    this.state.restoreEditSnapshot({ project, selectedPlacementIds });
    this.setStatus(t('hudChrome.naturePlacementLab.statusProjectRenamed'));
    this.sync();
  }

  saveProject(): void {
    if (!this.projectStore.save(this.state.projectData)) {
      this.setStatus(t('hudChrome.naturePlacementLab.statusProjectFailed'), 'error');
    } else {
      this.setStatus(t('hudChrome.naturePlacementLab.statusProjectSaved'));
    }
    this.refreshUi();
  }

  saveProjectAs(name: string): void {
    const timestamp = new Date().toISOString();
    const project = this.state.projectData;
    project.projectId = this.createProjectId();
    project.name = name;
    project.createdAt = timestamp;
    project.modifiedAt = timestamp;
    if (!this.projectStore.save(project)) {
      this.setStatus(t('hudChrome.naturePlacementLab.statusProjectFailed'), 'error');
      this.refreshUi();
      return;
    }
    this.state.replaceProject(project);
    this.history.clear();
    this.importedProjectIds.clear();
    this.setStatus(t('hudChrome.naturePlacementLab.statusProjectSaved'));
    this.sync();
  }

  loadProject(projectId: string): void {
    const project = this.projectStore.get(projectId);
    if (!project || !this.projectStore.setActive(projectId)) {
      this.setStatus(t('hudChrome.naturePlacementLab.statusProjectFailed'), 'error');
      this.refreshUi();
      return;
    }
    this.state.replaceProject(project);
    this.history.clear();
    this.importedProjectIds.clear();
    this.setStatus(t('hudChrome.naturePlacementLab.statusProjectLoaded'));
    this.sync();
  }

  deleteProject(): void {
    const projectId = this.state.projectData.projectId;
    if (!this.projectStore.delete(projectId)) {
      this.setStatus(t('hudChrome.naturePlacementLab.statusProjectFailed'), 'error');
      this.refreshUi();
      return;
    }
    const next = this.projectStore.loadActive();
    if (next) this.state.replaceProject(next);
    else {
      const project = createNaturePlacementProject(
        this.createProjectId(),
        t('hudChrome.naturePlacementLab.untitledProjectName'),
      );
      this.projectStore.save(project);
      this.state.replaceProject(project);
    }
    this.history.clear();
    this.importedProjectIds.clear();
    this.setStatus(t('hudChrome.naturePlacementLab.statusProjectDeleted'));
    this.sync();
  }

  createLayer(name: string): void {
    this.recordWorkspaceEdit(
      () => this.state.createLayer(name) !== null,
      t('hudChrome.naturePlacementLab.statusLayerCreated'),
    );
  }

  renameLayer(layerId: string, name: string): void {
    this.recordWorkspaceEdit(
      () => this.state.renameLayer(layerId, name),
      t('hudChrome.naturePlacementLab.statusLayerRenamed'),
    );
  }

  deleteLayer(layerId: string): void {
    this.recordWorkspaceEdit(
      () => this.state.deleteEmptyLayer(layerId),
      t('hudChrome.naturePlacementLab.statusLayerDeleted'),
    );
  }

  deleteLayerPlacements(layerId: string): void {
    this.recordWorkspaceEdit(
      () => this.state.deleteLayerPlacements(layerId),
      t('hudChrome.naturePlacementLab.statusLayerCleared'),
    );
  }

  setLayerVisible(layerId: string, visible: boolean): void {
    this.recordWorkspaceEdit(
      () => this.state.setLayerVisible(layerId, visible),
      t('hudChrome.naturePlacementLab.statusLayerUpdated'),
    );
  }

  setLayerLocked(layerId: string, locked: boolean): void {
    this.recordWorkspaceEdit(
      () => this.state.setLayerLocked(layerId, locked),
      t('hudChrome.naturePlacementLab.statusLayerUpdated'),
    );
  }

  selectLayer(layerId: string): void {
    this.state.selectByLayer(layerId);
    this.sync();
  }

  selectAll(): void {
    this.state.selectAll();
    this.sync();
  }

  deselectAll(): void {
    this.state.deselectAll();
    this.sync();
  }

  invertSelection(): void {
    this.state.invertSelection();
    this.sync();
  }

  selectAssetPlacements(assetId: NaturePlacementAssetId): void {
    this.state.selectByAsset(assetId);
    this.sync();
  }

  moveSelectionToLayer(layerId: string): void {
    this.recordWorkspaceEdit(
      () => this.state.moveSelectionToLayer(layerId),
      t('hudChrome.naturePlacementLab.statusLayerChanged'),
    );
  }

  applyGroupTransform(input: {
    moveX: string;
    moveY: string;
    moveZ: string;
    rotationDegrees: string;
    scaleFactor: string;
    groundOffsetDelta: string;
  }): void {
    const center = this.state.selectionCenter;
    if (!center) {
      this.setStatus(t('hudChrome.naturePlacementLab.statusNoSelection'), 'error');
      this.refreshUi();
      return;
    }
    const values = {
      moveX: input.moveX.trim() === '' ? center.x : Number(input.moveX),
      moveY: input.moveY.trim() === '' ? center.y : Number(input.moveY),
      moveZ: input.moveZ.trim() === '' ? center.z : Number(input.moveZ),
      rotationDegrees: input.rotationDegrees.trim() === '' ? 0 : Number(input.rotationDegrees),
      scaleFactor: input.scaleFactor.trim() === '' ? 1 : Number(input.scaleFactor),
      groundOffsetDelta:
        input.groundOffsetDelta.trim() === '' ? 0 : Number(input.groundOffsetDelta),
    };
    if (!Object.values(values).every(Number.isFinite)) {
      this.setStatus(
        t('hudChrome.naturePlacementLab.statusFiniteRequired', { field: 'Transform' }),
        'error',
      );
      this.refreshUi();
      return;
    }
    if (values.rotationDegrees < -360 || values.rotationDegrees > 360) {
      this.setStatus(
        t('hudChrome.naturePlacementLab.statusOutsideLimits', {
          field: 'Rotation',
          min: -360,
          max: 360,
        }),
        'error',
      );
      this.refreshUi();
      return;
    }
    this.recordWorkspaceEdit(
      () =>
        this.state.applySelectionTransform(
          {
            moveTo: { x: values.moveX, y: values.moveY, z: values.moveZ },
            rotationDelta: (values.rotationDegrees * Math.PI) / 180,
            scaleFactor: values.scaleFactor,
            groundOffsetDelta: values.groundOffsetDelta,
          },
          this.groupSnapOptions(),
          this.sampleGroundY,
        ),
      t('hudChrome.naturePlacementLab.statusTransformApplied'),
    );
  }

  groupSelection(name: string): void {
    this.recordWorkspaceEdit(
      () => this.state.groupSelection(name) !== null,
      t('hudChrome.naturePlacementLab.statusGroupCreated'),
    );
  }

  ungroupSelection(): void {
    this.recordWorkspaceEdit(
      () => this.state.ungroupSelection(),
      t('hudChrome.naturePlacementLab.statusGroupDeleted'),
    );
  }

  renameGroup(groupId: string, name: string): void {
    this.recordWorkspaceEdit(
      () => this.state.renameGroup(groupId, name),
      t('hudChrome.naturePlacementLab.statusGroupRenamed'),
    );
  }

  selectGroup(groupId: string): void {
    if (!this.state.selectGroup(groupId)) {
      this.setStatus(t('hudChrome.naturePlacementLab.statusLockedLayer'), 'error');
      this.refreshUi();
      return;
    }
    this.sync();
  }

  duplicateGroup(groupId: string): void {
    const group = this.state.groups.find((entry) => entry.groupId === groupId);
    const placementIds = new Set(group?.placementIds ?? []);
    const center = selectionCenter(
      this.state.placements.filter((placement) => placementIds.has(placement.id)),
    );
    if (!group || !center) {
      this.setStatus(t('hudChrome.naturePlacementLab.statusOperationRejected'), 'error');
      this.refreshUi();
      return;
    }
    const distance = Math.max(0.5, this.preferences.gridSize);
    let target = { ...center, x: center.x + distance, z: center.z + distance };
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
    this.recordWorkspaceEdit(
      () =>
        this.state.duplicateGroup(
          groupId,
          { x: target.x - center.x, y: target.y - center.y, z: target.z - center.z },
          t('hudChrome.naturePlacementLab.groupCopyName', { name: group.name }),
        ) !== null,
      t('hudChrome.naturePlacementLab.statusGroupDuplicated'),
    );
  }

  deleteGroup(groupId: string): void {
    this.recordWorkspaceEdit(
      () => this.state.deleteGroup(groupId),
      t('hudChrome.naturePlacementLab.statusGroupDeleted'),
    );
  }

  deleteGroupAndPlacements(groupId: string): void {
    this.recordWorkspaceEdit(
      () => this.state.deleteGroupAndPlacements(groupId),
      t('hudChrome.naturePlacementLab.statusGroupDeleted'),
    );
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
    this.eventWindow.removeEventListener('blur', this.onBlur);
    this.render.stopCompiledPreview?.();
    this.previewActive = false;
    this.render.clearGhost();
    this.ui.dispose();
    this.render.dispose();
    this.history.clear();
    this.dragStart = null;
    this.dragPointerOffset = null;
    this.marqueeStart = null;
    this.marqueeEnd = null;
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

  private restoreHistory(snapshot: NaturePlacementProjectSnapshot): void {
    const currentProjectId = this.state.projectData.projectId;
    const targetProjectId = snapshot.project.projectId;
    if (currentProjectId !== targetProjectId) {
      if (this.importedProjectIds.has(targetProjectId)) {
        this.projectStore.save(snapshot.project);
      } else {
        this.projectStore.setActive(targetProjectId);
      }
      if (this.importedProjectIds.has(currentProjectId)) {
        this.projectStore.delete(currentProjectId);
      }
    }
    this.state.restoreEditSnapshot(snapshot);
    this.dragging = false;
    this.dragStart = null;
    this.dragPointerOffset = null;
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
    this.syncScene();
    this.refreshUi();
  }

  private syncScene(): void {
    if (this.previewActive) return;
    this.render.sync(this.state.visiblePlacements, this.state.selectedPlacementIds);
    this.refreshGhost();
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
    const project = this.state.projectData;
    const selectedPlacements = this.state.selectedPlacements;
    this.ui.update({
      assetIds: NATURE_PLACEMENT_ASSETS.map((asset) => asset.assetId),
      canRedo: this.history.canRedo,
      canUndo: this.history.canUndo,
      count: this.state.placements.length,
      project,
      projects: this.projectStore.list().map(({ projectId, name, modifiedAt }) => ({
        projectId,
        name,
        modifiedAt,
      })),
      layers: this.state.layers,
      groups: this.state.groups,
      placing: this.state.placementActive,
      compiledZonePackage: this.compiledZonePackage,
      previewActive: this.previewActive,
      publicationWarnings: this.publicationWarnings(project),
      preferences: { ...this.preferences },
      selectedAssetId: this.state.selectedAssetId,
      selectedPlacement: this.state.selectedPlacement,
      selectedPlacements,
      statistics: calculateNaturePlacementStatistics(
        project,
        new Set(this.state.selectedPlacementIds),
      ),
      status: this.status,
      statusSeverity: this.statusSeverity,
    });
  }

  private publicationWarnings(project: NaturePlacementProject): string[] {
    if (!this.compiledZonePackage) return [];
    const included = new Set(this.compiledZonePackage.includedLayerIds);
    const hiddenCount = project.layers.filter(
      (layer) => included.has(layer.layerId) && !layer.visible,
    ).length;
    const placementCounts = new Map(project.layers.map((layer) => [layer.layerId, 0]));
    for (const placement of project.placements) {
      placementCounts.set(placement.layerId, (placementCounts.get(placement.layerId) ?? 0) + 1);
    }
    const emptyCount = project.layers.filter(
      (layer) => included.has(layer.layerId) && (placementCounts.get(layer.layerId) ?? 0) === 0,
    ).length;
    const warnings: string[] = [];
    if (hiddenCount > 0) {
      warnings.push(
        t('hudChrome.naturePlacementLab.warningHiddenLayersIncluded', {
          count: formatNumber(hiddenCount),
        }),
      );
    }
    if (emptyCount > 0) {
      warnings.push(
        t('hudChrome.naturePlacementLab.warningEmptyLayersIncluded', {
          count: formatNumber(emptyCount),
        }),
      );
    }
    if (
      this.compiledProjectSignature !== null &&
      serializeNaturePlacementProject(project) !== this.compiledProjectSignature
    ) {
      warnings.push(t('hudChrome.naturePlacementLab.warningCompiledPackageStale'));
    }
    return warnings;
  }

  private rejectPreviewEdit(): boolean {
    if (!this.previewActive) return false;
    this.setStatus(t('hudChrome.naturePlacementLab.statusPreviewReadOnly'), 'error');
    this.refreshUi();
    return true;
  }

  private adjustActive(
    kind: 'rotate' | 'scale' | 'height',
    direction: number,
    fine: boolean,
  ): void {
    const before = this.state.editSnapshot;
    const selectedIds = this.state.selectedPlacementIds;
    let changed = false;
    const active = this.state.activeTransform;
    if (selectedIds.length > 1) {
      const rotationStep = (this.preferences.rotationStep * Math.PI) / 180;
      const scaleFactor = 1 + Math.sign(direction) * this.preferences.scaleStep;
      changed = this.state.applySelectionTransform(
        kind === 'rotate'
          ? { rotationDelta: Math.sign(direction) * rotationStep }
          : kind === 'scale'
            ? { scaleFactor }
            : {
                groundOffsetDelta:
                  Math.sign(direction) *
                  (fine
                    ? NATURE_PLACEMENT_LIMITS.groundOffsetStepFine
                    : NATURE_PLACEMENT_LIMITS.groundOffsetStep),
              },
        this.groupSnapOptions(),
        this.sampleGroundY,
      );
    } else if (active && kind === 'rotate' && this.preferences.snapRotation) {
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
    if (selectedIds.length > 0) {
      this.history.record(
        before,
        this.state.editSnapshot,
        `shortcut:${selectedIds.join(',')}:${kind}`,
      );
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

  private groupSnapOptions() {
    return {
      position: this.preferences.snapPosition,
      rotation: this.preferences.snapRotation,
      scale: this.preferences.snapScale,
      gridSize: this.preferences.gridSize,
      rotationStep: this.preferences.rotationStep,
      scaleStep: this.preferences.scaleStep,
    } as const;
  }

  private recordWorkspaceEdit(mutate: () => boolean, successStatus: string): void {
    const before = this.state.editSnapshot;
    if (!mutate()) {
      this.setStatus(t('hudChrome.naturePlacementLab.statusOperationRejected'), 'error');
      this.refreshUi();
      return;
    }
    this.history.record(before, this.state.editSnapshot);
    this.setStatus(successStatus);
    this.sync();
  }

  private createProjectId(): string {
    const taken = this.projectStore?.projectIds?.() ?? new Set<string>();
    const randomUuid = globalThis.crypto?.randomUUID?.();
    if (randomUuid && !taken.has(`project-${randomUuid}`)) return `project-${randomUuid}`;
    const value = Date.now().toString(36);
    let index = 1;
    while (taken.has(`project-${value}-${index}`)) index++;
    return `project-${value}-${index}`;
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
    else if (action === 'selectAll') this.selectAll();
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
    if (this.previewActive) return;
    if (event.button === 2 && (this.state.placementActive || this.dragging)) {
      this.cancelPlacement();
      consume(event);
      return;
    }
    if (event.button !== 0) return;
    if (
      this.primaryDown(event.clientX, event.clientY, {
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
      })
    )
      consume(event);
  };

  private readonly onMouseMove = (event: MouseEvent): void => {
    if (this.previewActive) return;
    if (!this.state.placementActive && !this.dragging && !this.marqueeStart) return;
    this.pointerMove(event.clientX, event.clientY);
    consume(event);
  };

  private readonly onBlur = (): void => {
    if (this.dragging || this.marqueeStart) this.cancelPlacement();
  };

  private readonly onMouseUp = (event: MouseEvent): void => {
    if (this.previewActive) return;
    if (event.button !== 0 || (!this.state.placementActive && !this.dragging && !this.marqueeStart))
      return;
    this.pointerUp();
    consume(event);
  };

  private readonly onWheel = (event: WheelEvent): void => {
    if (this.previewActive) return;
    if (!this.state.placementActive && this.state.selectedPlacementId === null) return;
    this.adjustActive('scale', event.deltaY < 0 ? 1 : -1, event.shiftKey);
    consume(event);
  };

  private readonly onContextMenu = (event: MouseEvent): void => {
    if (this.previewActive) return;
    if (!this.state.placementActive && !this.dragging && !this.marqueeStart) return;
    this.cancelPlacement();
    consume(event);
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (this.previewActive) return;
    const action = resolveNaturePlacementShortcut(event, {
      activeTransform: this.state.placementActive || this.state.selectedPlacementId !== null,
      placementActive: this.state.placementActive || this.dragging || this.marqueeStart !== null,
      selectedPlacement: this.state.selectedPlacementId !== null,
    });
    if (!action) return;
    this.runShortcut(action, event.shiftKey);
    consume(event);
  };
}
