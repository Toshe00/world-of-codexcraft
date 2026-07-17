import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { terrainHeight } from '../src/sim/world';
import { ensureLocaleLoaded, getLanguage, setLanguage, t } from '../src/ui/i18n';
import {
  createStartZoneTerrainSurvey,
  type StartZoneTerrainSurveyOptions,
} from '../src/render/start_zone_terrain_survey';
import {
  TerrainSurveyController,
  type TerrainSurveyPointerTarget,
  type TerrainSurveyRenderAdapter,
  type TerrainSurveyStorage,
  type TerrainSurveyUiAdapter,
  type TerrainSurveyUiCallbacks,
} from '../src/render/start_zone_terrain_survey/terrain_survey_controller';
import {
  analyzeRectangularFootprint,
  analyzeTerrainSurvey,
  buildTerrainSurveyReport,
  createTerrainAnchor,
  DEFAULT_TERRAIN_SURVEY_RESOLUTION,
  FOOTPRINT_TEMPLATES,
  parseTerrainAnchors,
  sampleTerrainGrid,
  serializeTerrainSurveyReport,
  START_ZONE_TERRAIN_SURVEY_STORAGE_KEY,
  starterZoneTerrainSurveyEnabled,
  TERRAIN_SURVEY_CRITERIA,
  TERRAIN_SURVEY_RESOLUTIONS,
  type FootprintAnalysis,
  type ProtectedZone,
  type TerrainAnchor,
  type TerrainSurveyGrid,
  type TerrainSurveyZoneDescription,
} from '../src/render/start_zone_terrain_survey/terrain_survey_core';
import { TerrainSurveyRender } from '../src/render/start_zone_terrain_survey/terrain_survey_render';
import { buildStarterZoneSurveySource } from '../src/render/start_zone_terrain_survey/starter_zone_sources';

const repoRoot = join(import.meta.dirname, '..');
const surveyDir = join(repoRoot, 'src', 'render', 'start_zone_terrain_survey');

const smallZone: TerrainSurveyZoneDescription = {
  id: 'test-zone',
  name: 'Test Zone',
  center: { x: 0, z: 0 },
  bounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 },
};

function flatFootprint(overrides: Partial<FootprintAnalysis> = {}): FootprintAnalysis {
  return {
    centerX: 0,
    centerZ: 0,
    width: 6,
    depth: 6,
    rotationY: 0,
    averageHeight: 2,
    maximumHeightDifference: 0,
    maximumSlopeDegrees: 0,
    floatingCorners: [],
    buriedCorners: [],
    corners: [
      {
        name: 'north-west',
        x: -3,
        y: 2,
        z: 3,
        differenceFromAverage: 0,
        status: 'level',
      },
      {
        name: 'north-east',
        x: 3,
        y: 2,
        z: 3,
        differenceFromAverage: 0,
        status: 'level',
      },
      {
        name: 'south-east',
        x: 3,
        y: 2,
        z: -3,
        differenceFromAverage: 0,
        status: 'level',
      },
      {
        name: 'south-west',
        x: -3,
        y: 2,
        z: -3,
        differenceFromAverage: 0,
        status: 'level',
      },
    ],
    compatible: true,
    protectedZoneIds: [],
    recommendedVerticalCorrection: 0,
    ...overrides,
  };
}

class FakePointerTarget implements TerrainSurveyPointerTarget {
  readonly listeners = new Map<string, Set<EventListener>>();

  addEventListener(type: string, listener: EventListener): void {
    const listeners = this.listeners.get(type) ?? new Set<EventListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string, event: Event): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  count(): number {
    return [...this.listeners.values()].reduce((sum, listeners) => sum + listeners.size, 0);
  }
}

class FakeStorage implements TerrainSurveyStorage {
  readonly values = new Map<string, string>();
  readonly writes: string[] = [];

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.writes.push(key);
    this.values.set(key, value);
  }
}

