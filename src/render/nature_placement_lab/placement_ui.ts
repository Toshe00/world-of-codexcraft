import { formatNumber, t } from '../../ui/i18n';
import type {
  NaturePlacementUiAdapter,
  NaturePlacementUiCallbacks,
  NaturePlacementUiView,
} from './placement_controller';
import type { NaturePlacementAssetId } from './placement_core';

function button(documentRef: Document, label: string, className = 'btn'): HTMLButtonElement {
  const element = documentRef.createElement('button');
  element.type = 'button';
  element.className = className;
  element.textContent = label;
  return element;
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
  private readonly assetButtons = new Map<NaturePlacementAssetId, HTMLButtonElement>();
  private readonly selection: HTMLElement;
  private readonly placeButton: HTMLButtonElement;
  private readonly deleteButton: HTMLButtonElement;
  private readonly count: HTMLElement;
  private readonly status: HTMLElement;
  private readonly fileInput: HTMLInputElement;
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
    const title = documentRef.createElement('h2');
    title.textContent = t('hudChrome.naturePlacementLab.title');
    this.body.appendChild(title);

    const assets = documentRef.createElement('div');
    assets.className = 'nature-placement-lab-assets';
    assets.setAttribute('aria-label', t('hudChrome.naturePlacementLab.assetsAria'));
    this.body.appendChild(assets);

    this.selection = documentRef.createElement('p');
    this.selection.className = 'nature-placement-lab-selection';
    this.body.appendChild(this.selection);

    const primaryActions = documentRef.createElement('div');
    primaryActions.className = 'nature-placement-lab-actions';
    this.placeButton = button(documentRef, t('hudChrome.naturePlacementLab.placeSelected'));
    this.deleteButton = button(documentRef, t('hudChrome.naturePlacementLab.deleteSelected'));
    primaryActions.append(this.placeButton, this.deleteButton);
    this.body.appendChild(primaryActions);

    const documentActions = documentRef.createElement('div');
    documentActions.className = 'nature-placement-lab-actions';
    const clearButton = button(documentRef, t('hudChrome.naturePlacementLab.clearAll'));
    const exportButton = button(documentRef, t('hudChrome.naturePlacementLab.exportJson'));
    const importButton = button(documentRef, t('hudChrome.naturePlacementLab.importJson'));
    documentActions.append(clearButton, exportButton, importButton);
    this.body.appendChild(documentActions);

    this.count = documentRef.createElement('p');
    this.count.className = 'nature-placement-lab-count';
    this.body.appendChild(this.count);

    const help = documentRef.createElement('p');
    help.className = 'nature-placement-lab-help';
    help.textContent = t('hudChrome.naturePlacementLab.help');
    this.body.appendChild(help);

    this.status = documentRef.createElement('p');
    this.status.className = 'nature-placement-lab-status';
    this.status.setAttribute('aria-live', 'polite');
    this.body.appendChild(this.status);

    this.fileInput = documentRef.createElement('input');
    this.fileInput.type = 'file';
    this.fileInput.accept = 'application/json,.json';
    this.fileInput.hidden = true;
    this.root.append(this.body, this.fileInput);
    mount.appendChild(this.root);

    this.toggle.addEventListener('click', () => this.setOpen(!this.open), { signal });
    this.placeButton.addEventListener(
      'click',
      () => {
        if (this.view?.placing) this.callbacks.cancelPlacement();
        else this.callbacks.startPlacement();
      },
      { signal },
    );
    this.deleteButton.addEventListener('click', () => this.callbacks.deleteSelected(), { signal });
    clearButton.addEventListener('click', () => this.callbacks.clear(), { signal });
    exportButton.addEventListener(
      'click',
      () => downloadJson(this.documentRef, this.callbacks.exportJson()),
      {
        signal,
      },
    );
    importButton.addEventListener('click', () => this.fileInput.click(), { signal });
    this.fileInput.addEventListener(
      'change',
      () => {
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
      },
      { signal },
    );
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
        this.body.querySelector('.nature-placement-lab-assets')?.appendChild(assetButton);
      }
      const selected = view.selectedAssetId === assetId;
      assetButton.classList.toggle('selected', selected);
      assetButton.setAttribute('aria-pressed', String(selected));
    }
    this.selection.textContent = view.selectedPlacementId
      ? t('hudChrome.naturePlacementLab.selectedObject', { id: view.selectedPlacementId })
      : view.selectedAssetId
        ? t('hudChrome.naturePlacementLab.selectedAsset', { assetId: view.selectedAssetId })
        : t('hudChrome.naturePlacementLab.noAssetSelected');
    this.placeButton.textContent = view.placing
      ? t('hudChrome.naturePlacementLab.cancelPlacement')
      : t('hudChrome.naturePlacementLab.placeSelected');
    this.placeButton.disabled = view.selectedAssetId === null;
    this.deleteButton.disabled = view.selectedPlacementId === null;
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

  private setOpen(open: boolean): void {
    this.open = open;
    this.body.hidden = !open;
    this.toggle.setAttribute('aria-expanded', String(open));
  }
}
