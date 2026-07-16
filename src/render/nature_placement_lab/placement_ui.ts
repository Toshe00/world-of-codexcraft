import { formatNumber, t } from '../../ui/i18n';
import type {
  NaturePlacementUiAdapter,
  NaturePlacementUiCallbacks,
  NaturePlacementUiView,
} from './placement_controller';
import type { NaturePlacementAssetId } from './placement_core';
import { NaturePlacementInspector } from './placement_inspector';
import {
  NATURE_PLACEMENT_GRID_SIZES,
  NATURE_PLACEMENT_ROTATION_STEPS,
  NATURE_PLACEMENT_SCALE_STEPS,
} from './placement_snapping';

function button(documentRef: Document, label: string, className = 'btn'): HTMLButtonElement {
  const element = documentRef.createElement('button');
  element.type = 'button';
  element.className = className;
  element.textContent = label;
  return element;
}

function section(documentRef: Document, titleText: string): HTMLElement {
  const root = documentRef.createElement('section');
  root.className = 'nature-placement-lab-section';
  const title = documentRef.createElement('h3');
  title.textContent = titleText;
  root.appendChild(title);
  return root;
}

function checkbox(
  documentRef: Document,
  labelText: string,
  onChange: (checked: boolean) => void,
  signal: AbortSignal,
): { input: HTMLInputElement; label: HTMLLabelElement } {
  const label = documentRef.createElement('label');
  label.className = 'nature-placement-lab-check';
  const input = documentRef.createElement('input');
  input.type = 'checkbox';
  label.append(input, documentRef.createTextNode(labelText));
  input.addEventListener('change', () => onChange(input.checked), { signal });
  return { input, label };
}

function selectNumber<T extends number>(
  documentRef: Document,
  labelText: string,
  values: readonly T[],
  onChange: (value: T) => void,
  signal: AbortSignal,
): { select: HTMLSelectElement; label: HTMLLabelElement } {
  const label = documentRef.createElement('label');
  label.textContent = labelText;
  const select = documentRef.createElement('select');
  for (const value of values) {
    const option = documentRef.createElement('option');
    option.value = String(value);
    option.textContent = formatNumber(value, { maximumFractionDigits: 2 });
    select.appendChild(option);
  }
  select.addEventListener('change', () => onChange(Number(select.value) as T), { signal });
  label.appendChild(select);
  return { select, label };
}

