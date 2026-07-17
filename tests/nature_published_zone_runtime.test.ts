import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { naturePlacementAsset } from '../src/render/nature_placement_lab/placement_core';
import { parseNaturePlacementProjectJson } from '../src/render/nature_placement_lab/placement_project_json';
import {
  compileNaturePlacementZone,
  serializeNatureZonePackage,
  type NatureZonePackage,
} from '../src/render/nature_placement_lab/placement_zone_publication';
import { PublishedZoneController } from '../src/render/published_zones/published_zone_controller';
import {
  PUBLISHED_ZONE_ROOT_PREFIX,
  PublishedZoneInstances,
  type PublishedZoneInstanceOwner,
} from '../src/render/published_zones/published_zone_instances';
import {
  validateLaboratoryPublishedZoneRegistry,
  validPublishedZonePackagePath,
} from '../src/render/published_zones/published_zone_registry';
import { selectLaboratoryPublishedZone } from '../src/render/published_zones/published_zone_selection';
import {
  decidePublishedZoneProximityAction,
  distanceToPublishedZoneBounds,
  publishedZoneLabEnabled,
  PUBLISHED_ZONE_LOAD_DISTANCE,
  PUBLISHED_ZONE_UNLOAD_DISTANCE,
} from '../src/render/published_zones/published_zone_runtime_core';
import { ensureLocaleLoaded, getLanguage, setLanguage, t } from '../src/ui/i18n';

const repoRoot = path.resolve(import.meta.dirname, '..');
const registryPath = path.join(repoRoot, 'config/laboratory-published-zones.registry.json');
const packageRelativePath =
  'config/laboratory-published-zones/start-zone-nature-lab.zone.json';
const packagePath = path.join(repoRoot, ...packageRelativePath.split('/'));
const fixturePath = path.join(
  repoRoot,
  'tests/fixtures/nature_placement/start-zone-nature-lab.project.json',
);

