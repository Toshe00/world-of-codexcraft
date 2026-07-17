import { formatNumber, t } from '../../ui/i18n';
import {
  FOOTPRINT_TEMPLATES,
  TERRAIN_ANCHOR_TYPES,
  TERRAIN_SURVEY_RESOLUTIONS,
  type FootprintCornerName,
  type FootprintTemplateId,
  type TerrainAnchorType,
  type TerrainSurveyResolution,
} from './terrain_survey_core';
import type {
  TerrainSurveyUiAdapter,
  TerrainSurveyUiCallbacks,
  TerrainSurveyUiView,
} from './terrain_survey_controller';

const TEMPLATE_KEYS: Record<FootprintTemplateId, Parameters<typeof t>[0]> = {
  'small-house': 'hudChrome.startZoneTerrainSurvey.smallHouse',
  'medium-house': 'hudChrome.startZoneTerrainSurvey.mediumHouse',
  'large-house': 'hudChrome.startZoneTerrainSurvey.largeHouse',
  'central-plaza': 'hudChrome.startZoneTerrainSurvey.centralPlaza',
  road: 'hudChrome.startZoneTerrainSurvey.road',
};

const TYPE_KEYS: Record<TerrainAnchorType, Parameters<typeof t>[0]> = {
  'building-small': 'hudChrome.startZoneTerrainSurvey.typeBuildingSmall',
  'building-medium': 'hudChrome.startZoneTerrainSurvey.typeBuildingMedium',
  'building-large': 'hudChrome.startZoneTerrainSurvey.typeBuildingLarge',
  plaza: 'hudChrome.startZoneTerrainSurvey.typePlaza',
  road: 'hudChrome.startZoneTerrainSurvey.typeRoad',
  decorative: 'hudChrome.startZoneTerrainSurvey.typeDecorative',
  avoid: 'hudChrome.startZoneTerrainSurvey.typeAvoid',
};

const CORNER_LABELS: Record<FootprintCornerName, string> = {
  'north-west': 'NW',
  'north-east': 'NE',
  'south-east': 'SE',
  'south-west': 'SW',
};

function button(documentRef: Document): HTMLButtonElement {
  const element = documentRef.createElement('button');
  element.type = 'button';
  element.className = 'btn';
  return element;
}

function section(documentRef: Document): { root: HTMLElement; heading: HTMLHeadingElement } {
  const root = documentRef.createElement('section');
  root.className = 'nature-placement-lab-section';
  const heading = documentRef.createElement('h3');
  root.appendChild(heading);
  return { root, heading };
}

function labeledControl(
  documentRef: Document,
  control: HTMLElement,
): { label: HTMLLabelElement; text: HTMLSpanElement } {
  const label = documentRef.createElement('label');
  const text = documentRef.createElement('span');
  label.append(text, control);
  return { label, text };
}

