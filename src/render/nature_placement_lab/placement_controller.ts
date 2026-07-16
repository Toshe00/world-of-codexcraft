import { formatNumber, t } from '../../ui/i18n';
import {
  NATURE_PLACEMENT_ASSETS,
  type NaturePlacement,
  type NaturePlacementAssetId,
  type NaturePlacementPoint,
  NaturePlacementState,
} from './placement_core';
import { parseNaturePlacementJson, serializeNaturePlacements } from './placement_json';

export interface NaturePlacementRenderAdapter {
  clearGhost(): void;
  dispose(): void;
  pickPlacement(clientX: number, clientY: number): string | null;
  sync(placements: readonly NaturePlacement[], selectedId: string | null): void;
  updateGhost(
    assetId: NaturePlacementAssetId,
    point: NaturePlacementPoint,
    transform: NonNullable<NaturePlacementState['activeTransform']>,
  ): void;
}

export interface NaturePlacementUiView {
  assetIds: readonly NaturePlacementAssetId[];
  count: number;
  placing: boolean;
  selectedAssetId: NaturePlacementAssetId | null;
  selectedPlacementId: string | null;
  status: string;
  statusSeverity: 'error' | 'info';
}

export interface NaturePlacementUiCallbacks {
  cancelPlacement(): void;
  clear(): void;
  deleteSelected(): void;
  exportJson(): string;
  importJson(source: string): void;
  selectAsset(assetId: NaturePlacementAssetId): void;
  startPlacement(): void;
}

export interface NaturePlacementUiAdapter {
  dispose(): void;
  update(view: NaturePlacementUiView): void;
}

interface ControllerOptions {
  canvas: HTMLCanvasElement;
  eventWindow: Window;
  projectTerrain: (clientX: number, clientY: number) => NaturePlacementPoint | null;
  render: NaturePlacementRenderAdapter;
  createUi: (callbacks: NaturePlacementUiCallbacks) => NaturePlacementUiAdapter;
}

function consume(event: Event): void {
  event.preventDefault();
  event.stopImmediatePropagation();
}

function shouldIgnoreKeyboardTarget(event: KeyboardEvent): boolean {
  if (event.altKey || event.ctrlKey || event.metaKey) return true;
  const target = event.target as { closest?: (selector: string) => Element | null } | null;
  return (
    typeof target?.closest === 'function' &&
    target.closest('input, textarea, select, [contenteditable], #nature-placement-lab') !== null
  );
}

export class NaturePlacementController {
  readonly state = new NaturePlacementState();
  private readonly canvas: HTMLCanvasElement;
  private readonly eventWindow: Window;
  private readonly projectTerrain: ControllerOptions['projectTerrain'];
  private readonly render: NaturePlacementRenderAdapter;
  private readonly ui: NaturePlacementUiAdapter;
  private dragging = false;
  private disposed = false;
  private lastPointer: { x: number; y: number } | null = null;
  private status = t('hudChrome.naturePlacementLab.statusReady');
  private statusSeverity: NaturePlacementUiView['statusSeverity'] = 'info';

  constructor(options: ControllerOptions) {
    this.canvas = options.canvas;
    this.eventWindow = options.eventWindow;
    this.projectTerrain = options.projectTerrain;
    this.render = options.render;
    this.ui = options.createUi({
      cancelPlacement: () => this.cancelPlacement(),
      clear: () => this.clear(),
      deleteSelected: () => this.deleteSelected(),
      exportJson: () => this.exportJson(),
      importJson: (source) => this.importJson(source),
      selectAsset: (assetId) => this.selectAsset(assetId),
      startPlacement: () => this.startPlacement(),
    });
    this.canvas.addEventListener('mousedown', this.onMouseDown, true);
    this.canvas.addEventListener('wheel', this.onWheel, { capture: true, passive: false });
    this.canvas.addEventListener('contextmenu', this.onContextMenu, true);
    this.eventWindow.addEventListener('mousemove', this.onMouseMove, true);
    this.eventWindow.addEventListener('mouseup', this.onMouseUp, true);
    this.eventWindow.addEventListener('keydown', this.onKeyDown, true);
    this.render.sync([], null);
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
    this.state.cancelPlacement();
    this.dragging = false;
    this.render.clearGhost();
    this.setStatus(t('hudChrome.naturePlacementLab.statusPlacementCancelled'));
    this.sync();
  }