function controllerHarness() {
  const pointerTarget = new FakePointerTarget();
  const storage = new FakeStorage();
  const render: TerrainSurveyRenderAdapter = {
    dispose: vi.fn(),
    syncAnchors: vi.fn(),
    syncFootprint: vi.fn(),
    syncGrid: vi.fn(),
    syncProtectedZones: vi.fn(),
  };
  const ui: TerrainSurveyUiAdapter = { dispose: vi.fn(), update: vi.fn() };
  let callbacks: TerrainSurveyUiCallbacks | null = null;
  const controller = new TerrainSurveyController({
    createUi: (value) => {
      callbacks = value;
      return ui;
    },
    pointerTarget,
    projectTerrain: () => ({ x: 1, y: 0, z: 1 }),
    protectedZones: [],
    render,
    sampleHeight: () => 2,
    storage,
    zone: smallZone,
  });
  return { callbacks: () => callbacks, controller, pointerTarget, render, storage, ui };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('starter zone terrain survey activation and normal-mode isolation', () => {
  it('creates no diagnostic without the flag', () => {
    expect(starterZoneTerrainSurveyEnabled({ DEV: true })).toBe(false);
    const createController = vi.fn();
    const options = {} as StartZoneTerrainSurveyOptions;
    expect(
      createStartZoneTerrainSurvey(options, { DEV: true }, { createController }),
    ).toBeNull();
    expect(createController).not.toHaveBeenCalled();
  });

  it('creates no diagnostic in production', () => {
    expect(
      starterZoneTerrainSurveyEnabled({
        DEV: false,
        PROD: true,
        VITE_START_ZONE_TERRAIN_LAB: '1',
      }),
    ).toBe(false);
    const createController = vi.fn();
    expect(
      createStartZoneTerrainSurvey(
        {} as StartZoneTerrainSurveyOptions,
        { DEV: false, PROD: true, VITE_START_ZONE_TERRAIN_LAB: '1' },
        { createController },
      ),
    ).toBeNull();
    expect(createController).not.toHaveBeenCalled();
  });

  it('requires both the development build and the exact flag value', () => {
    expect(
      starterZoneTerrainSurveyEnabled({ DEV: true, VITE_START_ZONE_TERRAIN_LAB: '1' }),
    ).toBe(true);
    expect(
      starterZoneTerrainSurveyEnabled({ DEV: true, VITE_START_ZONE_TERRAIN_LAB: 'true' }),
    ).toBe(false);
  });

  it('keeps the normal renderer path free of static imports and survey frame work', () => {
    const rendererSource = readFileSync(join(repoRoot, 'src', 'render', 'renderer.ts'), 'utf8');
    expect(rendererSource).toContain("import.meta.env.VITE_START_ZONE_TERRAIN_LAB === '1'");
    expect(rendererSource).toContain("void import('./start_zone_terrain_survey')");
    expect(rendererSource).not.toMatch(/from ['"]\.\/start_zone_terrain_survey/);
    expect(rendererSource.match(/startZoneTerrainSurvey\?\./g)).toHaveLength(1);
    expect(rendererSource).toContain('this.startZoneTerrainSurvey?.dispose()');
  });
});

describe('starter zone terrain sampling and statistics', () => {
  it('pins the available resolutions and central slope thresholds', () => {
    expect(TERRAIN_SURVEY_RESOLUTIONS).toEqual([0.5, 1, 2, 5]);
    expect(DEFAULT_TERRAIN_SURVEY_RESOLUTION).toBe(1);
    expect(TERRAIN_SURVEY_CRITERIA.flatSlopeDegrees).toBe(5);
    expect(TERRAIN_SURVEY_CRITERIA.moderateSlopeDegrees).toBe(12);
  });

  it('samples deterministically without mutating its terrain inputs', () => {
    const bounds = Object.freeze({ minX: -2, maxX: 2, minZ: -2, maxZ: 2 });
    const protectedZones = Object.freeze([
      Object.freeze({
        id: 'protected',
        name: 'Protected',
        kind: 'npc' as const,
        shape: 'circle' as const,
        x: 0,
        z: 0,
        radius: 1,
      }),
    ]);
    const run = () =>
      sampleTerrainGrid({
        bounds,
        resolution: 1,
        sampleHeight: (x, z) => terrainHeight(x, z, 20061),
        protectedZones,
      });
    expect(run()).toEqual(run());
    expect(bounds).toEqual({ minX: -2, maxX: 2, minZ: -2, maxZ: 2 });
    expect(protectedZones[0]).toEqual({
      id: 'protected',
      name: 'Protected',
      kind: 'npc',
      shape: 'circle',
      x: 0,
      z: 0,
      radius: 1,
    });
  });

  it('calculates flat, moderate, and steep slopes from the injected height source', () => {
    const bounds = { minX: 0, maxX: 2, minZ: 0, maxZ: 2 };
    const flat = sampleTerrainGrid({ bounds, resolution: 1, sampleHeight: () => 7 });
    const diagonal = sampleTerrainGrid({ bounds, resolution: 1, sampleHeight: (x) => x });
    const moderate = sampleTerrainGrid({
      bounds,
      resolution: 1,
      sampleHeight: (_x, z) => Math.tan((10 * Math.PI) / 180) * z,
    });
    expect(flat.samples[4]?.slopeDegrees).toBe(0);
    expect(diagonal.samples[4]?.slopeDegrees).toBeCloseTo(45, 10);
    expect(diagonal.samples[4]?.slopeOrientationRadians).toBeCloseTo(0, 10);
    expect(moderate.samples[4]?.slopeDegrees).toBeCloseTo(10, 10);
    expect(moderate.samples[4]?.slopeClass).toBe('moderate');
  });

  it('calculates height differences and contiguous flat surfaces', () => {
    const grid = sampleTerrainGrid({
      bounds: { minX: 0, maxX: 2, minZ: 0, maxZ: 2 },
      resolution: 1,
      sampleHeight: (x, z) => x + z,
    });
    const statistics = analyzeTerrainSurvey(grid);
    expect(statistics.minimumHeight).toBe(0);
    expect(statistics.maximumHeight).toBe(4);
    expect(statistics.totalHeightDifference).toBe(4);

    const flatGrid = sampleTerrainGrid({
      bounds: { minX: 0, maxX: 4, minZ: 0, maxZ: 4 },
      resolution: 1,
      sampleHeight: () => 3,
    });
    const flatStatistics = analyzeTerrainSurvey(flatGrid);
    expect(flatStatistics.flatSurfacePercent).toBe(100);
    expect(flatStatistics.largestFlatSurfaces[0]?.sampleCount).toBe(25);
  });
});

describe('rectangular terrain footprints', () => {
  it('analyzes a flat footprint', () => {
    const analysis = analyzeRectangularFootprint({
      request: { centerX: 0, centerZ: 0, width: 6, depth: 6, rotationY: 0 },
      sampleHeight: () => 4,
      maxHeightDifference: 0.8,
      maxSlopeDegrees: 5,
    });
    expect(analysis.averageHeight).toBe(4);
    expect(analysis.maximumHeightDifference).toBe(0);
    expect(analysis.maximumSlopeDegrees).toBe(0);
    expect(analysis.floatingCorners).toEqual([]);
    expect(analysis.buriedCorners).toEqual([]);
    expect(analysis.compatible).toBe(true);
    expect(analysis.recommendedVerticalCorrection).toBe(0);
  });

  it('analyzes an inclined footprint and identifies floating and buried corners', () => {
    const analysis = analyzeRectangularFootprint({
      request: { centerX: 0, centerZ: 0, width: 6, depth: 6, rotationY: 0 },
      sampleHeight: (x) => x,
      maxHeightDifference: 0.8,
      maxSlopeDegrees: 5,
    });
    expect(analysis.averageHeight).toBeCloseTo(0, 10);
    expect(analysis.maximumHeightDifference).toBe(6);
    expect(analysis.maximumSlopeDegrees).toBeCloseTo(45, 10);
    expect(analysis.floatingCorners.map((corner) => corner.name)).toEqual([
      'north-west',
      'south-west',
    ]);
    expect(analysis.buriedCorners.map((corner) => corner.name)).toEqual([
      'north-east',
      'south-east',
    ]);
    expect(analysis.compatible).toBe(false);
  });

  it('rotates non-square footprints around their center', () => {
    const analyze = (rotationY: number) =>
      analyzeRectangularFootprint({
        request: { centerX: 0, centerZ: 0, width: 10, depth: 8, rotationY },
        sampleHeight: (x) => x,
        maxHeightDifference: 20,
        maxSlopeDegrees: 50,
      });
    expect(analyze(0).maximumHeightDifference).toBeCloseTo(10, 10);
    expect(analyze(Math.PI / 2).maximumHeightDifference).toBeCloseTo(8, 10);
    expect(FOOTPRINT_TEMPLATES.map(({ id, width, depth }) => ({ id, width, depth }))).toEqual([
      { id: 'small-house', width: 6, depth: 6 },
      { id: 'medium-house', width: 10, depth: 8 },
      { id: 'large-house', width: 14, depth: 12 },
      { id: 'central-plaza', width: 20, depth: 20 },
      { id: 'road', width: 4, depth: 12 },
    ]);
  });

  it('rejects footprints that overlap protected zones', () => {
    const protectedZones: ProtectedZone[] = [
      { id: 'npc-a', name: 'NPC A', kind: 'npc', shape: 'circle', x: 0, z: 0, radius: 2 },
    ];
    const blocked = analyzeRectangularFootprint({
      request: { centerX: 0, centerZ: 0, width: 6, depth: 6, rotationY: 0 },
      sampleHeight: () => 0,
      protectedZones,
    });
    expect(blocked.protectedZoneIds).toEqual(['npc-a']);
    expect(blocked.compatible).toBe(false);
  });
});

describe('protected starter-zone sources and anchor points', () => {
  it('derives the real Eastbrook work area and protected categories', () => {
    const source = buildStarterZoneSurveySource([]);
    expect(source.zone.center).toEqual({ x: 0, z: 0 });
    expect(source.zone.bounds).toEqual({ minX: -65, maxX: 65, minZ: -65, maxZ: 65 });
    expect(source.protectedZones.filter((zone) => zone.kind === 'building')).toHaveLength(4);
    expect(source.protectedZones.filter((zone) => zone.kind === 'building-entrance')).toHaveLength(4);
    expect(source.protectedZones.some((zone) => zone.kind === 'campfire')).toBe(true);
    expect(source.protectedZones.some((zone) => zone.kind === 'well')).toBe(true);
    expect(source.protectedZones.some((zone) => zone.kind === 'portal')).toBe(true);
    expect(source.protectedZones.some((zone) => zone.kind === 'road')).toBe(true);
    expect(source.protectedZones.some((zone) => zone.kind === 'quest-point')).toBe(true);
    expect(source.protectedZones.some((zone) => zone.kind === 'spawn-point')).toBe(true);
  });

  it('creates a complete valid local anchor without touching player storage keys', () => {
    const anchor = createTerrainAnchor({
      existingAnchors: [],
      name: 'North house',
      proposedType: 'building-small',
      notes: 'Keep the road clear.',
      footprint: flatFootprint(),
    });
    expect(anchor).toEqual({
      id: 'survey-anchor-001',
      name: 'North house',
      position: { x: 0, y: 2, z: 0 },
      rotationY: 0,
      width: 6,
      depth: 6,
      averageHeight: 2,
      maximumHeightDifference: 0,
      maximumSlopeDegrees: 0,
      proposedType: 'building-small',
      notes: 'Keep the road clear.',
    });
    expect(START_ZONE_TERRAIN_SURVEY_STORAGE_KEY).toBe(
      'dev.start-zone-terrain-survey.anchors.v1',
    );
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'refuses non-finite terrain data: %s',
    (value) => {
      expect(() =>
        analyzeRectangularFootprint({
          request: { centerX: value, centerZ: 0, width: 6, depth: 6, rotationY: 0 },
          sampleHeight: () => 0,
        }),
      ).toThrow(/finite/);
      expect(() =>
        createTerrainAnchor({
          existingAnchors: [],
          name: 'Invalid',
          proposedType: 'building-small',
          notes: '',
          footprint: flatFootprint({ averageHeight: value }),
        }),
      ).toThrow(/finite/);
      expect(parseTerrainAnchors('[{"id":"bad","position":{"x":null}}]')).toEqual([]);
    },
  );
});

describe('deterministic terrain report export', () => {
  it('sorts inputs and exports the same plain JSON bytes every time', () => {
    const grid = sampleTerrainGrid({
      bounds: smallZone.bounds,
      resolution: 1,
      sampleHeight: () => 2,
    });
    const statistics = analyzeTerrainSurvey(grid);
    const firstAnchor = createTerrainAnchor({
      existingAnchors: [],
      name: 'A',
      proposedType: 'building-small',
      notes: '',
      footprint: flatFootprint(),
    });
    const secondAnchor: TerrainAnchor = { ...firstAnchor, id: 'survey-anchor-002', name: 'B' };
    const protectedZones: ProtectedZone[] = [
      { id: 'z', name: 'Z', kind: 'npc', shape: 'circle', x: 2, z: 2, radius: 1 },
      { id: 'a', name: 'A', kind: 'well', shape: 'circle', x: -2, z: -2, radius: 1 },
    ];
    const make = (zones: ProtectedZone[], anchors: TerrainAnchor[]) =>
      serializeTerrainSurveyReport(
        buildTerrainSurveyReport({
          zone: smallZone,
          resolution: 1,
          statistics,
          protectedZones: zones,
          anchors,
        }),
      );
    const first = make(protectedZones, [secondAnchor, firstAnchor]);
    const second = make([...protectedZones].reverse(), [firstAnchor, secondAnchor]);
    expect(first).toBe(second);
    expect(first.endsWith('\n')).toBe(true);
    const report = JSON.parse(first);
    expect(Object.keys(report)).toEqual([
      'version',
      'analyzedZone',
      'samplingParameters',
      'statistics',
      'protectedZones',
      'anchors',
      'recommendations',
    ]);
    expect(report.protectedZones.map((zone: ProtectedZone) => zone.id)).toEqual(['a', 'z']);
    expect(report.anchors.map((anchor: TerrainAnchor) => anchor.id)).toEqual([
      'survey-anchor-001',
      'survey-anchor-002',
    ]);
  });
});

describe('controller and render cleanup boundaries', () => {
  it('removes every listener and disposes adapters exactly once', () => {
    const harness = controllerHarness();
    expect(harness.pointerTarget.count()).toBe(2);
    harness.controller.dispose();
    harness.controller.dispose();
    expect(harness.pointerTarget.count()).toBe(0);
    expect(harness.ui.dispose).toHaveBeenCalledTimes(1);
    expect(harness.render.dispose).toHaveBeenCalledTimes(1);
    harness.pointerTarget.emit(
      'pointermove',
      Object.assign(new Event('pointermove'), { clientX: 1, clientY: 1 }),
    );
    expect(harness.ui.update).toHaveBeenCalledTimes(1);
  });

  it('stores anchors only under the distinct development key', () => {
    const harness = controllerHarness();
    expect(
      harness.callbacks()?.saveAnchor('Test', 'building-small', 'Local only.'),
    ).toBe(true);
    expect(harness.storage.writes).toEqual([START_ZONE_TERRAIN_SURVEY_STORAGE_KEY]);
    harness.controller.dispose();
  });

  it('removes the Three.js group and all overlay children on destruction', () => {
    const scene = new THREE.Scene();
    const render = new TerrainSurveyRender(scene, () => 0);
    const grid: TerrainSurveyGrid = sampleTerrainGrid({
      bounds: { minX: 0, maxX: 1, minZ: 0, maxZ: 1 },
      resolution: 1,
      sampleHeight: () => 0,
    });
    render.syncGrid(grid, true);
    render.syncFootprint(flatFootprint({ averageHeight: 0 }));
    expect(scene.getObjectByName('Starter Zone Terrain Survey')).toBeDefined();
    render.dispose();
    render.dispose();
    expect(scene.getObjectByName('Starter Zone Terrain Survey')).toBeUndefined();
  });

  it('has no collider, network, simulation, or gameplay command surface', () => {
    const source = readdirSync(surveyDir)
      .filter((file) => file.endsWith('.ts'))
      .map((file) => readFileSync(join(surveyDir, file), 'utf8'))
      .join('\n');
    expect(source).not.toMatch(/\b(?:addCollider|clickTargets|resolveMovement|isBlocked)\b/);
    expect(source).not.toMatch(/\b(?:fetch|WebSocket)\b/);
    expect(source).not.toMatch(/from ['"].*(?:\/game\/|\/net\/|\/server\/)/);
    expect(source).not.toMatch(/\b(?:IWorld|ClientWorld|new Sim)\b/);
    expect(source).not.toMatch(/\.send\s*\(/);
  });

  it('performs no network work while sampling, saving, and exporting', () => {
    const fetch = vi.fn();
    const webSocket = vi.fn();
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('WebSocket', webSocket);
    const harness = controllerHarness();
    harness.callbacks()?.saveAnchor('Test', 'building-small', 'No network.');
    harness.controller.exportReport();
    expect(fetch).not.toHaveBeenCalled();
    expect(webSocket).not.toHaveBeenCalled();
    harness.controller.dispose();
  });
});

describe('localized terrain survey interface', () => {
  it('provides the English interface', () => {
    const previous = getLanguage();
    try {
      setLanguage('en');
      expect(t('hudChrome.startZoneTerrainSurvey.title')).toBe('Starter Zone Terrain Survey');
      expect(t('hudChrome.startZoneTerrainSurvey.minimumHeight', { value: '1.5' })).toBe(
        'Minimum height: 1.5 m',
      );
      expect(t('hudChrome.startZoneTerrainSurvey.saveAnchor')).toBe('Save Anchor Point');
      expect(t('hudChrome.startZoneTerrainSurvey.compatible')).toBe('compatible');
    } finally {
      setLanguage(previous);
    }
  });

  it('provides the French interface', async () => {
    const previous = getLanguage();
    try {
      await ensureLocaleLoaded('fr_FR');
      setLanguage('fr_FR');
      expect(t('hudChrome.startZoneTerrainSurvey.title')).toBe(
        'Relevé du terrain de la zone de départ',
      );
      expect(t('hudChrome.startZoneTerrainSurvey.minimumHeight', { value: '1,5' })).toBe(
        'Hauteur minimale : 1,5 m',
      );
      expect(t('hudChrome.startZoneTerrainSurvey.saveAnchor')).toBe(
        "Enregistrer le point d'ancrage",
      );
      expect(t('hudChrome.startZoneTerrainSurvey.incompatible')).toBe('incompatible');
    } finally {
      setLanguage(previous);
    }
  });
});
