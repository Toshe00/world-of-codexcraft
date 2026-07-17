import { formatNumber, t } from '../../ui/i18n';
import type { TranslationKey } from '../../ui/i18n.catalog';
import type {
  NaturePlacementUiAdapter,
  NaturePlacementUiCallbacks,
  NaturePlacementUiView,
} from './placement_controller';
import type { NaturePlacementAssetId } from './placement_core';
import { NaturePlacementInspector } from './placement_inspector';
import {
  DEFAULT_NATURE_PLACEMENT_PROJECT_NAME,
  IMPORTED_NATURE_PLACEMENT_PROJECT_NAME,
} from './placement_project_core';
import {
  NATURE_PLACEMENT_GRID_SIZES,
  NATURE_PLACEMENT_ROTATION_STEPS,
  NATURE_PLACEMENT_SCALE_STEPS,
} from './placement_snapping';

const STATIC_LOCALIZATION_KEYS = [
  'hudChrome.naturePlacementLab.title',
  'hudChrome.naturePlacementLab.projectsSection',
  'hudChrome.naturePlacementLab.newProject',
  'hudChrome.naturePlacementLab.renameProject',
  'hudChrome.naturePlacementLab.saveProject',
  'hudChrome.naturePlacementLab.saveProjectAs',
  'hudChrome.naturePlacementLab.loadProject',
  'hudChrome.naturePlacementLab.deleteProject',
  'hudChrome.naturePlacementLab.assetsSection',
  'hudChrome.naturePlacementLab.assetsAria',
  'hudChrome.naturePlacementLab.layersSection',
  'hudChrome.naturePlacementLab.createLayer',
  'hudChrome.naturePlacementLab.selectionSection',
  'hudChrome.naturePlacementLab.placeSelected',
  'hudChrome.naturePlacementLab.duplicate',
  'hudChrome.naturePlacementLab.selectAll',
  'hudChrome.naturePlacementLab.deselectAll',
  'hudChrome.naturePlacementLab.invertSelection',
  'hudChrome.naturePlacementLab.ungroup',
  'hudChrome.naturePlacementLab.selectByAsset',
  'hudChrome.naturePlacementLab.moveToLayer',
  'hudChrome.naturePlacementLab.transformSection',
  'hudChrome.naturePlacementLab.id',
  'hudChrome.naturePlacementLab.assetId',
  'hudChrome.naturePlacementLab.positionX',
  'hudChrome.naturePlacementLab.positionY',
  'hudChrome.naturePlacementLab.positionZ',
  'hudChrome.naturePlacementLab.rotationYDegrees',
  'hudChrome.naturePlacementLab.scale',
  'hudChrome.naturePlacementLab.groundOffsetY',
  'hudChrome.naturePlacementLab.apply',
  'hudChrome.naturePlacementLab.resetTransform',
  'hudChrome.naturePlacementLab.placeOnGround',
  'hudChrome.naturePlacementLab.applyGroupTransform',
  'hudChrome.naturePlacementLab.selectionCenterX',
  'hudChrome.naturePlacementLab.selectionCenterY',
  'hudChrome.naturePlacementLab.selectionCenterZ',
  'hudChrome.naturePlacementLab.rotationDelta',
  'hudChrome.naturePlacementLab.scaleFactor',
  'hudChrome.naturePlacementLab.groundOffsetDelta',
  'hudChrome.naturePlacementLab.groupsSection',
  'hudChrome.naturePlacementLab.groupSelection',
  'hudChrome.naturePlacementLab.snappingSection',
  'hudChrome.naturePlacementLab.hideGrid',
  'hudChrome.naturePlacementLab.gridSize',
  'hudChrome.naturePlacementLab.snapPosition',
  'hudChrome.naturePlacementLab.snapRotation',
  'hudChrome.naturePlacementLab.rotationStep',
  'hudChrome.naturePlacementLab.snapScale',
  'hudChrome.naturePlacementLab.scaleStep',
  'hudChrome.naturePlacementLab.snapToGround',
  'hudChrome.naturePlacementLab.historySection',
  'hudChrome.naturePlacementLab.undo',
  'hudChrome.naturePlacementLab.redo',
  'hudChrome.naturePlacementLab.importExportSection',
  'hudChrome.naturePlacementLab.publicationPreviewSection',
  'hudChrome.naturePlacementLab.zoneId',
  'hudChrome.naturePlacementLab.visibleName',
  'hudChrome.naturePlacementLab.layersToPublish',
  'hudChrome.naturePlacementLab.buildZonePackage',
  'hudChrome.naturePlacementLab.previewCompiledZone',
  'hudChrome.naturePlacementLab.stopPreview',
  'hudChrome.naturePlacementLab.exportZonePackage',
  'hudChrome.naturePlacementLab.publishedZonePreview',
  'hudChrome.naturePlacementLab.clearAll',
  'hudChrome.naturePlacementLab.exportJson',
  'hudChrome.naturePlacementLab.importJson',
  'hudChrome.naturePlacementLab.help',
  'hudChrome.naturePlacementLab.statisticsSection',
] as const satisfies readonly TranslationKey[];

