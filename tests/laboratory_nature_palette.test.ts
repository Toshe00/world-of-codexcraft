import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { AssetReplacementRegistry } from '../src/assets/asset_replacement.mjs';
import { resolveAssetReplacement } from '../src/assets/asset_replacement.mjs';
import {
  createLaboratoryNaturePalette,
  LABORATORY_NATURE_PALETTE_LABEL,
  type LaboratoryNaturePalette,
} from '../src/render/laboratory_nature_palette';
import {
  LABORATORY_NATURE_PALETTE_CONFIG,
  laboratoryNaturePaletteEnabled,
  laboratoryNaturePlacements,
  validLaboratoryNaturePaletteConfig,
} from '../src/render/laboratory_nature_palette_core';

const repoRoot = path.resolve(import.meta.dirname, '..');

function modelSource(): THREE.Group {
  const source = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.7 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 6, 2), material);
  mesh.position.y = 2.5;
  source.add(mesh);
  return source;
}

interface LabelResource {
  materialDispose: ReturnType<typeof vi.fn>;
  sprite: THREE.Sprite;
  textureDispose: ReturnType<typeof vi.fn>;
}

function labelResource(name: string): LabelResource {
  const texture = new THREE.Texture();
  const textureDispose = vi.spyOn(texture, 'dispose');
  const material = new THREE.SpriteMaterial({ map: texture });
  const materialDispose = vi.spyOn(material, 'dispose');
  const sprite = new THREE.Sprite(material);
  sprite.name = name;
  return { materialDispose, sprite, textureDispose };
}

function dependencies(source: THREE.Group) {
  const labels: LabelResource[] = [];
  return {
    createLabel: vi.fn((name: string) => {
      const resource = labelResource(name);
      labels.push(resource);
      return resource.sprite;
    }),
    labels,
    load: vi.fn(async (_path: string) => ({ scene: source })),
    log: vi.fn(),
    warn: vi.fn(),
  };
}

function requiredPalette(palette: LaboratoryNaturePalette | null): LaboratoryNaturePalette {
  expect(palette).not.toBe(null);
  if (!palette) throw new Error('nature laboratory palette was not created');
  return palette;
}

describe('nature laboratory palette activation and configuration', () => {
  it('stays disabled by default and enables only with the explicit development flag', () => {
    expect(laboratoryNaturePaletteEnabled({ DEV: true })).toBe(false);
    expect(laboratoryNaturePaletteEnabled({ DEV: false, VITE_ASSET_REPLACEMENT_LAB: '1' })).toBe(
      false,
    );
    expect(laboratoryNaturePaletteEnabled({ DEV: true, VITE_ASSET_REPLACEMENT_LAB: '1' })).toBe(
      true,
    );

    const scene = new THREE.Scene();
    const deps = dependencies(modelSource());
    expect(createLaboratoryNaturePalette(scene, () => 0, { DEV: true }, deps)).toBe(null);
    expect(deps.load).not.toHaveBeenCalled();
    expect(scene.children).toHaveLength(0);
  });

  it('contains exactly six unique assets with centralized finite settings', () => {
    expect(validLaboratoryNaturePaletteConfig(LABORATORY_NATURE_PALETTE_CONFIG)).toBe(true);
    expect(LABORATORY_NATURE_PALETTE_CONFIG).toHaveLength(6);
    expect(LABORATORY_NATURE_PALETTE_CONFIG.map((asset) => asset.label)).toEqual([
      'BirchTree_1',
      'BirchTree_2',
      'Bush_Flowers',
      'Flower_1_Clump',
      'Grass_Large',
      'DeadTree_2',
    ]);
    expect(new Set(LABORATORY_NATURE_PALETTE_CONFIG.map((asset) => asset.label)).size).toBe(6);
    expect(new Set(LABORATORY_NATURE_PALETTE_CONFIG.map((asset) => asset.assetPath)).size).toBe(6);
    expect(new Set(LABORATORY_NATURE_PALETTE_CONFIG.map((asset) => asset.loadPath)).size).toBe(6);
    expect(LABORATORY_NATURE_PALETTE_CONFIG.map((asset) => asset.scale)).toEqual([
      1, 0.8, 1, 1.25, 1.4, 0.9,
    ]);

    expect(validLaboratoryNaturePaletteConfig([])).toBe(false);
    expect(
      validLaboratoryNaturePaletteConfig([
        ...LABORATORY_NATURE_PALETTE_CONFIG.slice(0, 5),
        { ...LABORATORY_NATURE_PALETTE_CONFIG[0] },
      ]),
    ).toBe(false);
    expect(
      validLaboratoryNaturePaletteConfig([
        ...LABORATORY_NATURE_PALETTE_CONFIG.slice(0, 5),
        {
          ...LABORATORY_NATURE_PALETTE_CONFIG[5],
          loadPath: LABORATORY_NATURE_PALETTE_CONFIG[0].loadPath,
        },
      ]),
    ).toBe(false);
  });
});