function downloadJson(documentRef: Document, json: string): void {
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const link = documentRef.createElement('a');
  link.href = url;
  link.download = 'start-zone-terrain-survey.json';
  documentRef.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export class TerrainSurveyUi implements TerrainSurveyUiAdapter {
  private readonly abort = new AbortController();
  private readonly root: HTMLElement;
  private readonly toggle: HTMLButtonElement;
  private readonly body: HTMLElement;
  private readonly terrainHeading: HTMLHeadingElement;
  private readonly footprintHeading: HTMLHeadingElement;
  private readonly anchorHeading: HTMLHeadingElement;
  private readonly resolution: HTMLSelectElement;
  private readonly resolutionText: HTMLSpanElement;
  private readonly gridButton: HTMLButtonElement;
  private readonly template: HTMLSelectElement;
  private readonly templateText: HTMLSpanElement;
  private readonly rotation: HTMLInputElement;
  private readonly rotationText: HTMLSpanElement;
  private readonly rotationValue: HTMLOutputElement;
  private readonly statistics: HTMLElement;
  private readonly verdict: HTMLElement;
  private readonly corners: HTMLElement;
  private readonly anchorName: HTMLInputElement;
  private readonly anchorNameText: HTMLSpanElement;
  private readonly anchorType: HTMLSelectElement;
  private readonly anchorTypeText: HTMLSpanElement;
  private readonly notes: HTMLTextAreaElement;
  private readonly notesText: HTMLSpanElement;
  private readonly saveButton: HTMLButtonElement;
  private readonly clearButton: HTMLButtonElement;
  private readonly exportButton: HTMLButtonElement;
  private readonly status: HTMLElement;
  private view: TerrainSurveyUiView | null = null;
  private open = true;

  constructor(
    private readonly documentRef: Document,
    private readonly callbacks: TerrainSurveyUiCallbacks,
    mount: HTMLElement,
  ) {
    const signal = this.abort.signal;
    this.root = documentRef.createElement('section');
    this.root.id = 'starter-zone-terrain-survey';
    this.root.className = 'panel';

    this.toggle = button(documentRef);
    this.toggle.className = 'btn nature-placement-lab-toggle';
    this.toggle.setAttribute('aria-expanded', 'true');
    this.root.appendChild(this.toggle);

    this.body = documentRef.createElement('div');
    this.body.className = 'nature-placement-lab-body';

    const terrain = section(documentRef);
    this.terrainHeading = terrain.heading;
    const terrainControls = documentRef.createElement('div');
    terrainControls.className = 'nature-placement-lab-controls';
    this.resolution = documentRef.createElement('select');
    const resolutionLabel = labeledControl(documentRef, this.resolution);
    this.resolutionText = resolutionLabel.text;
    for (const value of TERRAIN_SURVEY_RESOLUTIONS) {
      const option = documentRef.createElement('option');
      option.value = String(value);
      this.resolution.appendChild(option);
    }
    this.gridButton = button(documentRef);
    terrainControls.append(resolutionLabel.label, this.gridButton);
    terrain.root.appendChild(terrainControls);
    this.statistics = documentRef.createElement('div');
    this.statistics.className = 'nature-placement-lab-statistics';
    terrain.root.appendChild(this.statistics);

    const footprint = section(documentRef);
    this.footprintHeading = footprint.heading;
    const footprintControls = documentRef.createElement('div');
    footprintControls.className = 'nature-placement-lab-controls';
    this.template = documentRef.createElement('select');
    const templateLabel = labeledControl(documentRef, this.template);
    this.templateText = templateLabel.text;
    for (const value of FOOTPRINT_TEMPLATES) {
      const option = documentRef.createElement('option');
      option.value = value.id;
      this.template.appendChild(option);
    }
    this.rotation = documentRef.createElement('input');
    this.rotation.type = 'range';
    this.rotation.min = '-180';
    this.rotation.max = '180';
    this.rotation.step = '15';
    const rotationLabel = labeledControl(documentRef, this.rotation);
    this.rotationText = rotationLabel.text;
    this.rotationValue = documentRef.createElement('output');
    rotationLabel.label.appendChild(this.rotationValue);
    footprintControls.append(templateLabel.label, rotationLabel.label);
    footprint.root.appendChild(footprintControls);
    this.verdict = documentRef.createElement('p');
    this.verdict.className = 'nature-placement-lab-status';
    this.verdict.setAttribute('aria-live', 'polite');
    this.corners = documentRef.createElement('div');
    this.corners.className = 'terrain-survey-corners';
    footprint.root.append(this.verdict, this.corners);

    const anchors = section(documentRef);
    this.anchorHeading = anchors.heading;
    const anchorControls = documentRef.createElement('div');
    anchorControls.className = 'nature-placement-lab-controls';
    this.anchorName = documentRef.createElement('input');
    this.anchorName.type = 'text';
    this.anchorName.maxLength = 80;
    const anchorNameLabel = labeledControl(documentRef, this.anchorName);
    this.anchorNameText = anchorNameLabel.text;
    this.anchorType = documentRef.createElement('select');
    const anchorTypeLabel = labeledControl(documentRef, this.anchorType);
    this.anchorTypeText = anchorTypeLabel.text;
    for (const value of TERRAIN_ANCHOR_TYPES) {
      const option = documentRef.createElement('option');
      option.value = value;
      this.anchorType.appendChild(option);
    }
    this.notes = documentRef.createElement('textarea');
    this.notes.maxLength = 500;
    const notesLabel = labeledControl(documentRef, this.notes);
    this.notesText = notesLabel.text;
    notesLabel.label.className = 'terrain-survey-notes';
    anchorControls.append(anchorNameLabel.label, anchorTypeLabel.label, notesLabel.label);
    anchors.root.appendChild(anchorControls);
    const actions = documentRef.createElement('div');
    actions.className = 'nature-placement-lab-actions nature-placement-lab-actions-3';
    this.saveButton = button(documentRef);
    this.clearButton = button(documentRef);
    this.exportButton = button(documentRef);
    actions.append(this.saveButton, this.clearButton, this.exportButton);
    this.status = documentRef.createElement('p');
    this.status.className = 'nature-placement-lab-status';
    this.status.setAttribute('aria-live', 'polite');
    anchors.root.append(actions, this.status);

    this.body.append(terrain.root, footprint.root, anchors.root);
    this.root.appendChild(this.body);
    mount.appendChild(this.root);

    this.toggle.addEventListener(
      'click',
      () => {
        this.open = !this.open;
        this.body.hidden = !this.open;
        this.toggle.setAttribute('aria-expanded', String(this.open));
      },
      { signal },
    );
    this.resolution.addEventListener(
      'change',
      () => this.callbacks.setResolution(Number(this.resolution.value) as TerrainSurveyResolution),
      { signal },
    );
    this.gridButton.addEventListener(
      'click',
      () => this.callbacks.setGridVisible(!(this.view?.gridVisible ?? true)),
      { signal },
    );
    this.template.addEventListener(
      'change',
      () => this.callbacks.setTemplate(this.template.value as FootprintTemplateId),
      { signal },
    );
    this.rotation.addEventListener(
      'input',
      () => this.callbacks.setRotationDegrees(Number(this.rotation.value)),
      { signal },
    );
    this.saveButton.addEventListener(
      'click',
      () => {
        const saved = this.callbacks.saveAnchor(
          this.anchorName.value,
          this.anchorType.value as TerrainAnchorType,
          this.notes.value,
        );
        this.status.textContent = t(
          saved
            ? 'hudChrome.startZoneTerrainSurvey.statusAnchorSaved'
            : 'hudChrome.startZoneTerrainSurvey.statusAnchorRejected',
        );
        this.status.dataset.severity = saved ? 'info' : 'error';
      },
      { signal },
    );
    this.clearButton.addEventListener(
      'click',
      () => {
        this.callbacks.clearAnchors();
        this.status.textContent = t('hudChrome.startZoneTerrainSurvey.statusAnchorsCleared');
        this.status.dataset.severity = 'info';
      },
      { signal },
    );
    this.exportButton.addEventListener(
      'click',
      () => downloadJson(this.documentRef, this.callbacks.exportReport()),
      { signal },
    );
    window.addEventListener('woc:languagechange', this.onLanguageChange, { signal });
    this.localize();
  }

  update(view: TerrainSurveyUiView): void {
    this.view = view;
    this.resolution.value = String(view.resolution);
    this.template.value = view.selectedTemplateId;
    this.rotation.value = String(view.rotationDegrees);
    this.anchorType.value =
      FOOTPRINT_TEMPLATES.find((entry) => entry.id === view.selectedTemplateId)?.proposedType ??
      'building-small';
    this.paintView();
  }

  dispose(): void {
    this.abort.abort();
    this.root.remove();
  }

  private localize(): void {
    const title = t('hudChrome.startZoneTerrainSurvey.title');
    this.root.setAttribute('aria-label', title);
    this.toggle.textContent = title;
    this.terrainHeading.textContent = t('hudChrome.startZoneTerrainSurvey.terrainSection');
    this.footprintHeading.textContent = t('hudChrome.startZoneTerrainSurvey.footprintSection');
    this.anchorHeading.textContent = t('hudChrome.startZoneTerrainSurvey.anchorSection');
    this.resolutionText.textContent = t('hudChrome.startZoneTerrainSurvey.resolution');
    this.templateText.textContent = t('hudChrome.startZoneTerrainSurvey.selectedTemplate');
    this.rotationText.textContent = t('hudChrome.startZoneTerrainSurvey.rotation');
    this.anchorNameText.textContent = t('hudChrome.startZoneTerrainSurvey.anchorName');
    this.anchorTypeText.textContent = t('hudChrome.startZoneTerrainSurvey.proposedType');
    this.notesText.textContent = t('hudChrome.startZoneTerrainSurvey.notes');
    this.saveButton.textContent = t('hudChrome.startZoneTerrainSurvey.saveAnchor');
    this.clearButton.textContent = t('hudChrome.startZoneTerrainSurvey.clearAnchors');
    this.exportButton.textContent = t('hudChrome.startZoneTerrainSurvey.exportReport');
    if (!this.anchorName.value) {
      this.anchorName.value = t('hudChrome.startZoneTerrainSurvey.anchorNameDefault');
    }
    for (const option of this.template.options) {
      option.textContent = t(TEMPLATE_KEYS[option.value as FootprintTemplateId]);
    }
    for (const option of this.anchorType.options) {
      option.textContent = t(TYPE_KEYS[option.value as TerrainAnchorType]);
    }
    for (const option of this.resolution.options) {
      option.textContent = formatNumber(Number(option.value), { style: 'unit', unit: 'meter' });
    }
    this.paintView();
  }

  private paintView(): void {
    if (!this.view) return;
    const view = this.view;
    this.gridButton.textContent = t(
      view.gridVisible
        ? 'hudChrome.startZoneTerrainSurvey.hideGrid'
        : 'hudChrome.startZoneTerrainSurvey.showGrid',
    );
    this.rotationValue.textContent = formatNumber(view.rotationDegrees, {
      style: 'unit',
      unit: 'degree',
    });
    const statistics = view.statistics;
    const lines = [
      t('hudChrome.startZoneTerrainSurvey.minimumHeight', {
        value: formatNumber(statistics.minimumHeight, { maximumFractionDigits: 2 }),
      }),
      t('hudChrome.startZoneTerrainSurvey.maximumHeight', {
        value: formatNumber(statistics.maximumHeight, { maximumFractionDigits: 2 }),
      }),
      t('hudChrome.startZoneTerrainSurvey.averageSlope', {
        value: formatNumber(statistics.averageSlopeDegrees, { maximumFractionDigits: 2 }),
      }),
      t('hudChrome.startZoneTerrainSurvey.maximumSlope', {
        value: formatNumber(statistics.maximumSlopeDegrees, { maximumFractionDigits: 2 }),
      }),
      t('hudChrome.startZoneTerrainSurvey.flatSurface', {
        value: formatNumber(statistics.flatSurfacePercent, { maximumFractionDigits: 1 }),
      }),
      t('hudChrome.startZoneTerrainSurvey.compatibleSurfaces', {
        count: formatNumber(
          statistics.compatibility[view.selectedTemplateId].compatibleSurfaceCount,
        ),
      }),
      t('hudChrome.startZoneTerrainSurvey.anchorsCount', {
        count: formatNumber(view.anchors.length),
      }),
    ];
    this.statistics.replaceChildren(
      ...lines.map((line) => {
        const paragraph = this.documentRef.createElement('p');
        paragraph.textContent = line;
        return paragraph;
      }),
    );
    const verdict = view.footprint
      ? t(
          view.footprint.compatible
            ? 'hudChrome.startZoneTerrainSurvey.compatible'
            : 'hudChrome.startZoneTerrainSurvey.incompatible',
        )
      : t('hudChrome.startZoneTerrainSurvey.noTerrain');
    this.verdict.textContent = t('hudChrome.startZoneTerrainSurvey.verdict', { verdict });
    this.verdict.dataset.severity = view.footprint?.compatible === false ? 'error' : 'info';
    const cornerLines =
      view.footprint?.corners.map((corner) =>
        t('hudChrome.startZoneTerrainSurvey.cornerDifference', {
          corner: CORNER_LABELS[corner.name],
          value: formatNumber(corner.differenceFromAverage, {
            maximumFractionDigits: 2,
            minimumFractionDigits: 2,
            signDisplay: 'always',
          }),
        }),
      ) ?? [];
    this.corners.replaceChildren(
      ...cornerLines.map((line) => {
        const span = this.documentRef.createElement('span');
        span.textContent = line;
        return span;
      }),
    );
  }

  private readonly onLanguageChange = (): void => this.localize();
}