const DEFAULT_LAYER_LABELS = {
  'layer-trees': ['Trees', 'hudChrome.naturePlacementLab.defaultLayerTrees'],
  'layer-bushes': ['Bushes', 'hudChrome.naturePlacementLab.defaultLayerBushes'],
  'layer-flowers': ['Flowers', 'hudChrome.naturePlacementLab.defaultLayerFlowers'],
  'layer-grass': ['Grass', 'hudChrome.naturePlacementLab.defaultLayerGrass'],
  'layer-dead-nature': ['Dead Nature', 'hudChrome.naturePlacementLab.defaultLayerDeadNature'],
  'layer-other': ['Other', 'hudChrome.naturePlacementLab.defaultLayerOther'],
} as const satisfies Readonly<Record<string, readonly [string, TranslationKey]>>;

export function naturePlacementLayerDisplayName(layerId: string, name: string): string {
  const entry = DEFAULT_LAYER_LABELS[layerId as keyof typeof DEFAULT_LAYER_LABELS];
  return entry && name === entry[0] ? t(entry[1]) : name;
}

function projectDisplayName(name: string): string {
  if (name === DEFAULT_NATURE_PLACEMENT_PROJECT_NAME) {
    return t('hudChrome.naturePlacementLab.untitledProjectName');
  }
  if (name === IMPORTED_NATURE_PLACEMENT_PROJECT_NAME) {
    return t('hudChrome.naturePlacementLab.importedProjectName');
  }
  return name;
}

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

