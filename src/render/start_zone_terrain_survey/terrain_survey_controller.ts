import {
  analyzeRectangularFootprint,
  analyzeTerrainSurvey,
  buildTerrainSurveyReport,
  createTerrainAnchor,
  DEFAULT_TERRAIN_SURVEY_RESOLUTION,
  footprintTemplate,
  parseTerrainAnchors,
  sampleTerrainGrid,
  serializeTerrainAnchors,
  serializeTerrainSurveyReport,
  START_ZONE_TERRAIN_SURVEY_STORAGE_KEY,
  type FootprintAnalysis,
  type FootprintTemplateId,
  type HeightSampler,
  type ProtectedZone,
  type TerrainAnchor,
  type TerrainAnchorType,
  type TerrainSurveyGrid,
  type TerrainSurveyPoint3,
  type TerrainSurveyResolution,
  type TerrainSurveyStatistics,
  type TerrainSurveyZoneDescription,
} from './terrain_survey_core';

export interface TerrainSurveyRenderAdapter {
  dispose(): void;
  syncAnchors(anchors: readonly TerrainAnchor[]): void;
  syncFootprint(analysis: FootprintAnalysis | null): void;
  syncGrid(grid: TerrainSurveyGrid, visible: boolean): void;
  syncProtectedZones(zones: readonly ProtectedZone[]): void;
}

export interface TerrainSurveyUiView {
  anchors: readonly TerrainAnchor[];
  footprint: FootprintAnalysis | null;
  gridVisible: boolean;
  resolution: TerrainSurveyResolution;
  rotationDegrees: number;
  selectedTemplateId: FootprintTemplateId;
  statistics: TerrainSurveyStatistics;
}

export interface TerrainSurveyUiCallbacks {
  clearAnchors(): void;
  exportReport(): string;
  saveAnchor(name: string, proposedType: TerrainAnchorType, notes: string): boolean;
  setGridVisible(visible: boolean): void;
  setResolution(resolution: TerrainSurveyResolution): void;
  setRotationDegrees(rotationDegrees: number): void;
  setTemplate(templateId: FootprintTemplateId): void;
}

export interface TerrainSurveyUiAdapter {
  dispose(): void;
  update(view: TerrainSurveyUiView): void;
}

export interface TerrainSurveyStorage {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

export interface TerrainSurveyPointerTarget {
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
}

export interface TerrainSurveyControllerOptions {
  createUi: (callbacks: TerrainSurveyUiCallbacks) => TerrainSurveyUiAdapter;
  pointerTarget: TerrainSurveyPointerTarget;
  projectTerrain: (clientX: number, clientY: number) => TerrainSurveyPoint3 | null;
  protectedZones: readonly ProtectedZone[];
  render: TerrainSurveyRenderAdapter;
  sampleHeight: HeightSampler;
  storage: TerrainSurveyStorage | null;
  zone: TerrainSurveyZoneDescription;
}

export class TerrainSurveyController {
  private resolution = DEFAULT_TERRAIN_SURVEY_RESOLUTION;
  private gridVisible = true;
  private selectedTemplateId: FootprintTemplateId = 'small-house';
  private rotationDegrees = 0;
  private grid: TerrainSurveyGrid;
  private statistics: TerrainSurveyStatistics;
  private footprint: FootprintAnalysis | null = null;
  private anchors: TerrainAnchor[];
  private readonly ui: TerrainSurveyUiAdapter;
  private disposed = false;

  constructor(private readonly options: TerrainSurveyControllerOptions) {
    let storedAnchors: string | null = null;
    try {
      storedAnchors =
        this.options.storage?.getItem(START_ZONE_TERRAIN_SURVEY_STORAGE_KEY) ?? null;
    } catch {
      storedAnchors = null;
    }
    this.anchors = parseTerrainAnchors(storedAnchors);
    this.grid = this.sample();
    this.statistics = analyzeTerrainSurvey(this.grid);
    this.options.render.syncProtectedZones(this.options.protectedZones);
    this.options.render.syncGrid(this.grid, this.gridVisible);
    this.options.render.syncAnchors(this.anchors);
    this.setFootprintCenter(this.options.zone.center.x, this.options.zone.center.z);
    this.ui = this.options.createUi({
      clearAnchors: () => this.clearAnchors(),
      exportReport: () => this.exportReport(),
      saveAnchor: (name, proposedType, notes) => this.saveAnchor(name, proposedType, notes),
      setGridVisible: (visible) => this.setGridVisible(visible),
      setResolution: (resolution) => this.setResolution(resolution),
      setRotationDegrees: (rotationDegrees) => this.setRotationDegrees(rotationDegrees),
      setTemplate: (templateId) => this.setTemplate(templateId),
    });
    this.options.pointerTarget.addEventListener('pointermove', this.onPointerMove);
    this.options.pointerTarget.addEventListener('pointerleave', this.onPointerLeave);
    this.refreshUi();
  }

  get currentGrid(): TerrainSurveyGrid {
    return this.grid;
  }

  get currentStatistics(): TerrainSurveyStatistics {
    return this.statistics;
  }

  get savedAnchors(): readonly TerrainAnchor[] {
    return this.anchors;
  }