function downloadJson(documentRef: Document, source: string): void {
  const blob = new Blob([source], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = documentRef.createElement('a');
  link.href = url;
  link.download = 'nature-placement-lab.json';
  documentRef.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export class NaturePlacementUi implements NaturePlacementUiAdapter {
  private readonly abort = new AbortController();
  private readonly root: HTMLElement;
  private readonly body: HTMLElement;
  private readonly toggle: HTMLButtonElement;
  private readonly assets: HTMLElement;
  private readonly assetButtons = new Map<NaturePlacementAssetId, HTMLButtonElement>();
  private readonly selection: HTMLElement;
  private readonly placeButton: HTMLButtonElement;
  private readonly count: HTMLElement;
  private readonly status: HTMLElement;
  private readonly fileInput: HTMLInputElement;
  private readonly inspector: NaturePlacementInspector;
  private readonly gridButton: HTMLButtonElement;
  private readonly gridSize: HTMLSelectElement;
  private readonly snapPosition: HTMLInputElement;
  private readonly snapRotation: HTMLInputElement;
  private readonly snapScale: HTMLInputElement;
  private readonly snapToGround: HTMLInputElement;
  private readonly rotationStep: HTMLSelectElement;
  private readonly scaleStep: HTMLSelectElement;
  private readonly undoButton: HTMLButtonElement;
  private readonly redoButton: HTMLButtonElement;
  private readonly historyState: HTMLElement;
  private open = true;
  private view: NaturePlacementUiView | null = null;
  private disposed = false;

  constructor(
    private readonly documentRef: Document,
    private readonly callbacks: NaturePlacementUiCallbacks,
    mount: HTMLElement,
  ) {
    const signal = this.abort.signal;
    this.root = documentRef.createElement('section');
    this.root.id = 'nature-placement-lab';
    this.root.className = 'panel';
    this.root.setAttribute('aria-label', t('hudChrome.naturePlacementLab.title'));

    this.toggle = button(
      documentRef,
      t('hudChrome.naturePlacementLab.title'),
      'btn nature-placement-lab-toggle',
    );
    this.toggle.setAttribute('aria-expanded', 'true');
    this.root.appendChild(this.toggle);

    this.body = documentRef.createElement('div');
    this.body.className = 'nature-placement-lab-body';

    const assetsSection = section(documentRef, t('hudChrome.naturePlacementLab.assetsSection'));
    this.assets = documentRef.createElement('div');
    this.assets.className = 'nature-placement-lab-assets';
    this.assets.setAttribute('aria-label', t('hudChrome.naturePlacementLab.assetsAria'));
    assetsSection.appendChild(this.assets);
    this.body.appendChild(assetsSection);

    const selectionSection = section(
      documentRef,
      t('hudChrome.naturePlacementLab.selectionSection'),
    );
    this.selection = documentRef.createElement('p');
    this.selection.className = 'nature-placement-lab-selection';
    const selectionActions = documentRef.createElement('div');
    selectionActions.className = 'nature-placement-lab-actions';
    this.placeButton = button(documentRef, t('hudChrome.naturePlacementLab.placeSelected'));
    const duplicateButton = button(documentRef, t('hudChrome.naturePlacementLab.duplicate'));
    selectionActions.append(this.placeButton, duplicateButton);
    selectionSection.append(this.selection, selectionActions);
    this.body.appendChild(selectionSection);

    const transformSection = section(
      documentRef,
      t('hudChrome.naturePlacementLab.transformSection'),
    );
    this.inspector = new NaturePlacementInspector(
      documentRef,
      {
        apply: (input) => this.callbacks.applyTransform(input),
        delete: () => this.callbacks.deleteSelected(),
        duplicate: () => this.callbacks.duplicateSelected(),
        placeOnGround: () => this.callbacks.placeOnGround(),
        reset: () => this.callbacks.resetTransform(),
      },
      transformSection,
      signal,
    );
    this.body.appendChild(transformSection);

    const snappingSection = section(documentRef, t('hudChrome.naturePlacementLab.snappingSection'));
    this.gridButton = button(documentRef, t('hudChrome.naturePlacementLab.hideGrid'));
    const gridSize = selectNumber(
      documentRef,
      t('hudChrome.naturePlacementLab.gridSize'),
      NATURE_PLACEMENT_GRID_SIZES,
      (value) => this.callbacks.setPreferences({ gridSize: value }),
      signal,
    );
    this.gridSize = gridSize.select;
    const snapPosition = checkbox(
      documentRef,
      t('hudChrome.naturePlacementLab.snapPosition'),
      (value) => this.callbacks.setPreferences({ snapPosition: value }),
      signal,
    );
    this.snapPosition = snapPosition.input;
    const snapRotation = checkbox(
      documentRef,
      t('hudChrome.naturePlacementLab.snapRotation'),
      (value) => this.callbacks.setPreferences({ snapRotation: value }),
      signal,
    );
    this.snapRotation = snapRotation.input;
    const rotationStep = selectNumber(
      documentRef,
      t('hudChrome.naturePlacementLab.rotationStep'),
      NATURE_PLACEMENT_ROTATION_STEPS,
      (value) => this.callbacks.setPreferences({ rotationStep: value }),
      signal,
    );
    this.rotationStep = rotationStep.select;
    const snapScale = checkbox(
      documentRef,
      t('hudChrome.naturePlacementLab.snapScale'),
      (value) => this.callbacks.setPreferences({ snapScale: value }),
      signal,
    );
    this.snapScale = snapScale.input;
    const scaleStep = selectNumber(
      documentRef,
      t('hudChrome.naturePlacementLab.scaleStep'),
      NATURE_PLACEMENT_SCALE_STEPS,
      (value) => this.callbacks.setPreferences({ scaleStep: value }),
      signal,
    );
    this.scaleStep = scaleStep.select;
    const snapToGround = checkbox(
      documentRef,
      t('hudChrome.naturePlacementLab.snapToGround'),
      (value) => this.callbacks.setPreferences({ snapToGround: value }),
      signal,
    );
    this.snapToGround = snapToGround.input;
    const snapControls = documentRef.createElement('div');
    snapControls.className = 'nature-placement-lab-controls';
    snapControls.append(
      gridSize.label,
      snapPosition.label,
      snapRotation.label,
      rotationStep.label,
      snapScale.label,
      scaleStep.label,
      snapToGround.label,
    );
    snappingSection.append(this.gridButton, snapControls);
    this.body.appendChild(snappingSection);

    const historySection = section(documentRef, t('hudChrome.naturePlacementLab.historySection'));
    const historyActions = documentRef.createElement('div');
    historyActions.className = 'nature-placement-lab-actions';
    this.undoButton = button(documentRef, t('hudChrome.naturePlacementLab.undo'));
    this.redoButton = button(documentRef, t('hudChrome.naturePlacementLab.redo'));
    historyActions.append(this.undoButton, this.redoButton);
    this.historyState = documentRef.createElement('p');
    this.historyState.className = 'nature-placement-lab-history-state';
    historySection.append(historyActions, this.historyState);
    this.body.appendChild(historySection);

    const ioSection = section(documentRef, t('hudChrome.naturePlacementLab.importExportSection'));
    const documentActions = documentRef.createElement('div');
    documentActions.className = 'nature-placement-lab-actions';
    const clearButton = button(documentRef, t('hudChrome.naturePlacementLab.clearAll'));
    const exportButton = button(documentRef, t('hudChrome.naturePlacementLab.exportJson'));
    const importButton = button(documentRef, t('hudChrome.naturePlacementLab.importJson'));
    documentActions.append(clearButton, exportButton, importButton);
    ioSection.appendChild(documentActions);
    this.body.appendChild(ioSection);

    this.count = documentRef.createElement('p');
    this.count.className = 'nature-placement-lab-count';
    this.status = documentRef.createElement('p');
    this.status.className = 'nature-placement-lab-status';
    this.status.setAttribute('aria-live', 'polite');
    const help = documentRef.createElement('p');
    help.className = 'nature-placement-lab-help';
    help.textContent = t('hudChrome.naturePlacementLab.help');
    this.body.append(this.count, help, this.status);

    this.fileInput = documentRef.createElement('input');
    this.fileInput.type = 'file';
    this.fileInput.accept = 'application/json,.json';
    this.fileInput.hidden = true;
    this.root.append(this.body, this.fileInput);
    mount.appendChild(this.root);

    this.toggle.addEventListener('click', () => this.setOpen(!this.open), { signal });
    this.placeButton.addEventListener(
      'click',
      () =>
        this.view?.placing ? this.callbacks.cancelPlacement() : this.callbacks.startPlacement(),
      { signal },
    );
    duplicateButton.addEventListener('click', () => this.callbacks.duplicateSelected(), { signal });
    this.gridButton.addEventListener(
      'click',
      () => this.callbacks.setPreferences({ gridVisible: !this.view?.preferences.gridVisible }),
      { signal },
    );
    this.undoButton.addEventListener('click', () => this.callbacks.undo(), { signal });
    this.redoButton.addEventListener('click', () => this.callbacks.redo(), { signal });
    clearButton.addEventListener('click', () => this.callbacks.clear(), { signal });
    exportButton.addEventListener(
      'click',
      () => downloadJson(this.documentRef, this.callbacks.exportJson()),
      { signal },
    );
    importButton.addEventListener('click', () => this.fileInput.click(), { signal });
    this.fileInput.addEventListener('change', () => this.importSelectedFile(), { signal });
    for (const eventName of ['mousedown', 'mouseup', 'contextmenu', 'keydown'] as const) {
      this.root.addEventListener(eventName, (event) => event.stopPropagation(), { signal });
    }
  }

  update(view: NaturePlacementUiView): void {
    this.view = view;
    for (const assetId of view.assetIds) {
      let assetButton = this.assetButtons.get(assetId);
      if (!assetButton) {
        assetButton = button(this.documentRef, assetId, 'btn nature-placement-lab-asset');
        assetButton.addEventListener('click', () => this.callbacks.selectAsset(assetId), {
          signal: this.abort.signal,
        });
        this.assetButtons.set(assetId, assetButton);
        this.assets.appendChild(assetButton);
      }
      const selected = view.selectedAssetId === assetId;
      assetButton.classList.toggle('selected', selected);
      assetButton.setAttribute('aria-pressed', String(selected));
    }
    this.selection.textContent = view.selectedPlacement
      ? t('hudChrome.naturePlacementLab.selectedObject', { id: view.selectedPlacement.id })
      : view.selectedAssetId
        ? t('hudChrome.naturePlacementLab.selectedAsset', { assetId: view.selectedAssetId })
        : t('hudChrome.naturePlacementLab.noAssetSelected');
    this.placeButton.textContent = view.placing
      ? t('hudChrome.naturePlacementLab.cancelPlacement')
      : t('hudChrome.naturePlacementLab.placeSelected');
    this.placeButton.disabled = view.selectedAssetId === null;
    this.inspector.update(view.selectedPlacement, this.documentRef.activeElement);

    this.gridButton.textContent = view.preferences.gridVisible
      ? t('hudChrome.naturePlacementLab.hideGrid')
      : t('hudChrome.naturePlacementLab.showGrid');
    this.gridSize.value = String(view.preferences.gridSize);
    this.snapPosition.checked = view.preferences.snapPosition;
    this.snapRotation.checked = view.preferences.snapRotation;
    this.snapScale.checked = view.preferences.snapScale;
    this.snapToGround.checked = view.preferences.snapToGround;
    this.rotationStep.value = String(view.preferences.rotationStep);
    this.scaleStep.value = String(view.preferences.scaleStep);

    this.undoButton.disabled = !view.canUndo;
    this.redoButton.disabled = !view.canRedo;
    this.historyState.textContent = t('hudChrome.naturePlacementLab.historyState', {
      redo: view.canRedo
        ? t('hudChrome.naturePlacementLab.available')
        : t('hudChrome.naturePlacementLab.unavailable'),
      undo: view.canUndo
        ? t('hudChrome.naturePlacementLab.available')
        : t('hudChrome.naturePlacementLab.unavailable'),
    });
    this.count.textContent = t('hudChrome.naturePlacementLab.placementsCount', {
      count: formatNumber(view.count),
    });
    this.status.textContent = view.status;
    this.status.dataset.severity = view.statusSeverity;
  }

  dispose(): void {
    this.disposed = true;
    this.abort.abort();
    this.root.remove();
  }

  private importSelectedFile(): void {
    const file = this.fileInput.files?.[0];
    this.fileInput.value = '';
    if (!file) return;
    void file
      .text()
      .then((source) => {
        if (!this.disposed) this.callbacks.importJson(source);
      })
      .catch(() => {
        if (!this.disposed) this.callbacks.importJson('');
      });
  }

  private setOpen(open: boolean): void {
    this.open = open;
    this.body.hidden = !open;
    this.toggle.setAttribute('aria-expanded', String(open));
  }
}
