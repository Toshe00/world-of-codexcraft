import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNaturePlacementLab } from '../src/render/nature_placement_lab';
import {
  NaturePlacementController,
  type NaturePlacementUiView,
} from '../src/render/nature_placement_lab/placement_controller';
import {
  NATURE_PLACEMENT_LIMITS,
  type NaturePlacement,
} from '../src/render/nature_placement_lab/placement_core';
import {
  createNaturePlacementProject,
  type NaturePlacementProject,
} from '../src/render/nature_placement_lab/placement_project_core';
import { NaturePlacementRender } from '../src/render/nature_placement_lab/placement_render';
import {
  compileNaturePlacementZone,
  natureZonePreviewPlacements,
  parseNatureZonePackageJson,
  serializeNatureZonePackage,
  validateNatureZonePackage,
  type NatureZonePackage,
} from '../src/render/nature_placement_lab/placement_zone_publication';
import { ensureLocaleLoaded, getLanguage, setLanguage, t } from '../src/ui/i18n';

const NOW = () => new Date('2026-07-17T12:00:00.000Z');
const repoRoot = path.resolve(import.meta.dirname, '..');

function project(): NaturePlacementProject {
  const value = createNaturePlacementProject('project-publication', 'Publication Project', NOW);
  value.placements = [
    {
      id: 'lab-placement-002',
      assetId: 'BirchTree_1',
      layerId: 'layer-trees',
      position: { x: 10, y: 5, z: -2 },
      rotationY: 1.25,
      scale: 1.2,
      groundOffsetY: 0.5,
    },
    {
      id: 'lab-placement-001',
      assetId: 'Bush_Flowers',
      layerId: 'layer-bushes',
      position: { x: -4, y: 2, z: 8 },
      rotationY: 0.25,
      scale: 0.8,
      groundOffsetY: -0.25,
    },
    {
      id: 'lab-placement-003',
      assetId: 'Grass_Large',
      layerId: 'layer-grass',
      position: { x: 100, y: 1, z: 100 },
      rotationY: 0,
      scale: 1,
      groundOffsetY: 0,
    },
  ];
  return value;
}

function compile(): NatureZonePackage {
  return compileNaturePlacementZone(
    project(),
    'laboratory-nature-zone',
    'Laboratory Nature Zone',
    ['layer-trees', 'layer-bushes'],
  );
}