  exportReport(): string {
    return serializeTerrainSurveyReport(
      buildTerrainSurveyReport({
        zone: this.options.zone,
        resolution: this.resolution,
        statistics: this.statistics,
        protectedZones: this.options.protectedZones,
        anchors: this.anchors,
      }),
    );
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.options.pointerTarget.removeEventListener('pointermove', this.onPointerMove);
    this.options.pointerTarget.removeEventListener('pointerleave', this.onPointerLeave);
    this.ui.dispose();
    this.options.render.dispose();
  }

  private sample(): TerrainSurveyGrid {
    return sampleTerrainGrid({
      bounds: this.options.zone.bounds,
      resolution: this.resolution,
      sampleHeight: this.options.sampleHeight,
      protectedZones: this.options.protectedZones,
    });
  }

  private setResolution(resolution: TerrainSurveyResolution): void {
    if (this.disposed || this.resolution === resolution) return;
    this.resolution = resolution;
    this.grid = this.sample();
    this.statistics = analyzeTerrainSurvey(this.grid);
    this.options.render.syncGrid(this.grid, this.gridVisible);
    this.refreshFootprint();
    this.refreshUi();
  }

  private setGridVisible(visible: boolean): void {
    if (this.disposed || this.gridVisible === visible) return;
    this.gridVisible = visible;
    this.options.render.syncGrid(this.grid, visible);
    this.refreshUi();
  }

  private setTemplate(templateId: FootprintTemplateId): void {
    if (this.disposed || this.selectedTemplateId === templateId) return;
    footprintTemplate(templateId);
    this.selectedTemplateId = templateId;
    this.refreshFootprint();
    this.refreshUi();
  }

  private setRotationDegrees(rotationDegrees: number): void {
    if (!Number.isFinite(rotationDegrees) || this.disposed) return;
    const normalized = Math.max(-180, Math.min(180, rotationDegrees));
    if (this.rotationDegrees === normalized) return;
    this.rotationDegrees = normalized;
    this.refreshFootprint();
    this.refreshUi();
  }

  private setFootprintCenter(x: number, z: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    if (
      x < this.options.zone.bounds.minX ||
      x > this.options.zone.bounds.maxX ||
      z < this.options.zone.bounds.minZ ||
      z > this.options.zone.bounds.maxZ
    ) {
      return;
    }
    const template = footprintTemplate(this.selectedTemplateId);
    this.footprint = analyzeRectangularFootprint({
      request: {
        centerX: x,
        centerZ: z,
        width: template.width,
        depth: template.depth,
        rotationY: (this.rotationDegrees * Math.PI) / 180,
      },
      sampleHeight: this.options.sampleHeight,
      protectedZones: this.options.protectedZones,
      sampleStep: Math.min(1, this.resolution),
      maxHeightDifference: template.maxHeightDifference,
      maxSlopeDegrees: template.maxSlopeDegrees,
    });
    this.options.render.syncFootprint(this.footprint);
  }

  private refreshFootprint(): void {
    if (!this.footprint) return;
    this.setFootprintCenter(this.footprint.centerX, this.footprint.centerZ);
  }

  private saveAnchor(name: string, proposedType: TerrainAnchorType, notes: string): boolean {
    if (!this.footprint || this.disposed) return false;
    try {
      const anchor = createTerrainAnchor({
        existingAnchors: this.anchors,
        name,
        proposedType,
        notes,
        footprint: this.footprint,
      });
      const anchors = [...this.anchors, anchor];
      try {
        this.options.storage?.setItem(
          START_ZONE_TERRAIN_SURVEY_STORAGE_KEY,
          serializeTerrainAnchors(anchors),
        );
      } catch {
        // The in-memory development session remains useful when storage is blocked.
      }
      this.anchors = anchors;
      this.options.render.syncAnchors(this.anchors);
      this.refreshUi();
      return true;
    } catch {
      return false;
    }
  }

  private clearAnchors(): void {
    if (this.disposed) return;
    this.anchors = [];
    try {
      this.options.storage?.removeItem(START_ZONE_TERRAIN_SURVEY_STORAGE_KEY);
    } catch {
      // Ignore blocked development storage and still clear the live overlay.
    }
    this.options.render.syncAnchors(this.anchors);
    this.refreshUi();
  }

  private refreshUi(): void {
    if (!this.ui || this.disposed) return;
    this.ui.update({
      anchors: this.anchors,
      footprint: this.footprint,
      gridVisible: this.gridVisible,
      resolution: this.resolution,
      rotationDegrees: this.rotationDegrees,
      selectedTemplateId: this.selectedTemplateId,
      statistics: this.statistics,
    });
  }

  private readonly onPointerMove: EventListener = (event): void => {
    if (this.disposed || !('clientX' in event) || !('clientY' in event)) return;
    const point = this.options.projectTerrain(
      Number(event.clientX),
      Number(event.clientY),
    );
    if (!point) return;
    this.setFootprintCenter(point.x, point.z);
    this.refreshUi();
  };

  private readonly onPointerLeave: EventListener = (): void => {
    if (this.disposed) return;
    this.footprint = null;
    this.options.render.syncFootprint(null);
    this.refreshUi();
  };
}