function jsonFile(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function zonePackage(): NatureZonePackage {
  return jsonFile(packagePath) as NatureZonePackage;
}

function registry(): Record<string, unknown> {
  return jsonFile(registryPath) as Record<string, unknown>;
}

function packageDocuments(value: unknown = zonePackage()): Map<string, unknown> {
  return new Map([[packageRelativePath, value]]);
}

function entry(value: Record<string, unknown>): Record<string, unknown> {
  return (value.entries as Record<string, unknown>[])[0];
}

class FakeInstances implements PublishedZoneInstanceOwner {
  readonly load = vi.fn(async () => true);
  readonly unload = vi.fn();
  readonly dispose = vi.fn();
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('published zone laboratory activation and publication chain', () => {
  it('loads nothing without the flag or in production', () => {
    expect(publishedZoneLabEnabled({ DEV: true })).toBe(false);
    expect(
      publishedZoneLabEnabled({ DEV: false, VITE_PUBLISHED_ZONE_LAB: '1' }),
    ).toBe(false);
    expect(
      publishedZoneLabEnabled({ DEV: true, VITE_PUBLISHED_ZONE_LAB: '1' }),
    ).toBe(true);

    const rendererSource = readFileSync(path.join(repoRoot, 'src/render/renderer.ts'), 'utf8');
    expect(rendererSource).toMatch(
      /import\.meta\.env\.DEV\s*&&\s*import\.meta\.env\.VITE_PUBLISHED_ZONE_LAB === '1'/,
    );
    expect(rendererSource).toContain("void import('./published_zones')");
    expect(rendererSource).not.toContain('laboratory-published-zones.registry.json');
    expect(rendererSource).not.toContain('start-zone-nature-lab.zone.json');
    expect(rendererSource).not.toContain('registerPreload');
  });

  it('recompiles the checked-in package byte-identically from the valid editor fixture', () => {
    const projectSource = readFileSync(fixturePath, 'utf8');
    const project = parseNaturePlacementProjectJson(projectSource, {
      createProjectId: () => 'unused-project-id',
      legacyName: 'Unused',
    });
    const before = structuredClone(project);
    const compiled = compileNaturePlacementZone(
      project,
      'start-zone-nature-lab',
      'Start Zone Nature Lab',
      ['layer-trees', 'layer-bushes', 'layer-flowers', 'layer-grass', 'layer-dead-nature'],
    );

    expect(serializeNatureZonePackage(compiled)).toBe(readFileSync(packagePath, 'utf8'));
    expect(project).toEqual(before);
    expect(compiled.bounds).toEqual({
      minX: 20.2,
      maxX: 26,
      minY: -0.30549507576210355,
      maxY: 0.49466625319201574,
      minZ: -45.5,
      maxZ: -39.8,
    });
    expect(compiled.placements.map((placement) => placement.assetId)).toEqual([
      'BirchTree_1',
      'BirchTree_2',
      'Bush_Flowers',
      'DeadTree_2',
      'Flower_1_Clump',
      'Grass_Large',
    ]);
  });
});

describe('published zone registry allowlist', () => {
  it('validates the registry and selects only an enabled allowlisted zoneId', () => {
    const catalog = validateLaboratoryPublishedZoneRegistry(registry(), packageDocuments());
    expect(selectLaboratoryPublishedZone(catalog, 'start-zone-nature-lab')?.zonePackage.zoneId).toBe(
      'start-zone-nature-lab',
    );
    expect(selectLaboratoryPublishedZone(catalog, 'unknown-zone')).toBeNull();
  });

  it.each([
    ['remote URL', 'https://example.com/start-zone.zone.json'],
    ['Windows absolute path', 'C:\\zones\\start-zone.zone.json'],
    ['POSIX absolute path', '/zones/start-zone.zone.json'],
    ['folder traversal', 'config/laboratory-published-zones/../secret.zone.json'],
  ])('rejects a %s package path', (_label, badPath) => {
    expect(validPublishedZonePackagePath(badPath)).toBe(false);
    const value = structuredClone(registry());
    entry(value).packagePath = badPath;
    expect(() =>
      validateLaboratoryPublishedZoneRegistry(value, new Map([[badPath, zonePackage()]])),
    ).toThrow(/local portable package path/);
  });

  it('rejects duplicates, production activation, unknown status, absent packages, and invalid packages', () => {
    const duplicate = structuredClone(registry());
    (duplicate.entries as unknown[]).push(structuredClone((duplicate.entries as unknown[])[0]));
    expect(() =>
      validateLaboratoryPublishedZoneRegistry(duplicate, packageDocuments()),
    ).toThrow(/duplicate published zoneId/);

    const production = structuredClone(registry());
    entry(production).productionEnabled = true;
    expect(() =>
      validateLaboratoryPublishedZoneRegistry(production, packageDocuments()),
    ).toThrow(/active in production/);

    const unknownStatus = structuredClone(registry());
    entry(unknownStatus).status = 'preview';
    expect(() =>
      validateLaboratoryPublishedZoneRegistry(unknownStatus, packageDocuments()),
    ).toThrow(/unknown status/);

    expect(() =>
      validateLaboratoryPublishedZoneRegistry(registry(), new Map()),
    ).toThrow(/package is absent/);

    const invalidPackage = structuredClone(zonePackage());
    invalidPackage.bounds.maxX++;
    expect(() =>
      validateLaboratoryPublishedZoneRegistry(registry(), packageDocuments(invalidPackage)),
    ).toThrow(/package is invalid/);
  });
});

describe('published zone proximity lifecycle', () => {
  it('calculates distance to bounds and preserves the 60/90 hysteresis band', () => {
    const bounds = zonePackage().bounds;
    expect(distanceToPublishedZoneBounds({ x: 23, z: -43 }, bounds)).toBe(0);
    expect(distanceToPublishedZoneBounds({ x: 20.2, z: 20.2 }, bounds)).toBeCloseTo(60);
    expect(decidePublishedZoneProximityAction('unloaded', 60)).toBe('load');
    expect(decidePublishedZoneProximityAction('unloaded', 60.01)).toBe('none');
    expect(decidePublishedZoneProximityAction('loading', 75)).toBe('none');
    expect(decidePublishedZoneProximityAction('loaded', 90)).toBe('none');
    expect(decidePublishedZoneProximityAction('loaded', 90.01)).toBe('unload');
    expect(PUBLISHED_ZONE_LOAD_DISTANCE).toBe(60);
    expect(PUBLISHED_ZONE_UNLOAD_DISTANCE).toBe(90);
  });

  it('loads near, stays unloaded far away, avoids duplicates, and unloads past the outer threshold', async () => {
    const instances = new FakeInstances();
    const states: string[] = [];
    const controller = new PublishedZoneController(instances, (state) => states.push(state));
    expect(controller.install(zonePackage())).toBe(true);

    controller.update({ x: 200, z: 200 });
    expect(controller.state).toBe('unloaded');
    expect(instances.load).not.toHaveBeenCalled();

    controller.update({ x: 23, z: -43 });
    controller.update({ x: 23, z: -43 });
    controller.update({ x: 24, z: -42 });
    expect(controller.state).toBe('loading');
    expect(instances.load).toHaveBeenCalledOnce();
    await flushPromises();
    expect(controller.state).toBe('loaded');

    controller.update({ x: 110, z: -43 });
    expect(controller.state).toBe('loaded');
    controller.update({ x: 120, z: 60 });
    expect(controller.state).toBe('unloaded');
    expect(instances.unload).toHaveBeenCalledOnce();
    expect(states).toEqual(['unloaded', 'loading', 'loaded', 'unloaded']);
  });

  it('cancels a no-longer-needed load and cleans up on destruction', async () => {
    let resolveLoad: (loaded: boolean) => void = () => {
      throw new Error('load resolver was not initialized');
    };
    const instances = new FakeInstances();
    instances.load.mockImplementation(
      () => new Promise<boolean>((resolve) => (resolveLoad = resolve)),
    );
    const controller = new PublishedZoneController(instances, vi.fn());
    controller.install(zonePackage());
    controller.update({ x: 23, z: -43 });
    expect(controller.state).toBe('loading');
    controller.update({ x: 200, z: 200 });
    expect(controller.state).toBe('unloaded');
    resolveLoad(true);
    await flushPromises();
    expect(controller.state).toBe('unloaded');

    controller.dispose();
    expect(instances.dispose).toHaveBeenCalledOnce();
  });

  it('ignores an invalid package without throwing or loading assets', () => {
    const instances = new FakeInstances();
    const controller = new PublishedZoneController(instances, vi.fn());
    const invalid = structuredClone(zonePackage());
    invalid.statistics.placementCount++;
    expect(controller.install(invalid)).toBe(false);
    expect(controller.state).toBe('invalid');
    expect(instances.load).not.toHaveBeenCalled();
  });
});

describe('published zone Three.js instances', () => {
  it('creates one immutable, exact transformed clone per placement and unloads cleanly', async () => {
    const source = new THREE.Group();
    source.add(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial()));
    const load = vi.fn(async () => ({ scene: source }));
    const scene = new THREE.Scene();
    const value = zonePackage();
    const before = structuredClone(value);
    const instances = new PublishedZoneInstances(scene, load);

    expect(await instances.load(value)).toBe(true);
    const root = scene.getObjectByName(`${PUBLISHED_ZONE_ROOT_PREFIX}${value.zoneId}`);
    expect(root?.children).toHaveLength(value.placements.length);
    expect(new Set(root?.children.map((child) => child.name))).toHaveProperty(
      'size',
      value.placements.length,
    );
    for (const placement of value.placements) {
      const instance = root?.getObjectByName(placement.id);
      expect(instance?.position.toArray()).toEqual([
        placement.position.x,
        placement.position.y + placement.groundOffsetY,
        placement.position.z,
      ]);
      expect(instance?.rotation.y).toBe(placement.rotationY);
      expect(instance?.userData.publishedZonePlacement).toEqual({
        position: placement.position,
        rotationY: placement.rotationY,
        scale: placement.scale,
        groundOffsetY: placement.groundOffsetY,
      });
      expect(instance?.children[0].scale.x).toBe(
        naturePlacementAsset(placement.assetId).baseScale * placement.scale,
      );
    }
    expect(value).toEqual(before);
    expect(load).toHaveBeenCalledTimes(value.assetSummary.length);

    expect(await instances.load(value)).toBe(true);
    expect(load).toHaveBeenCalledTimes(value.assetSummary.length);
    expect(root?.children).toHaveLength(value.placements.length);

    instances.dispose();
    expect(scene.getObjectByName(`${PUBLISHED_ZONE_ROOT_PREFIX}${value.zoneId}`)).toBeUndefined();
    expect(source.children).toHaveLength(1);
  });
});

describe('published zone presentation and isolation', () => {
  it('has immediate English and French text and a disposable language listener', async () => {
    const previousLanguage = getLanguage();
    try {
      setLanguage('en');
      expect(t('hudChrome.publishedZoneLab.title')).toBe('Published Zone Lab');
      expect(t('hudChrome.publishedZoneLab.loaded')).toBe('Loaded');
      await ensureLocaleLoaded('fr_FR');
      setLanguage('fr_FR');
      expect(t('hudChrome.publishedZoneLab.title')).toBe('Laboratoire de zone publiée');
      expect(t('hudChrome.publishedZoneLab.loaded')).toBe('Chargé');

      const source = readFileSync(
        path.join(repoRoot, 'src/ui/published_zone_lab_indicator.ts'),
        'utf8',
      );
      expect(source).toContain("'woc:languagechange'");
      expect(source).toContain('this.abort.abort()');
    } finally {
      await ensureLocaleLoaded(previousLanguage);
      setLanguage(previousLanguage);
    }
  });

  it('contains no collider, network, gameplay, persistence, preload, or independent GLTF loader', () => {
    const sourceRoot = path.join(repoRoot, 'src/render/published_zones');
    const sources = readdirSync(sourceRoot)
      .filter((file) => file.endsWith('.ts'))
      .map((file) => readFileSync(path.join(sourceRoot, file), 'utf8'))
      .join('\n');
    const packageSource = readFileSync(packagePath, 'utf8');

    expect(sources).not.toMatch(/\b(?:Collider|Hitbox|WebSocket|localStorage|sessionStorage)\b/);
    expect(sources).not.toMatch(/(?:\.send\s*\(|fetch\s*\(|registerPreload\s*\()/);
    expect(sources).not.toMatch(/\bnew\s+GLTFLoader\b/);
    expect(sources).not.toMatch(/from ['"][^'"]*\/(?:sim|net|server|game)\//);
    expect(sources).toContain("import { loadGltf } from '../assets/loader'");
    expect(packageSource).not.toMatch(
      /"(?:colliders?|hitboxes?|network|gameplay|quests?|spawns?|localStorage)"/i,
    );
  });
});