function memoryStorage() {
  const values = new Map<string, string>();
  const setItem = vi.fn((key: string, value: string) => values.set(key, value));
  return {
    values,
    storage: {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem,
    } as unknown as Storage,
    setItem,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('nature placement zone compiler', () => {
  it('compiles deterministically without mutating the source and excludes unselected layers', () => {
    const source = project();
    const before = structuredClone(source);
    const first = compileNaturePlacementZone(source, 'laboratory-nature-zone', 'Laboratory Nature Zone', [
      'layer-trees',
      'layer-bushes',
    ]);
    const second = compileNaturePlacementZone(source, 'laboratory-nature-zone', 'Laboratory Nature Zone', [
      'layer-bushes',
      'layer-trees',
    ]);

    expect(serializeNatureZonePackage(first)).toBe(serializeNatureZonePackage(second));
    expect(source).toEqual(before);
    expect(first.includedLayerIds).toEqual(['layer-bushes', 'layer-trees']);
    expect(first.placements.map((entry) => entry.id)).toEqual([
      'lab-placement-001',
      'lab-placement-002',
    ]);
    expect(first.placements.some((entry) => entry.layerId === 'layer-grass')).toBe(false);
    expect(first).not.toHaveProperty('history');
    expect(first).not.toHaveProperty('preferences');
    expect(first).not.toHaveProperty('groups');
  });

  it('calculates rendered-anchor bounds and metadata statistics exactly', () => {
    const zonePackage = compile();

    expect(zonePackage.bounds).toEqual({
      minX: -4,
      maxX: 10,
      minY: 1.75,
      maxY: 5.5,
      minZ: -2,
      maxZ: 8,
    });
    expect(zonePackage.statistics).toEqual({
      placementCount: 2,
      estimatedTriangles: 5_074,
      uniqueMediaBytes: 226_684,
    });
    expect(zonePackage.assetSummary).toEqual([
      {
        assetId: 'BirchTree_1',
        assetPath: 'models/environment/laboratory/birch_tree_1.glb',
        placementCount: 1,
        estimatedTriangles: 4_596,
        mediaBytes: 147_792,
      },
      {
        assetId: 'Bush_Flowers',
        assetPath: 'models/environment/laboratory/nature_palette_01/bush_flowers.glb',
        placementCount: 1,
        estimatedTriangles: 478,
        mediaBytes: 78_892,
      },
    ]);
  });

  it('rejects empty projects, empty or unknown layer selections, and invalid zone ids', () => {
    const empty = createNaturePlacementProject('empty-project', 'Empty Project', NOW);
    expect(() =>
      compileNaturePlacementZone(empty, 'empty-zone', 'Empty Zone', ['layer-trees']),
    ).toThrow(/empty project/);
    expect(() =>
      compileNaturePlacementZone(project(), 'test-zone', 'Test Zone', []),
    ).toThrow(/must not be empty/);
    expect(() =>
      compileNaturePlacementZone(project(), 'test-zone', 'Test Zone', ['missing-layer']),
    ).toThrow(/unknown included layerId/);
    expect(() =>
      compileNaturePlacementZone(project(), 'Invalid Zone', 'Test Zone', ['layer-trees']),
    ).toThrow(/kebab-case/);
  });

  it('validates the real package and rejects strict-schema and security violations', () => {
    const zonePackage = compile();
    expect(validateNatureZonePackage(zonePackage)).toEqual(zonePackage);
    expect(parseNatureZonePackageJson(serializeNatureZonePackage(zonePackage))).toEqual(zonePackage);

    const duplicate = structuredClone(zonePackage);
    duplicate.placements.push(structuredClone(duplicate.placements[0]));
    duplicate.statistics.placementCount++;
    expect(() => validateNatureZonePackage(duplicate)).toThrow(/duplicate placement/);

    const undeclaredLayer = structuredClone(zonePackage);
    undeclaredLayer.placements[0].layerId = 'layer-grass';
    expect(() => validateNatureZonePackage(undeclaredLayer)).toThrow(/undeclared layerId/);

    const badBounds = structuredClone(zonePackage);
    badBounds.bounds.maxX++;
    expect(() => validateNatureZonePackage(badBounds)).toThrow(/inconsistent/);

    const badStatistics = structuredClone(zonePackage);
    badStatistics.statistics.estimatedTriangles++;
    expect(() => validateNatureZonePackage(badStatistics)).toThrow(/statistics are inconsistent/);

    const remoteAsset = structuredClone(zonePackage);
    remoteAsset.assetSummary[0].assetPath = 'https://example.com/tree.glb';
    expect(() => validateNatureZonePackage(remoteAsset)).toThrow(/local and relative/);

    const absoluteAsset = structuredClone(zonePackage);
    absoluteAsset.assetSummary[0].assetPath = 'C:\\assets\\tree.glb';
    expect(() => validateNatureZonePackage(absoluteAsset)).toThrow(/local and relative/);

    const unknownVersion = structuredClone(zonePackage) as unknown as { version: number };
    unknownVersion.version = 99;
    expect(() => validateNatureZonePackage(unknownVersion)).toThrow(/unsupported zone package version/);

    const unknownAsset = structuredClone(zonePackage);
    unknownAsset.placements[0].assetId = 'Unknown' as never;
    expect(() => validateNatureZonePackage(unknownAsset)).toThrow(/unknown assetId/);

    const gameplay = structuredClone(zonePackage) as NatureZonePackage & { colliders: unknown[] };
    gameplay.colliders = [];
    expect(() => validateNatureZonePackage(gameplay)).toThrow(/unknown property/);
    expect(() => parseNatureZonePackageJson('{"version":1,"__proto__":{}}')).toThrow(
      /dangerous/,
    );
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects the non-finite package number %s',
    (value) => {
      const zonePackage = structuredClone(compile());
      zonePackage.placements[0].position.x = value;
      expect(() => validateNatureZonePackage(zonePackage)).toThrow(/finite/);
    },
  );

  it('rejects more than 500 placements', () => {
    const zonePackage = compile();
    zonePackage.placements = Array.from(
      { length: NATURE_PLACEMENT_LIMITS.maxPlacements + 1 },
      (_, index) => ({
        ...structuredClone(zonePackage.placements[0]),
        id: `lab-placement-${String(index + 1).padStart(3, '0')}`,
      }),
    );
    expect(() => validateNatureZonePackage(zonePackage)).toThrow(/placement count/);
  });

  it('serializes byte-identically twice and round-trips placements for preview', () => {
    const zonePackage = compile();
    const first = serializeNatureZonePackage(zonePackage);
    const second = serializeNatureZonePackage(zonePackage);
    const preview = natureZonePreviewPlacements(parseNatureZonePackageJson(first));

    expect(second).toBe(first);
    expect(first.endsWith('\n')).toBe(true);
    expect(preview).toEqual(zonePackage.placements);
    expect(preview).not.toBe(zonePackage.placements);
    expect(preview[0].position).not.toBe(zonePackage.placements[0].position);
  });
});

describe('compiled zone preview', () => {
  it('uses distinct Three.js instances, disables picking, and restores the editor on stop', async () => {
    const scene = new THREE.Scene();
    const source = new THREE.Group();
    source.add(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial()));
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    const canvas = {
      getBoundingClientRect: () => ({ height: 100, left: 0, top: 0, width: 100 }),
    } as HTMLCanvasElement;
    const render = new NaturePlacementRender(scene, vi.fn(async () => ({ scene: source })), camera, canvas);
    const editable: NaturePlacement = {
      id: 'lab-placement-001',
      assetId: 'Bush_Flowers',
      position: { x: -4, y: 2, z: 8 },
      rotationY: 0.25,
      scale: 0.8,
      groundOffsetY: -0.25,
    };
    render.sync([editable], []);
    await render.settled();
    const editorInstance = render.group.getObjectByName(editable.id);
    expect(editorInstance).toBeDefined();

    render.startCompiledPreview(natureZonePreviewPlacements(compile()));
    await render.settled();
    const previewRoot = render.group.getObjectByName('Published Zone Preview');
    const previewInstance = previewRoot?.getObjectByName(editable.id);
    expect(previewRoot).toBeDefined();
    expect(previewInstance).toBeDefined();
    expect(previewInstance).not.toBe(editorInstance);
    expect(editorInstance?.visible).toBe(false);
    expect(previewInstance?.position).toMatchObject({ x: -4, y: 1.75, z: 8 });
    expect(render.pickPlacement(50, 50)).toBeNull();

    render.stopCompiledPreview();
    expect(render.group.getObjectByName('Published Zone Preview')).toBeUndefined();
    expect(editorInstance?.visible).toBe(true);
    expect(render.group.getObjectByName(editable.id)).toBe(editorInstance);
    render.dispose();
  });

  it('keeps project, history storage, localStorage, collision, and network untouched', () => {
    const memory = memoryStorage();
    let point = { x: 1, y: 2, z: 3 };
    let latestView: NaturePlacementUiView | null = null;
    const render = {
      clearGhost: vi.fn(),
      dispose: vi.fn(),
      pickPlacement: vi.fn(() => null),
      startCompiledPreview: vi.fn(),
      stopCompiledPreview: vi.fn(),
      sync: vi.fn(),
      syncGrid: vi.fn(),
      updateGhost: vi.fn(),
    };
    const network = vi.fn();
    vi.stubGlobal('fetch', network);
    vi.stubGlobal('WebSocket', vi.fn());
    const controller = new NaturePlacementController({
      canvas: new EventTarget() as HTMLCanvasElement,
      createUi: () => ({
        dispose: vi.fn(),
        update: (view) => {
          latestView = view;
        },
      }),
      eventWindow: new EventTarget() as Window,
      initialWorkCenter: { x: 0, y: 0, z: 0 },
      preferenceStorage: memory.storage,
      projectStorage: memory.storage,
      projectTerrain: () => ({ ...point }),
      render,
      sampleGroundY: () => 0,
    });
    controller.selectAsset('BirchTree_1');
    controller.startPlacement();
    controller.primaryDown(10, 20);
    point = { x: 4, y: 5, z: 6 };
    controller.selectAsset('Bush_Flowers');
    controller.startPlacement();
    controller.primaryDown(10, 20);
    const sourceBefore = controller.state.projectData;
    const storageWritesBefore = memory.setItem.mock.calls.length;

    controller.buildZonePackage({
      zoneId: 'laboratory-nature-zone',
      name: 'Laboratory Nature Zone',
      includedLayerIds: ['layer-trees', 'layer-bushes'],
    });
    const firstExport = controller.exportZonePackage();
    const secondExport = controller.exportZonePackage();
    controller.previewCompiledZone();
    const previewView = latestView as NaturePlacementUiView | null;

    expect(render.startCompiledPreview).toHaveBeenCalledWith(
      firstExport ? parseNatureZonePackageJson(firstExport.source).placements : [],
    );
    expect(previewView?.previewActive).toBe(true);
    expect(controller.primaryDown(10, 20)).toBe(false);
    expect(controller.state.projectData).toEqual(sourceBefore);
    expect(firstExport?.source).toBe(secondExport?.source);

    controller.stopPreview();
    const restoredView = latestView as NaturePlacementUiView | null;
    expect(render.stopCompiledPreview).toHaveBeenCalledOnce();
    expect(restoredView?.previewActive).toBe(false);
    expect(controller.state.projectData).toEqual(sourceBefore);
    expect(memory.setItem).toHaveBeenCalledTimes(storageWritesBefore);
    expect(network).not.toHaveBeenCalled();

    const sources = readdirSync(path.join(repoRoot, 'src/render/nature_placement_lab'))
      .filter((file) => file.endsWith('.ts'))
      .map((file) => readFileSync(path.join(repoRoot, 'src/render/nature_placement_lab', file), 'utf8'))
      .join('\n');
    expect(sources).not.toMatch(/\b(?:Collider|Hitbox|WebSocket|sessionStorage)\b/);
    expect(sources).not.toMatch(/(?:\.send\s*\(|fetch\s*\()/);
    controller.dispose();
  });
});

describe('publication interface and normal-mode isolation', () => {
  it('has immediate English and French publication labels', async () => {
    const previousLanguage = getLanguage();
    try {
      setLanguage('en');
      expect(t('hudChrome.naturePlacementLab.publicationPreviewSection')).toBe(
        'Publication Preview',
      );
      expect(t('hudChrome.naturePlacementLab.publishedZonePreview')).toBe(
        'Published Zone Preview',
      );
      await ensureLocaleLoaded('fr_FR');
      setLanguage('fr_FR');
      expect(t('hudChrome.naturePlacementLab.publicationPreviewSection')).toBe(
        'Aperçu de publication',
      );
      expect(t('hudChrome.naturePlacementLab.publishedZonePreview')).toBe(
        'Aperçu de la zone publiée',
      );
      const uiSource = readFileSync(
        path.join(repoRoot, 'src/render/nature_placement_lab/placement_ui.ts'),
        'utf8',
      );
      expect(uiSource).toContain("'woc:languagechange'");
      expect(uiSource).toContain('relocalizeChrome');
    } finally {
      await ensureLocaleLoaded(previousLanguage);
      setLanguage(previousLanguage);
    }
  });

  it('does not construct or load anything in normal mode', () => {
    const createController = vi.fn();
    const options = {} as never;
    expect(
      createNaturePlacementLab(options, { DEV: false, VITE_NATURE_PLACEMENT_LAB: '1' }, {
        createController,
      }),
    ).toBeNull();
    expect(createNaturePlacementLab(options, { DEV: true }, { createController })).toBeNull();
    expect(createController).not.toHaveBeenCalled();

    const rendererSource = readFileSync(path.join(repoRoot, 'src/render/renderer.ts'), 'utf8');
    expect(rendererSource).not.toContain('published-zones');
    expect(rendererSource).not.toContain('NatureZonePackage');
  });
});