  pointerMove(clientX: number, clientY: number): void {
    this.lastPointer = { x: clientX, y: clientY };
    const point = this.projectTerrain(clientX, clientY);
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
      const placed = this.state.place(this.projectTerrain(clientX, clientY));
      if (!placed) {
        this.setStatus(t('hudChrome.naturePlacementLab.statusNoTerrain'), 'error');
        this.refreshUi();
        return true;
      }
      this.setStatus(
        t('hudChrome.naturePlacementLab.statusAssetPlaced', { assetId: placed.assetId }),
      );
      this.sync();
      return true;
    }
    const id = this.render.pickPlacement(clientX, clientY);
    if (!id || !this.state.selectPlacement(id)) return false;
    this.dragging = true;
    this.setStatus(t('hudChrome.naturePlacementLab.statusPlacementSelected', { id }));
    this.sync();
    return true;
  }

  pointerUp(): void {
    this.dragging = false;
  }

  deleteSelected(): void {
    if (!this.state.deleteSelected()) {
      this.setStatus(t('hudChrome.naturePlacementLab.statusNoSelection'), 'error');
      this.refreshUi();
      return;
    }
    this.dragging = false;
    this.setStatus(t('hudChrome.naturePlacementLab.statusPlacementDeleted'));
    this.sync();
  }

  clear(): void {
    this.state.clear();
    this.dragging = false;
    this.render.clearGhost();
    this.setStatus(t('hudChrome.naturePlacementLab.statusCleared'));
    this.sync();
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
      this.state.replacePlacements(placements);
      this.dragging = false;
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
    this.lastPointer = null;
  }

  private sync(): void {
    this.render.sync(this.state.placements, this.state.selectedPlacementId);
    this.refreshGhost();
    this.refreshUi();
  }

  private refreshGhost(): void {
    if (!this.state.placementActive || !this.lastPointer) {
      this.render.clearGhost();
      return;
    }
    const point = this.projectTerrain(this.lastPointer.x, this.lastPointer.y);
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
      count: this.state.placements.length,
      placing: this.state.placementActive,
      selectedAssetId: this.state.selectedAssetId,
      selectedPlacementId: this.state.selectedPlacementId,
      status: this.status,
      statusSeverity: this.statusSeverity,
    });
  }

  private adjustActive(
    kind: 'rotate' | 'scale' | 'height',
    direction: number,
    fine: boolean,
  ): void {
    const changed =
      kind === 'rotate'
        ? this.state.rotateActive(direction)
        : kind === 'scale'
          ? this.state.adjustScale(direction, fine)
          : this.state.adjustGroundOffset(direction, fine);
    if (!changed) return;
    this.setStatus(t('hudChrome.naturePlacementLab.statusTransformAdjusted'));
    this.sync();
  }

  private setStatus(
    status: string,
    severity: NaturePlacementUiView['statusSeverity'] = 'info',
  ): void {
    this.status = status;
    this.statusSeverity = severity;
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
    if (event.code === 'Escape' && (this.state.placementActive || this.dragging)) {
      this.cancelPlacement();
      consume(event);
      return;
    }
    if (shouldIgnoreKeyboardTarget(event)) return;
    const active = this.state.placementActive || this.state.selectedPlacementId !== null;
    if (event.code === 'Delete' && this.state.selectedPlacementId !== null) {
      this.deleteSelected();
      consume(event);
      return;
    }
    if (!active) return;
    if (event.code === 'KeyR') this.adjustActive('rotate', 1, event.shiftKey);
    else if (event.code === 'Equal' || event.code === 'NumpadAdd') {
      this.adjustActive('scale', 1, event.shiftKey);
    } else if (event.code === 'Minus' || event.code === 'NumpadSubtract') {
      this.adjustActive('scale', -1, event.shiftKey);
    } else if (event.code === 'PageUp') this.adjustActive('height', 1, event.shiftKey);
    else if (event.code === 'PageDown') this.adjustActive('height', -1, event.shiftKey);
    else return;
    consume(event);
  };
}
