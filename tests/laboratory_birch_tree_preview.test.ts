import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { AssetReplacementRegistry } from '../src/assets/asset_replacement.mjs';
import { resolveAssetReplacement } from '../src/assets/asset_replacement.mjs';
import {
  createLaboratoryBirchPreview,
  LABORATORY_BIRCH_HISTORICAL_PATH,
  LABORATORY_BIRCH_PREVIEW_LABEL,
  type LaboratoryBirchPreview,
} from '../src/render/laboratory_birch_preview';
import {
  LABORATORY_BIRCH_PREVIEW_CONFIG,
  laboratoryBirchPlacement,
  laboratoryBirchPreviewEnabled,
  validLaboratoryBirchPreviewConfig,
} from '../src/render/laboratory_birch_preview_core';

const repoRoot = path.resolve(import.meta.dirname, '..');

function modelSource(): THREE.Group {
  const source = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.7 });
  material.name = 'BirchTree_Leaves';
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 6, 2), material);
  mesh.position.y = 2.5;
  source.add(mesh);
  return source;
}

function dependencies(source: THREE.Group) {
  return {
    load: vi.fn(async () => ({ scene: source })),
    log: vi.fn(),
    warn: vi.fn(),
  };
}

function requiredPreview(preview: LaboratoryBirchPreview | null): LaboratoryBirchPreview {
  expect(preview).not.toBe(null);
  if (!preview) throw new Error('laboratory preview was not created');
  return preview;
}

describe('laboratory birch preview activation', () => {
  it('stays disabled without the laboratory flag and in production', () => {
    expect(laboratoryBirchPreviewEnabled({ DEV: true })).toBe(false);
    expect(laboratoryBirchPreviewEnabled({ DEV: false, VITE_ASSET_REPLACEMENT_LAB: '1' })).toBe(
      false,
    );

    const scene = new THREE.Scene();
    const deps = dependencies(modelSource());
    expect(createLaboratoryBirchPreview(scene, () => 0, { DEV: true }, deps)).toBe(null);
    expect(
      createLaboratoryBirchPreview(
        scene,
        () => 0,
        { DEV: false, VITE_ASSET_REPLACEMENT_LAB: '1' },
        deps,
      ),
    ).toBe(null);
    expect(deps.load).not.toHaveBeenCalled();
    expect(scene.children).toHaveLength(0);
  });

  it('enables only for a development build with the explicit flag', () => {
    expect(laboratoryBirchPreviewEnabled({ DEV: true, VITE_ASSET_REPLACEMENT_LAB: '1' })).toBe(
      true,
    );
  });
});

describe('laboratory birch preview placement', () => {
  it('uses finite development settings and never mutates the player input', () => {
    const player = Object.freeze({
      position: Object.freeze({ x: 10, z: 20 }),
      facing: 0,
    });
    const before = structuredClone(player);
    const placement = laboratoryBirchPlacement(player, (x, z) => x * 0.1 + z * 0.2);

    expect(validLaboratoryBirchPreviewConfig(LABORATORY_BIRCH_PREVIEW_CONFIG)).toBe(true);
    for (const invalid of [
      { forwardDistance: Number.NaN },
      { forwardDistance: 4.99 },
      { forwardDistance: 8.01 },
      { lateralOffset: 0 },
      { scale: 0 },
      { rotationY: Number.POSITIVE_INFINITY },
    ]) {
      expect(
        validLaboratoryBirchPreviewConfig({
          ...LABORATORY_BIRCH_PREVIEW_CONFIG,
          ...invalid,
        }),
      ).toBe(false);
    }
    expect(placement).toMatchObject({ x: 12, z: 26.5, scale: 1, shadows: true });
    expect(placement.y).toBeCloseTo(6.5);
    expect(
      Object.values(placement).every(
        (value) => typeof value === 'boolean' || Number.isFinite(value),
      ),
    ).toBe(true);
    expect(player).toEqual(before);
  });
});