describe('nature laboratory palette placement', () => {
  it('lowers only Bush_Flowers slightly below the sampled ground anchor', () => {
    const placements = laboratoryNaturePlacements(
      { position: { x: 0, z: 0 }, facing: 0 },
      () => 10,
    );

    expect(placements.find((placement) => placement.label === 'Bush_Flowers')?.y).toBeCloseTo(9.92);
    for (const placement of placements.filter((entry) => entry.label !== 'Bush_Flowers')) {
      expect(placement.y, placement.label).toBe(10);
    }
  });

  it('places six grounded models in a spaced semicircle without mutating player input', () => {
    const player = Object.freeze({
      position: Object.freeze({ x: 10, z: 20 }),
      facing: 0,
    });
    const before = structuredClone(player);
    const ground = vi.fn((x: number, z: number) => x * 0.1 + z * 0.2);
    const placements = laboratoryNaturePlacements(player, ground);

    expect(placements).toHaveLength(6);
    expect(ground).toHaveBeenCalledTimes(6);
    expect(player).toEqual(before);
    expect(placements.map((placement) => placement.label)).toEqual(
      LABORATORY_NATURE_PALETTE_CONFIG.map((asset) => asset.label),
    );
    for (const placement of placements) {
      expect(
        Object.values(placement).every(
          (value) =>
            typeof value === 'string' || typeof value === 'boolean' || Number.isFinite(value),
        ),
      ).toBe(true);
      expect(
        Math.hypot(placement.x - player.position.x, placement.z - player.position.z),
      ).toBeCloseTo(8.5);
    }
    for (let index = 1; index < placements.length; index++) {
      expect(
        Math.hypot(
          placements[index].x - placements[index - 1].x,
          placements[index].z - placements[index - 1].z,
        ),
      ).toBeGreaterThan(4);
    }
  });
});

