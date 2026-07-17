import { formatNumber, t } from '../../ui/i18n';
import type { StartZoneTerrainFalloff, StartZoneTerrainPlateauPatch } from '../../sim/start_zone_terrain_plateau';
import type { PlateauUiAdapter, PlateauUiCallbacks, PlateauUiView } from './controller';

function button(documentRef: Document): HTMLButtonElement {
  const element = documentRef.createElement('button');
  element.className = 'btn';
  element.type = 'button';
  return element;
}

function download(documentRef: Document, content: string): void {
  const link = documentRef.createElement('a');
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
  link.href = url;
  link.download = 'starter-zone-plateau.json';
  documentRef.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export class StartZoneTerrainPlateauUi implements PlateauUiAdapter {
  private readonly abort = new AbortController();
  private readonly root: HTMLElement;
  private readonly controls = new Map<keyof StartZoneTerrainPlateauPatch, HTMLInputElement | HTMLSelectElement>();
  private readonly stats: HTMLElement;
  private readonly warning: HTMLElement;
  private readonly protectedZones: HTMLInputElement;
  private readonly undoButton: HTMLButtonElement;
  private readonly redoButton: HTMLButtonElement;
  private readonly importInput: HTMLTextAreaElement;
  private view: PlateauUiView | null = null;

  private open = true;

  constructor(documentRef: Document, private readonly callbacks: PlateauUiCallbacks, mount: HTMLElement, exportPatch: () => string) {
    const signal = this.abort.signal;
    this.root = documentRef.createElement('section');
    this.root.className = 'panel starter-zone-plateau-lab';
    this.root.id = 'starter-zone-plateau-lab';
    const toggle = button(documentRef);
    toggle.className = 'btn nature-placement-lab-toggle';
    toggle.textContent = t('hudChrome.startZoneTerrainPlateau.title');
    toggle.setAttribute('aria-expanded', 'true');
    const body = documentRef.createElement('div');
    body.className = 'nature-placement-lab-body starter-zone-plateau-lab-body';
    toggle.addEventListener('click', () => {
      this.open = !this.open;
      body.hidden = !this.open;
      toggle.setAttribute('aria-expanded', String(this.open));
    }, { signal });
    const controls = documentRef.createElement('div');
    controls.className = 'nature-placement-lab-controls starter-zone-plateau-lab-controls';
    const fields: [keyof StartZoneTerrainPlateauPatch, string, number, number, number][] = [
      ['enabled', 'hudChrome.startZoneTerrainPlateau.enabled', 0, 1, 1],
      ['centerX', 'hudChrome.startZoneTerrainPlateau.centerX', -200, 200, 1],
      ['centerZ', 'hudChrome.startZoneTerrainPlateau.centerZ', -300, 300, 1],
      ['width', 'hudChrome.startZoneTerrainPlateau.width', 1, 300, 1],
      ['depth', 'hudChrome.startZoneTerrainPlateau.depth', 1, 300, 1],
      ['rotationY', 'hudChrome.startZoneTerrainPlateau.rotation', -6.283, 6.283, 0.05],
      ['targetHeight', 'hudChrome.startZoneTerrainPlateau.targetHeight', -100, 100, 0.1],
      ['blendWidth', 'hudChrome.startZoneTerrainPlateau.blendWidth', 1, 120, 1],
    ];
    for (const [field, labelKey, min, max, step] of fields) {
      const label = documentRef.createElement('label');
      label.textContent = t(labelKey as Parameters<typeof t>[0]);
      const input = documentRef.createElement('input');
      input.type = field === 'enabled' ? 'checkbox' : 'number';
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.addEventListener('change', () => this.callbacks.setField(field, field === 'enabled' ? input.checked : Number(input.value)), { signal });
      this.controls.set(field, input);
      label.append(input);
      controls.append(label);
    }
    const falloffLabel = documentRef.createElement('label');
    falloffLabel.textContent = t('hudChrome.startZoneTerrainPlateau.falloff');
    const falloff = documentRef.createElement('select');
    for (const value of ['linear', 'smoothstep', 'smootherstep'] as const) {
      const option = documentRef.createElement('option');
      option.value = value;
      option.textContent = t(`hudChrome.startZoneTerrainPlateau.${value}` as Parameters<typeof t>[0]);
      falloff.append(option);
    }
    falloff.addEventListener('change', () => this.callbacks.setField('falloff', falloff.value as StartZoneTerrainFalloff), { signal });
    this.controls.set('falloff', falloff);
    falloffLabel.append(falloff);
    controls.append(falloffLabel);
    const protectedZonesLabel = documentRef.createElement('label');
    protectedZonesLabel.className = 'nature-placement-lab-check starter-zone-plateau-protected-toggle';
    this.protectedZones = documentRef.createElement('input');
    this.protectedZones.type = 'checkbox';
    const protectedZonesText = documentRef.createElement('span');
    protectedZonesText.textContent = t('hudChrome.startZoneTerrainPlateau.showProtectedZones');
    protectedZonesLabel.append(this.protectedZones, protectedZonesText);
    this.protectedZones.addEventListener('change', () => this.callbacks.setProtectedZonesVisible(this.protectedZones.checked), { signal });
    const protectedHelp = documentRef.createElement('p');
    protectedHelp.className = 'nature-placement-lab-help';
    protectedHelp.textContent = t('hudChrome.startZoneTerrainPlateau.protectedZonesHelp');
    const actions = documentRef.createElement('div');
    actions.className = 'nature-placement-lab-actions';
    const average = button(documentRef);
    average.textContent = t('hudChrome.startZoneTerrainPlateau.averageHeight');
    average.addEventListener('click', () => this.callbacks.setHeightAverage(), { signal });
    const cursor = button(documentRef);
    cursor.textContent = t('hudChrome.startZoneTerrainPlateau.cursorHeight');
    cursor.addEventListener('click', () => this.callbacks.setHeightCursor(), { signal });
    this.undoButton = button(documentRef);
    this.undoButton.textContent = t('hudChrome.startZoneTerrainPlateau.undo');
    this.undoButton.addEventListener('click', () => this.callbacks.undo(), { signal });
    this.redoButton = button(documentRef);
    this.redoButton.textContent = t('hudChrome.startZoneTerrainPlateau.redo');
    this.redoButton.addEventListener('click', () => this.callbacks.redo(), { signal });
    const reset = button(documentRef);
    reset.textContent = t('hudChrome.startZoneTerrainPlateau.reset');
    reset.addEventListener('click', () => this.callbacks.reset(), { signal });
    const exportButton = button(documentRef);
    exportButton.textContent = t('hudChrome.startZoneTerrainPlateau.export');
    exportButton.addEventListener('click', () => download(documentRef, exportPatch()), { signal });
    actions.append(average, cursor, this.undoButton, this.redoButton, reset, exportButton);
    const importSection = documentRef.createElement('div');
    importSection.className = 'starter-zone-plateau-import';
    this.importInput = documentRef.createElement('textarea');
    this.importInput.placeholder = t('hudChrome.startZoneTerrainPlateau.importPlaceholder');
    const importButton = button(documentRef);
    importButton.textContent = t('hudChrome.startZoneTerrainPlateau.import');
    importButton.addEventListener('click', () => { this.importInput.dataset.valid = String(this.callbacks.importPatch(this.importInput.value)); }, { signal });
    this.stats = documentRef.createElement('div');
    this.warning = documentRef.createElement('p');
    this.warning.setAttribute('aria-live', 'polite');
    importSection.append(this.importInput, importButton);
    this.stats.className = 'nature-placement-lab-statistics';
    body.append(controls, protectedZonesLabel, protectedHelp, actions, importSection, this.stats, this.warning);
    this.root.append(toggle, body);
    mount.append(this.root);
  }

  update(view: PlateauUiView): void {
    this.view = view;
    for (const [field, control] of this.controls) {
      const value = view.patch[field];
      if (control instanceof HTMLInputElement && control.type === 'checkbox') control.checked = Boolean(value);
      else control.value = String(value);
    }
    this.undoButton.disabled = !view.canUndo;
    this.redoButton.disabled = !view.canRedo;
    this.protectedZones.checked = view.protectedZonesVisible;
    const statistics = view.statistics;
    const rows = [
      ['target', statistics.targetHeight], ['minimum', statistics.minimumOriginalHeight], ['maximum', statistics.maximumOriginalHeight], ['raised', statistics.maximumRaised], ['lowered', statistics.maximumLowered], ['flatArea', statistics.flatArea], ['transitionArea', statistics.transitionArea],
    ].map(([key, value]) => t(`hudChrome.startZoneTerrainPlateau.${key}` as Parameters<typeof t>[0], { value: formatNumber(value as number, { maximumFractionDigits: 2 }) }));
    this.stats.replaceChildren(...rows.map((text) => Object.assign(this.stats.ownerDocument.createElement('p'), { textContent: text })));
    this.warning.textContent = statistics.protectedZones.length > 0 ? t('hudChrome.startZoneTerrainPlateau.protectedWarning', { count: formatNumber(statistics.protectedZones.length) }) : '';
  }

  dispose(): void {
    this.abort.abort();
    this.root.remove();
  }
}