describe('laboratory birch preview lifecycle', () => {
  it('loads the historical path once, creates one grounded clone, and remains fixed', async () => {
    const scene = new THREE.Scene();
    const source = modelSource();
    const sourceMaterial = (source.children[0] as THREE.Mesh).material;
    const deps = dependencies(source);
    const preview = requiredPreview(
      createLaboratoryBirchPreview(
        scene,
        () => 3.25,
        { DEV: true, VITE_ASSET_REPLACEMENT_LAB: '1' },
        deps,
      ),
    );

    const player = { position: { x: 4, z: 8 }, facing: Math.PI / 2 };
    await Promise.all([preview.initialize(player), preview.initialize(player)]);
    await preview.initialize({ position: { x: 100, z: 100 }, facing: 0 });

    expect(deps.load).toHaveBeenCalledTimes(1);
    expect(deps.load).toHaveBeenCalledWith(LABORATORY_BIRCH_HISTORICAL_PATH);
    expect(LABORATORY_BIRCH_HISTORICAL_PATH).toBe('models/foliage/pine_3.glb');
    expect(scene.children).toHaveLength(1);
    const instance = scene.children[0] as THREE.Group;
    const renderedModel = instance.children[0] as THREE.Group;
    const renderedMesh = renderedModel.children[0] as THREE.Mesh;
    expect(instance.name).toBe(LABORATORY_BIRCH_PREVIEW_LABEL);
    expect(instance.position.toArray()).toEqual([10.5, 3.25, 6]);
    expect(new THREE.Box3().setFromObject(instance).min.y).toBeCloseTo(3.25);
    expect(renderedModel.scale.toArray()).toEqual([1, 1, 1]);
    expect(renderedModel.rotation.y).toBeCloseTo(Math.PI / 8);
    expect(renderedMesh.castShadow).toBe(true);
    expect(renderedMesh.receiveShadow).toBe(true);
    expect(deps.log).toHaveBeenCalledOnce();
    expect(deps.log).toHaveBeenCalledWith('Birch laboratory preview');
    expect(deps.warn).not.toHaveBeenCalled();
    expect(source.parent).toBe(null);
    expect(source.position.toArray()).toEqual([0, 0, 0]);
    expect(renderedMesh.material).toBe(sourceMaterial);
    expect((source.children[0] as THREE.Mesh).material).toBe(sourceMaterial);
    expect((sourceMaterial as THREE.Material).transparent).toBe(true);
    expect(instance.userData).toEqual({});
  });

  it('removes the instance on cleanup and suppresses a late asynchronous add', async () => {
    const scene = new THREE.Scene();
    const source = modelSource();
    const deps = dependencies(source);
    const preview = requiredPreview(
      createLaboratoryBirchPreview(
        scene,
        () => 0,
        { DEV: true, VITE_ASSET_REPLACEMENT_LAB: '1' },
        deps,
      ),
    );
    await preview.initialize({ position: { x: 0, z: 0 }, facing: 0 });
    preview.dispose();
    preview.dispose();
    expect(scene.children).toHaveLength(0);

    let resolveLoad!: (value: { scene: THREE.Group }) => void;
    const deferred = new Promise<{ scene: THREE.Group }>((resolve) => {
      resolveLoad = resolve;
    });
    const lateScene = new THREE.Scene();
    const latePreview = requiredPreview(
      createLaboratoryBirchPreview(
        lateScene,
        () => 0,
        { DEV: true, VITE_ASSET_REPLACEMENT_LAB: '1' },
        { load: vi.fn(() => deferred), log: vi.fn(), warn: vi.fn() },
      ),
    );
    const initialization = latePreview.initialize({ position: { x: 0, z: 0 }, facing: 0 });
    latePreview.dispose();
    resolveLoad({ scene: modelSource() });
    await initialization;
    expect(lateScene.children).toHaveLength(0);
  });
});

describe('laboratory birch preview boundaries', () => {
  it('keeps real replacement resolution on the historical model path', () => {
    const registry = JSON.parse(
      readFileSync(path.join(repoRoot, 'config/asset-replacements.registry.json'), 'utf8'),
    ) as AssetReplacementRegistry;

    expect(resolveAssetReplacement({ path: LABORATORY_BIRCH_HISTORICAL_PATH, registry }).path).toBe(
      LABORATORY_BIRCH_HISTORICAL_PATH,
    );
    expect(
      resolveAssetReplacement({
        path: LABORATORY_BIRCH_HISTORICAL_PATH,
        registry,
        mode: 'laboratory',
      }).path,
    ).toBe('models/environment/laboratory/birch_tree_1.glb');
  });

  it('has no simulation, gameplay, collision, persistence, or network surface', () => {
    const source = [
      'src/render/laboratory_birch_preview.ts',
      'src/render/laboratory_birch_preview_core.ts',
    ]
      .map((file) => readFileSync(path.join(repoRoot, file), 'utf8'))
      .join('\n');

    expect(source).not.toMatch(/from ['"][^'"]*(?:sim|net|server|game)[/'"]/);
    expect(source).not.toMatch(/\b(?:Collider|Hitbox|WebSocket|localStorage|sessionStorage)\b/);
    expect(source).not.toMatch(/(?:\.send\s*\(|fetch\s*\()/);
    expect(source).toContain("import { loadGltf } from './assets/loader';");
    expect(source).toContain('load: loadGltf');
    expect(source).not.toContain('models/environment/laboratory/birch_tree_1.glb');
  });

  it('wires preview cleanup into renderer reconstruction teardown', () => {
    const source = readFileSync(path.join(repoRoot, 'src/editor/3d/viewport.ts'), 'utf8');
    const previewDispose = source.indexOf('this.renderer.dispose();');
    const webglDispose = source.indexOf('this.renderer.webgl.dispose();');

    expect(previewDispose).toBeGreaterThan(-1);
    expect(webglDispose).toBeGreaterThan(previewDispose);
  });
});