describe('nature laboratory palette lifecycle', () => {
  it('loads each model once, adds exactly six grounded labeled clones, and remains fixed', async () => {
    const scene = new THREE.Scene();
    const source = modelSource();
    const deps = dependencies(source);
    const palette = requiredPalette(
      createLaboratoryNaturePalette(
        scene,
        () => 3.25,
        { DEV: true, VITE_ASSET_REPLACEMENT_LAB: '1' },
        deps,
      ),
    );
    const player = { position: { x: 4, z: 8 }, facing: Math.PI / 2 };

    await Promise.all([palette.initialize(player), palette.initialize(player)]);
    await palette.initialize({ position: { x: 100, z: 100 }, facing: 0 });

    expect(deps.load).toHaveBeenCalledTimes(6);
    expect(deps.load.mock.calls.map(([loadPath]) => loadPath)).toEqual(
      LABORATORY_NATURE_PALETTE_CONFIG.map((asset) => asset.loadPath),
    );
    expect(scene.children).toHaveLength(1);
    const root = scene.children[0] as THREE.Group;
    expect(root.name).toBe(LABORATORY_NATURE_PALETTE_LABEL);
    expect(root.children).toHaveLength(6);
    expect(root.children.map((asset) => asset.name)).toEqual(
      LABORATORY_NATURE_PALETTE_CONFIG.map((asset) => asset.label),
    );
    for (const asset of root.children) {
      expect(asset.children).toHaveLength(2);
      const label = asset.children[1];
      expect(label.name).toBe(asset.name);
      const expectedGround = asset.name === 'Bush_Flowers' ? 3.17 : 3.25;
      expect(
        new THREE.Box3().setFromObject(asset.children[0]).min.y + asset.position.y,
      ).toBeCloseTo(expectedGround);
    }
    expect(deps.createLabel).toHaveBeenCalledTimes(6);
    expect(deps.log).toHaveBeenCalledWith(LABORATORY_NATURE_PALETTE_LABEL);
    expect(deps.warn).not.toHaveBeenCalled();
    expect(source.parent).toBe(null);
  });

  it('cleans up labels and suppresses a late asynchronous add', async () => {
    const scene = new THREE.Scene();
    const deps = dependencies(modelSource());
    const palette = requiredPalette(
      createLaboratoryNaturePalette(
        scene,
        () => 0,
        { DEV: true, VITE_ASSET_REPLACEMENT_LAB: '1' },
        deps,
      ),
    );
    await palette.initialize({ position: { x: 0, z: 0 }, facing: 0 });
    palette.dispose();
    palette.dispose();
    expect(scene.children).toHaveLength(0);
    expect(deps.labels).toHaveLength(6);
    for (const label of deps.labels) {
      expect(label.textureDispose).toHaveBeenCalledOnce();
      expect(label.materialDispose).toHaveBeenCalledOnce();
    }

    let resolveLoad!: (value: { scene: THREE.Group }) => void;
    const deferred = new Promise<{ scene: THREE.Group }>((resolve) => {
      resolveLoad = resolve;
    });
    const lateScene = new THREE.Scene();
    const lateDeps = dependencies(modelSource());
    lateDeps.load.mockImplementation(() => deferred);
    const latePalette = requiredPalette(
      createLaboratoryNaturePalette(
        lateScene,
        () => 0,
        { DEV: true, VITE_ASSET_REPLACEMENT_LAB: '1' },
        lateDeps,
      ),
    );
    const initialization = latePalette.initialize({ position: { x: 0, z: 0 }, facing: 0 });
    latePalette.dispose();
    resolveLoad({ scene: modelSource() });
    await initialization;
    expect(lateScene.children).toHaveLength(0);
    expect(lateDeps.createLabel).not.toHaveBeenCalled();
  });
});

describe('nature laboratory palette boundaries', () => {
  it('keeps BirchTree_1 replacement resolution inactive in normal mode', () => {
    const registry = JSON.parse(
      readFileSync(path.join(repoRoot, 'config/asset-replacements.registry.json'), 'utf8'),
    ) as AssetReplacementRegistry;
    const birch = LABORATORY_NATURE_PALETTE_CONFIG[0];

    expect(resolveAssetReplacement({ path: birch.loadPath, registry }).path).toBe(birch.loadPath);
    expect(
      resolveAssetReplacement({ path: birch.loadPath, registry, mode: 'laboratory' }).path,
    ).toBe(birch.assetPath);
  });

  it('has no simulation, gameplay, collision, persistence, network, or picking surface', () => {
    const source = [
      'src/render/laboratory_nature_palette.ts',
      'src/render/laboratory_nature_palette_core.ts',
    ]
      .map((file) => readFileSync(path.join(repoRoot, file), 'utf8'))
      .join('\n');

    expect(source).not.toMatch(/from ['"][^'"]*(?:sim|net|server|game)[/'"]/);
    expect(source).not.toMatch(
      /\b(?:Collider|Hitbox|WebSocket|localStorage|sessionStorage|clickTargets|gatherNodeMeshes)\b/,
    );
    expect(source).not.toMatch(/(?:\.send\s*\(|fetch\s*\(|userData\.)/);
    expect(source).toContain("import { loadGltf } from './assets/loader';");
    expect(source).toContain('load: loadGltf');
  });

  it('wires palette cleanup into renderer reconstruction teardown', () => {
    const renderer = readFileSync(path.join(repoRoot, 'src/render/renderer.ts'), 'utf8');
    expect(renderer).toContain('this.laboratoryNaturePalette?.dispose();');
    const viewport = readFileSync(path.join(repoRoot, 'src/editor/3d/viewport.ts'), 'utf8');
    const rendererDispose = viewport.indexOf('this.renderer.dispose();');
    const webglDispose = viewport.indexOf('this.renderer.webgl.dispose();');
    expect(rendererDispose).toBeGreaterThan(-1);
    expect(webglDispose).toBeGreaterThan(rendererDispose);
  });
});