function downloadJson(documentRef: Document, source: string, fileName: string): void {
  const blob = new Blob([source], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = documentRef.createElement('a');
  link.href = url;
  link.download = fileName;
  documentRef.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export class NaturePlacementUi implements NaturePlacementUiAdapter {
  private readonly abort = new AbortController();
  private layersAbort: AbortController | null = null;
  private groupsAbort: AbortController | null = null;
  private publicationLayersAbort: AbortController | null = null;
  private readonly root: HTMLElement;
  private readonly body: HTMLElement;
  private readonly toggle: HTMLButtonElement;
  private readonly assets: HTMLElement;
  private readonly assetButtons = new Map<NaturePlacementAssetId, HTMLButtonElement>();
  private readonly selection: HTMLElement;
  private readonly selectionAssets: HTMLElement;
  private readonly selectionLayers: HTMLElement;
  private readonly projectSelect: HTMLSelectElement;
  private readonly layersRoot: HTMLElement;
  private readonly layerTarget: HTMLSelectElement;
  private readonly assetSelection: HTMLSelectElement;
  private readonly groupsRoot: HTMLElement;
  private readonly statisticsRoot: HTMLElement;
  private readonly publicationSection: HTMLDetailsElement;
  private readonly publicationZoneId: HTMLInputElement;
  private readonly publicationName: HTMLInputElement;
  private readonly publicationLayersRoot: HTMLElement;
  private readonly publicationSummary: HTMLElement;
  private readonly publicationWarnings: HTMLElement;
  private readonly publicationStatistics: HTMLElement;
  private readonly buildZoneButton: HTMLButtonElement;
  private readonly previewZoneButton: HTMLButtonElement;
  private readonly stopPreviewButton: HTMLButtonElement;
  private readonly exportZoneButton: HTMLButtonElement;
  private readonly previewBanner: HTMLElement;
  private readonly publicationLayerIds = new Set<string>();
  private publicationLayersInitialized = false;
  private defaultPublicationName = '';
  private readonly groupTransformFields = new Map<string, HTMLInputElement>();
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
  private readonly localizedTextNodes: Array<{ key: TranslationKey; node: Text }> = [];
  private readonly localizedAriaLabels: Array<{ element: Element; key: TranslationKey }> = [];
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

    const projectsSection = section(documentRef, t('hudChrome.naturePlacementLab.projectsSection'));
    this.projectSelect = documentRef.createElement('select');
    this.projectSelect.className = 'nature-placement-lab-wide-select';
    this.projectSelect.setAttribute(
      'aria-label',
      t('hudChrome.naturePlacementLab.projectsSection'),
    );
    const projectActions = documentRef.createElement('div');
    projectActions.className = 'nature-placement-lab-actions nature-placement-lab-actions-3';
    const newProject = button(documentRef, t('hudChrome.naturePlacementLab.newProject'));
    const renameProject = button(documentRef, t('hudChrome.naturePlacementLab.renameProject'));
    const saveProject = button(documentRef, t('hudChrome.naturePlacementLab.saveProject'));
    const saveProjectAs = button(documentRef, t('hudChrome.naturePlacementLab.saveProjectAs'));
    const loadProject = button(documentRef, t('hudChrome.naturePlacementLab.loadProject'));
    const deleteProject = button(documentRef, t('hudChrome.naturePlacementLab.deleteProject'));
    projectActions.append(
      newProject,
      renameProject,
      saveProject,
      saveProjectAs,
      loadProject,
      deleteProject,
    );
    projectsSection.append(this.projectSelect, projectActions);
    this.body.appendChild(projectsSection);

    const assetsSection = section(documentRef, t('hudChrome.naturePlacementLab.assetsSection'));
    this.assets = documentRef.createElement('div');
    this.assets.className = 'nature-placement-lab-assets';
    this.assets.setAttribute('aria-label', t('hudChrome.naturePlacementLab.assetsAria'));
    assetsSection.appendChild(this.assets);
    this.body.appendChild(assetsSection);

    const layersSection = section(documentRef, t('hudChrome.naturePlacementLab.layersSection'));
    this.layersRoot = documentRef.createElement('div');
    this.layersRoot.className = 'nature-placement-lab-list';
    const createLayer = button(documentRef, t('hudChrome.naturePlacementLab.createLayer'));
    layersSection.append(this.layersRoot, createLayer);
    this.body.appendChild(layersSection);

    const selectionSection = section(
      documentRef,
      t('hudChrome.naturePlacementLab.selectionSection'),
    );
    this.selection = documentRef.createElement('p');
    this.selection.className = 'nature-placement-lab-selection';
    this.selectionAssets = documentRef.createElement('p');
    this.selectionAssets.className = 'nature-placement-lab-selection';
    this.selectionLayers = documentRef.createElement('p');
    this.selectionLayers.className = 'nature-placement-lab-selection';
    const selectionActions = documentRef.createElement('div');
    selectionActions.className = 'nature-placement-lab-actions nature-placement-lab-actions-3';
    this.placeButton = button(documentRef, t('hudChrome.naturePlacementLab.placeSelected'));
    const duplicateButton = button(documentRef, t('hudChrome.naturePlacementLab.duplicate'));
    const selectAll = button(documentRef, t('hudChrome.naturePlacementLab.selectAll'));
    const deselectAll = button(documentRef, t('hudChrome.naturePlacementLab.deselectAll'));
    const invertSelection = button(documentRef, t('hudChrome.naturePlacementLab.invertSelection'));
    const ungroup = button(documentRef, t('hudChrome.naturePlacementLab.ungroup'));
    selectionActions.append(
      this.placeButton,
      duplicateButton,
      selectAll,
      deselectAll,
      invertSelection,
      ungroup,
    );
    const selectionFilters = documentRef.createElement('div');
    selectionFilters.className = 'nature-placement-lab-inline';
    this.assetSelection = documentRef.createElement('select');
    this.assetSelection.setAttribute('aria-label', t('hudChrome.naturePlacementLab.selectByAsset'));
    const selectByAsset = button(documentRef, t('hudChrome.naturePlacementLab.selectByAsset'));
    this.layerTarget = documentRef.createElement('select');
    this.layerTarget.setAttribute('aria-label', t('hudChrome.naturePlacementLab.moveToLayer'));
    const moveToLayer = button(documentRef, t('hudChrome.naturePlacementLab.moveToLayer'));
    selectionFilters.append(this.assetSelection, selectByAsset, this.layerTarget, moveToLayer);
    selectionSection.append(
      this.selection,
      this.selectionAssets,
      this.selectionLayers,
      selectionActions,
      selectionFilters,
    );
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

    const groupTransformSection = section(
      documentRef,
      t('hudChrome.naturePlacementLab.applyGroupTransform'),
    );
    const groupTransformGrid = documentRef.createElement('div');
    groupTransformGrid.className = 'nature-placement-lab-controls';
    const groupFields = [
      ['moveX', 'hudChrome.naturePlacementLab.selectionCenterX'],
      ['moveY', 'hudChrome.naturePlacementLab.selectionCenterY'],
      ['moveZ', 'hudChrome.naturePlacementLab.selectionCenterZ'],
      ['rotationDegrees', 'hudChrome.naturePlacementLab.rotationDelta'],
      ['scaleFactor', 'hudChrome.naturePlacementLab.scaleFactor'],
      ['groundOffsetDelta', 'hudChrome.naturePlacementLab.groundOffsetDelta'],
    ] as const;
    for (const [field, key] of groupFields) {
      const label = documentRef.createElement('label');
      label.textContent = t(key);
      const input = documentRef.createElement('input');
      input.type = 'number';
      input.step = 'any';
      input.autocomplete = 'off';
      this.groupTransformFields.set(field, input);
      label.appendChild(input);
      groupTransformGrid.appendChild(label);
    }
    const applyGroupTransform = button(
      documentRef,
      t('hudChrome.naturePlacementLab.applyGroupTransform'),
    );
    groupTransformSection.append(groupTransformGrid, applyGroupTransform);
    this.body.appendChild(groupTransformSection);

    const groupsSection = section(documentRef, t('hudChrome.naturePlacementLab.groupsSection'));
    this.groupsRoot = documentRef.createElement('div');
    this.groupsRoot.className = 'nature-placement-lab-list';
    const groupSelection = button(documentRef, t('hudChrome.naturePlacementLab.groupSelection'));
    groupsSection.append(this.groupsRoot, groupSelection);
    this.body.appendChild(groupsSection);

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

    this.publicationSection = documentRef.createElement('details');
    this.publicationSection.className =
      'nature-placement-lab-section nature-placement-lab-publication';
    const publicationTitle = documentRef.createElement('summary');
    publicationTitle.textContent = t('hudChrome.naturePlacementLab.publicationPreviewSection');
    this.publicationSection.appendChild(publicationTitle);
    const publicationControls = documentRef.createElement('div');
    publicationControls.className = 'nature-placement-lab-controls';
    const zoneIdLabel = documentRef.createElement('label');
    const zoneIdText = documentRef.createElement('span');
    zoneIdText.textContent = t('hudChrome.naturePlacementLab.zoneId');
    this.publicationZoneId = documentRef.createElement('input');
    this.publicationZoneId.type = 'text';
    this.publicationZoneId.value = 'laboratory-nature-zone';
    this.publicationZoneId.autocomplete = 'off';
    zoneIdLabel.append(zoneIdText, this.publicationZoneId);
    const nameLabel = documentRef.createElement('label');
    const nameText = documentRef.createElement('span');
    nameText.textContent = t('hudChrome.naturePlacementLab.visibleName');
    this.publicationName = documentRef.createElement('input');
    this.publicationName.type = 'text';
    this.defaultPublicationName = t('hudChrome.naturePlacementLab.defaultZoneName');
    this.publicationName.value = this.defaultPublicationName;
    this.publicationName.autocomplete = 'off';
    nameLabel.append(nameText, this.publicationName);
    publicationControls.append(zoneIdLabel, nameLabel);
    const layerHeading = documentRef.createElement('p');
    layerHeading.className = 'nature-placement-lab-publication-heading';
    layerHeading.textContent = t('hudChrome.naturePlacementLab.layersToPublish');
    this.publicationLayersRoot = documentRef.createElement('div');
    this.publicationLayersRoot.className = 'nature-placement-lab-list';
    const publicationActions = documentRef.createElement('div');
    publicationActions.className = 'nature-placement-lab-actions';
    this.buildZoneButton = button(
      documentRef,
      t('hudChrome.naturePlacementLab.buildZonePackage'),
    );
    this.previewZoneButton = button(
      documentRef,
      t('hudChrome.naturePlacementLab.previewCompiledZone'),
    );
    this.stopPreviewButton = button(documentRef, t('hudChrome.naturePlacementLab.stopPreview'));
    this.exportZoneButton = button(
      documentRef,
      t('hudChrome.naturePlacementLab.exportZonePackage'),
    );
    publicationActions.append(
      this.buildZoneButton,
      this.previewZoneButton,
      this.stopPreviewButton,
      this.exportZoneButton,
    );
    this.publicationSummary = documentRef.createElement('div');
    this.publicationSummary.className = 'nature-placement-lab-statistics';
    this.publicationWarnings = documentRef.createElement('div');
    this.publicationWarnings.className = 'nature-placement-lab-publication-warnings';
    this.publicationStatistics = documentRef.createElement('div');
    this.publicationStatistics.className = 'nature-placement-lab-statistics';
    this.publicationSection.append(
      publicationControls,
      layerHeading,
      this.publicationLayersRoot,
      publicationActions,
      this.publicationSummary,
      this.publicationWarnings,
      this.publicationStatistics,
    );
    this.body.appendChild(this.publicationSection);

    this.previewBanner = documentRef.createElement('p');
    this.previewBanner.className = 'nature-placement-lab-preview-banner';
    this.previewBanner.textContent = t('hudChrome.naturePlacementLab.publishedZonePreview');
    this.previewBanner.hidden = true;

    this.count = documentRef.createElement('p');
    this.count.className = 'nature-placement-lab-count';
    this.status = documentRef.createElement('p');
    this.status.className = 'nature-placement-lab-status';
    this.status.setAttribute('aria-live', 'polite');
    const help = documentRef.createElement('p');
    help.className = 'nature-placement-lab-help';
    help.textContent = t('hudChrome.naturePlacementLab.help');
    this.body.append(this.previewBanner, this.count, help, this.status);

    const statisticsSection = section(
      documentRef,
      t('hudChrome.naturePlacementLab.statisticsSection'),
    );
    this.statisticsRoot = documentRef.createElement('div');
    this.statisticsRoot.className = 'nature-placement-lab-statistics';
    statisticsSection.appendChild(this.statisticsRoot);
    this.body.insertBefore(statisticsSection, this.count);

    this.fileInput = documentRef.createElement('input');
    this.fileInput.type = 'file';
    this.fileInput.accept = 'application/json,.json';
    this.fileInput.hidden = true;
    this.root.append(this.body, this.fileInput);
    mount.appendChild(this.root);

    this.toggle.addEventListener('click', () => this.setOpen(!this.open), { signal });
    newProject.addEventListener(
      'click',
      () => {
        const name = this.prompt(t('hudChrome.naturePlacementLab.projectNamePrompt'));
        if (name) this.callbacks.newProject(name);
      },
      { signal },
    );
    renameProject.addEventListener(
      'click',
      () => {
        const name = this.prompt(
          t('hudChrome.naturePlacementLab.projectNamePrompt'),
          this.view?.project.name,
        );
        if (name) this.callbacks.renameProject(name);
      },
      { signal },
    );
    saveProject.addEventListener('click', () => this.callbacks.saveProject(), { signal });
    saveProjectAs.addEventListener(
      'click',
      () => {
        const name = this.prompt(
          t('hudChrome.naturePlacementLab.projectNamePrompt'),
          this.view?.project.name,
        );
        if (name) this.callbacks.saveProjectAs(name);
      },
      { signal },
    );
    loadProject.addEventListener(
      'click',
      () => this.callbacks.loadProject(this.projectSelect.value),
      { signal },
    );
    deleteProject.addEventListener(
      'click',
      () => {
        if (this.confirm(t('hudChrome.naturePlacementLab.confirmDeleteProject'))) {
          this.callbacks.deleteProject();
        }
      },
      { signal },
    );
    createLayer.addEventListener(
      'click',
      () => {
        const name = this.prompt(t('hudChrome.naturePlacementLab.layerNamePrompt'));
        if (name) this.callbacks.createLayer(name);
      },
      { signal },
    );
    this.placeButton.addEventListener(
      'click',
      () =>
        this.view?.placing ? this.callbacks.cancelPlacement() : this.callbacks.startPlacement(),
      { signal },
    );
    duplicateButton.addEventListener('click', () => this.callbacks.duplicateSelected(), { signal });
    selectAll.addEventListener('click', () => this.callbacks.selectAll(), { signal });
    deselectAll.addEventListener('click', () => this.callbacks.deselectAll(), { signal });
    invertSelection.addEventListener('click', () => this.callbacks.invertSelection(), { signal });
    ungroup.addEventListener('click', () => this.callbacks.ungroupSelection(), { signal });
    selectByAsset.addEventListener(
      'click',
      () =>
        this.callbacks.selectAssetPlacements(this.assetSelection.value as NaturePlacementAssetId),
      { signal },
    );
    moveToLayer.addEventListener(
      'click',
      () => this.callbacks.moveSelectionToLayer(this.layerTarget.value),
      { signal },
    );
    applyGroupTransform.addEventListener(
      'click',
      () =>
        this.callbacks.applyGroupTransform({
          moveX: this.groupTransformFields.get('moveX')?.value ?? '',
          moveY: this.groupTransformFields.get('moveY')?.value ?? '',
          moveZ: this.groupTransformFields.get('moveZ')?.value ?? '',
          rotationDegrees: this.groupTransformFields.get('rotationDegrees')?.value ?? '',
          scaleFactor: this.groupTransformFields.get('scaleFactor')?.value ?? '',
          groundOffsetDelta: this.groupTransformFields.get('groundOffsetDelta')?.value ?? '',
        }),
      { signal },
    );
    groupSelection.addEventListener(
      'click',
      () => {
        const name = this.prompt(t('hudChrome.naturePlacementLab.groupNamePrompt'));
        if (name) this.callbacks.groupSelection(name);
      },
      { signal },
    );
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
      () => downloadJson(this.documentRef, this.callbacks.exportJson(), 'nature-placement-lab.json'),
      { signal },
    );
    importButton.addEventListener('click', () => this.fileInput.click(), { signal });
    this.fileInput.addEventListener('change', () => this.importSelectedFile(), { signal });
    this.buildZoneButton.addEventListener(
      'click',
      () =>
        this.callbacks.buildZonePackage({
          zoneId: this.publicationZoneId.value,
          name: this.publicationName.value,
          includedLayerIds: [...this.publicationLayerIds],
        }),
      { signal },
    );
    this.previewZoneButton.addEventListener(
      'click',
      () => this.callbacks.previewCompiledZone(),
      { signal },
    );
    this.stopPreviewButton.addEventListener('click', () => this.callbacks.stopPreview(), {
      signal,
    });
    this.exportZoneButton.addEventListener(
      'click',
      () => {
        const exported = this.callbacks.exportZonePackage();
        if (exported) downloadJson(this.documentRef, exported.source, exported.fileName);
      },
      { signal },
    );
    for (const eventName of ['mousedown', 'mouseup', 'contextmenu', 'keydown'] as const) {
      this.root.addEventListener(eventName, (event) => event.stopPropagation(), { signal });
    }
    this.bindLocalizedChrome();
    documentRef.addEventListener(
      'woc:languagechange',
      () => {
        this.relocalizeChrome();
        this.callbacks.languageChanged();
      },
      { signal },
    );
  }

  update(view: NaturePlacementUiView): void {
    this.view = view;
    const projectOptions = view.projects.map((project) => {
      const option = this.documentRef.createElement('option');
      option.value = project.projectId;
      option.textContent = projectDisplayName(project.name);
      return option;
    });
    this.projectSelect.replaceChildren(...projectOptions);
    this.projectSelect.value = view.project.projectId;

    const assetSelectionValue = this.assetSelection.value;
    this.assetSelection.replaceChildren();
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
      const option = this.documentRef.createElement('option');
      option.value = assetId;
      option.textContent = assetId;
      this.assetSelection.appendChild(option);
    }
    if (view.assetIds.includes(assetSelectionValue as NaturePlacementAssetId)) {
      this.assetSelection.value = assetSelectionValue;
    }
    const selectedAssetIds = [
      ...new Set(view.selectedPlacements.map((placement) => placement.assetId)),
    ];
    const layerNames = new Map(
      view.layers.map((layer) => [
        layer.layerId,
        naturePlacementLayerDisplayName(layer.layerId, layer.name),
      ]),
    );
    const selectedLayerNames = [
      ...new Set(
        view.selectedPlacements.map(
          (placement) => layerNames.get(placement.layerId) ?? placement.layerId,
        ),
      ),
    ];
    this.selection.textContent = t('hudChrome.naturePlacementLab.selectedCount', {
      count: formatNumber(view.selectedPlacements.length),
    });
    this.selectionAssets.textContent = t('hudChrome.naturePlacementLab.selectedAssets', {
      assets: selectedAssetIds.join(', ') || '-',
    });
    this.selectionLayers.textContent = t('hudChrome.naturePlacementLab.selectedLayers', {
      layers: selectedLayerNames.join(', ') || '-',
    });
    this.placeButton.textContent = view.placing
      ? t('hudChrome.naturePlacementLab.cancelPlacement')
      : t('hudChrome.naturePlacementLab.placeSelected');
    this.placeButton.disabled = view.selectedAssetId === null;
    this.inspector.update(view.selectedPlacement, this.documentRef.activeElement);

    const center =
      view.selectedPlacements.length > 0
        ? {
            x:
              view.selectedPlacements.reduce((sum, placement) => sum + placement.position.x, 0) /
              view.selectedPlacements.length,
            y:
              view.selectedPlacements.reduce((sum, placement) => sum + placement.position.y, 0) /
              view.selectedPlacements.length,
            z:
              view.selectedPlacements.reduce((sum, placement) => sum + placement.position.z, 0) /
              view.selectedPlacements.length,
          }
        : null;
    const activeGroupField = [...this.groupTransformFields.values()].includes(
      this.documentRef.activeElement as HTMLInputElement,
    );
    if (!activeGroupField) {
      const defaults: Record<string, string> = {
        moveX: center ? String(center.x) : '',
        moveY: center ? String(center.y) : '',
        moveZ: center ? String(center.z) : '',
        rotationDegrees: '0',
        scaleFactor: '1',
        groundOffsetDelta: '0',
      };
      for (const [field, input] of this.groupTransformFields) input.value = defaults[field] ?? '';
    }

    this.renderLayers(view);
    this.renderGroups(view);
    this.renderStatistics(view);
    this.renderPublication(view);

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
    this.previewBanner.hidden = !view.previewActive;
    if (view.previewActive) this.publicationSection.open = true;
    for (const control of this.body.querySelectorAll<
      HTMLButtonElement | HTMLInputElement | HTMLSelectElement
    >('button, input, select')) {
      if (!this.publicationSection.contains(control)) control.disabled = view.previewActive;
    }
    this.publicationZoneId.disabled = view.previewActive;
    this.publicationName.disabled = view.previewActive;
    for (const input of this.publicationLayersRoot.querySelectorAll<HTMLInputElement>('input')) {
      input.disabled = view.previewActive;
    }
    this.buildZoneButton.disabled = view.previewActive;
    this.previewZoneButton.disabled = view.previewActive || view.compiledZonePackage === null;
    this.stopPreviewButton.disabled = !view.previewActive;
    this.exportZoneButton.disabled = view.compiledZonePackage === null;
  }

  dispose(): void {
    this.disposed = true;
    this.layersAbort?.abort();
    this.groupsAbort?.abort();
    this.publicationLayersAbort?.abort();
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

  private renderLayers(view: NaturePlacementUiView): void {
    this.layersAbort?.abort();
    this.layersAbort = new AbortController();
    const signal = this.layersAbort.signal;
    const targetValue = this.layerTarget.value;
    this.layerTarget.replaceChildren();
    const rows = view.layers.map((layer) => {
      const option = this.documentRef.createElement('option');
      option.value = layer.layerId;
      option.textContent = layer.name;
      this.layerTarget.appendChild(option);

      const row = this.documentRef.createElement('div');
      row.className = 'nature-placement-lab-list-row';
      const name = this.documentRef.createElement('strong');
      name.textContent = layer.name;
      const visible = checkbox(
        this.documentRef,
        t('hudChrome.naturePlacementLab.visible'),
        (checked) => this.callbacks.setLayerVisible(layer.layerId, checked),
        signal,
      );
      visible.input.checked = layer.visible;
      const locked = checkbox(
        this.documentRef,
        t('hudChrome.naturePlacementLab.locked'),
        (checked) => this.callbacks.setLayerLocked(layer.layerId, checked),
        signal,
      );
      locked.input.checked = layer.locked;
      const actions = this.documentRef.createElement('div');
      actions.className = 'nature-placement-lab-actions nature-placement-lab-actions-3';
      const select = button(this.documentRef, t('hudChrome.naturePlacementLab.selectLayer'));
      const rename = button(this.documentRef, t('hudChrome.naturePlacementLab.renameLayer'));
      const remove = button(this.documentRef, t('hudChrome.naturePlacementLab.deleteLayer'));
      const clear = button(
        this.documentRef,
        t('hudChrome.naturePlacementLab.deleteLayerPlacements'),
      );
      select.disabled = layer.locked || !layer.visible;
      select.addEventListener('click', () => this.callbacks.selectLayer(layer.layerId), {
        signal,
      });
      rename.addEventListener(
        'click',
        () => {
          const value = this.prompt(t('hudChrome.naturePlacementLab.layerNamePrompt'), layer.name);
          if (value) this.callbacks.renameLayer(layer.layerId, value);
        },
        { signal },
      );
      remove.addEventListener(
        'click',
        () => {
          if (this.confirm(t('hudChrome.naturePlacementLab.confirmDeleteLayer'))) {
            this.callbacks.deleteLayer(layer.layerId);
          }
        },
        { signal },
      );
      clear.addEventListener(
        'click',
        () => {
          if (this.confirm(t('hudChrome.naturePlacementLab.confirmDeleteLayerPlacements'))) {
            this.callbacks.deleteLayerPlacements(layer.layerId);
          }
        },
        { signal },
      );
      actions.append(select, rename, remove, clear);
      row.append(name, visible.label, locked.label, actions);
      return row;
    });
    this.layersRoot.replaceChildren(...rows);
    if (view.layers.some((layer) => layer.layerId === targetValue))
      this.layerTarget.value = targetValue;
  }

  private renderGroups(view: NaturePlacementUiView): void {
    this.groupsAbort?.abort();
    this.groupsAbort = new AbortController();
    const signal = this.groupsAbort.signal;
    const rows = view.groups.map((group) => {
      const row = this.documentRef.createElement('div');
      row.className = 'nature-placement-lab-list-row';
      const name = this.documentRef.createElement('strong');
      name.textContent = t('hudChrome.naturePlacementLab.groupSummary', {
        name: group.name,
        count: formatNumber(group.placementIds.length),
      });
      const actions = this.documentRef.createElement('div');
      actions.className = 'nature-placement-lab-actions nature-placement-lab-actions-3';
      const select = button(this.documentRef, t('hudChrome.naturePlacementLab.selectGroup'));
      const rename = button(this.documentRef, t('hudChrome.naturePlacementLab.renameGroup'));
      const duplicate = button(this.documentRef, t('hudChrome.naturePlacementLab.duplicateGroup'));
      const remove = button(this.documentRef, t('hudChrome.naturePlacementLab.deleteGroup'));
      const removeAll = button(
        this.documentRef,
        t('hudChrome.naturePlacementLab.deleteGroupAndPlacements'),
      );
      select.addEventListener('click', () => this.callbacks.selectGroup(group.groupId), {
        signal,
      });
      rename.addEventListener(
        'click',
        () => {
          const value = this.prompt(t('hudChrome.naturePlacementLab.groupNamePrompt'), group.name);
          if (value) this.callbacks.renameGroup(group.groupId, value);
        },
        { signal },
      );
      duplicate.addEventListener('click', () => this.callbacks.duplicateGroup(group.groupId), {
        signal,
      });
      remove.addEventListener('click', () => this.callbacks.deleteGroup(group.groupId), {
        signal,
      });
      removeAll.addEventListener(
        'click',
        () => {
          if (this.confirm(t('hudChrome.naturePlacementLab.confirmDeleteGroupPlacements'))) {
            this.callbacks.deleteGroupAndPlacements(group.groupId);
          }
        },
        { signal },
      );
      actions.append(select, rename, duplicate, remove, removeAll);
      row.append(name, actions);
      return row;
    });
    this.groupsRoot.replaceChildren(...rows);
  }

  private renderStatistics(view: NaturePlacementUiView): void {
    const statistics = view.statistics;
    const lines = [
      t('hudChrome.naturePlacementLab.totalPlacements', {
        count: formatNumber(statistics.totalPlacements),
      }),
      t('hudChrome.naturePlacementLab.visiblePlacements', {
        count: formatNumber(statistics.visiblePlacements),
      }),
      t('hudChrome.naturePlacementLab.statisticsSelected', {
        count: formatNumber(statistics.selectedPlacements),
      }),
      t('hudChrome.naturePlacementLab.placementsByAsset', {
        counts:
          statistics.byAsset
            .map((entry) => `${entry.assetId}: ${formatNumber(entry.count)}`)
            .join(', ') || '-',
      }),
      t('hudChrome.naturePlacementLab.placementsByLayer', {
        counts:
          statistics.byLayer
            .map((entry) => `${entry.name}: ${formatNumber(entry.count)}`)
            .join(', ') || '-',
      }),
      t('hudChrome.naturePlacementLab.estimatedTriangles', {
        count: formatNumber(statistics.estimatedTriangles),
      }),
      t('hudChrome.naturePlacementLab.estimatedMediaBytes', {
        count: formatNumber(statistics.estimatedUniqueAssetMediaBytes),
      }),
    ];
    this.statisticsRoot.replaceChildren(
      ...lines.map((line) => {
        const paragraph = this.documentRef.createElement('p');
        paragraph.textContent = line;
        return paragraph;
      }),
    );
  }

  private renderPublication(view: NaturePlacementUiView): void {
    this.publicationLayersAbort?.abort();
    this.publicationLayersAbort = new AbortController();
    const signal = this.publicationLayersAbort.signal;
    const knownLayerIds = new Set(view.layers.map((layer) => layer.layerId));
    for (const layerId of [...this.publicationLayerIds]) {
      if (!knownLayerIds.has(layerId)) this.publicationLayerIds.delete(layerId);
    }
    if (!this.publicationLayersInitialized) {
      for (const layer of view.layers) {
        if (layer.visible) this.publicationLayerIds.add(layer.layerId);
      }
      this.publicationLayersInitialized = true;
    }
    const layerRows = view.layers.map((layer) => {
      const selected = checkbox(
        this.documentRef,
        naturePlacementLayerDisplayName(layer.layerId, layer.name),
        (checked) => {
          if (checked) this.publicationLayerIds.add(layer.layerId);
          else this.publicationLayerIds.delete(layer.layerId);
        },
        signal,
      );
      selected.input.checked = this.publicationLayerIds.has(layer.layerId);
      return selected.label;
    });
    this.publicationLayersRoot.replaceChildren(...layerRows);

    const zonePackage = view.compiledZonePackage;
    const summaryLines = zonePackage
      ? [
          t('hudChrome.naturePlacementLab.packageSummary', {
            name: zonePackage.name,
            zoneId: zonePackage.zoneId,
          }),
          t('hudChrome.naturePlacementLab.packageSource', {
            projectId: zonePackage.sourceProjectId,
            version: formatNumber(zonePackage.sourceProjectVersion),
          }),
          t('hudChrome.naturePlacementLab.packageLayers', {
            layers: zonePackage.includedLayerIds
              .map(
                (layerId) =>
                  naturePlacementLayerDisplayName(
                    layerId,
                    view.layers.find((layer) => layer.layerId === layerId)?.name ?? layerId,
                  ),
              )
              .join(', '),
          }),
        ]
      : [t('hudChrome.naturePlacementLab.noCompiledPackage')];
    this.publicationSummary.replaceChildren(
      ...summaryLines.map((line) => {
        const paragraph = this.documentRef.createElement('p');
        paragraph.textContent = line;
        return paragraph;
      }),
    );

    const warningLines =
      view.publicationWarnings.length > 0
        ? view.publicationWarnings
        : [t('hudChrome.naturePlacementLab.noPublicationWarnings')];
    this.publicationWarnings.replaceChildren(
      ...warningLines.map((line) => {
        const paragraph = this.documentRef.createElement('p');
        paragraph.textContent = line;
        return paragraph;
      }),
    );

    const statisticsLines = zonePackage
      ? [
          t('hudChrome.naturePlacementLab.packagePlacementCount', {
            count: formatNumber(zonePackage.statistics.placementCount),
          }),
          t('hudChrome.naturePlacementLab.packageEstimatedTriangles', {
            count: formatNumber(zonePackage.statistics.estimatedTriangles),
          }),
          t('hudChrome.naturePlacementLab.packageUniqueMediaBytes', {
            count: formatNumber(zonePackage.statistics.uniqueMediaBytes),
          }),
          t('hudChrome.naturePlacementLab.packageBounds', {
            maxX: formatNumber(zonePackage.bounds.maxX),
            maxY: formatNumber(zonePackage.bounds.maxY),
            maxZ: formatNumber(zonePackage.bounds.maxZ),
            minX: formatNumber(zonePackage.bounds.minX),
            minY: formatNumber(zonePackage.bounds.minY),
            minZ: formatNumber(zonePackage.bounds.minZ),
          }),
          t('hudChrome.naturePlacementLab.packageAssets', {
            assets: zonePackage.assetSummary
              .map((entry) => `${entry.assetId}: ${formatNumber(entry.placementCount)}`)
              .join(', '),
          }),
        ]
      : [];
    this.publicationStatistics.replaceChildren(
      ...statisticsLines.map((line) => {
        const paragraph = this.documentRef.createElement('p');
        paragraph.textContent = line;
        return paragraph;
      }),
    );
  }

  private prompt(label: string, initialValue = ''): string | null {
    const value = this.documentRef.defaultView?.prompt(label, initialValue) ?? null;
    const normalized = value?.trim() ?? '';
    return normalized.length > 0 ? normalized : null;
  }

  private confirm(message: string): boolean {
    return this.documentRef.defaultView?.confirm(message) ?? false;
  }

  private setOpen(open: boolean): void {
    this.open = open;
    this.body.hidden = !open;
    this.toggle.setAttribute('aria-expanded', String(open));
  }

  private bindLocalizedChrome(): void {
    const elements = [...this.root.querySelectorAll<HTMLElement>('*')];
    for (const key of STATIC_LOCALIZATION_KEYS) {
      const english = t(key);
      for (const element of elements) {
        if (element.textContent === english && element.childNodes.length === 1) {
          const node = element.firstChild;
          if (node?.nodeType === Node.TEXT_NODE) {
            this.localizedTextNodes.push({ key, node: node as Text });
          }
        }
        if (element.getAttribute('aria-label') === english) {
          this.localizedAriaLabels.push({ element, key });
        }
      }
    }
  }

  private relocalizeChrome(): void {
    const previousDefaultName = this.defaultPublicationName;
    this.defaultPublicationName = t('hudChrome.naturePlacementLab.defaultZoneName');
    if (this.publicationName.value === previousDefaultName) {
      this.publicationName.value = this.defaultPublicationName;
    }
    for (const { key, node } of this.localizedTextNodes) node.data = t(key);
    for (const { element, key } of this.localizedAriaLabels) element.setAttribute('aria-label', t(key));
    if (this.view) this.update(this.view);
  }
}
