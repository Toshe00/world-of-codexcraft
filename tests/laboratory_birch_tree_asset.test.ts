import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AssetReplacementRegistry } from '../src/assets/asset_replacement.mjs';
import {
  resolveAssetReplacement,
  validateAssetReplacementRegistry,
} from '../src/assets/asset_replacement.mjs';
import { MEDIA_ASSETS } from '../src/render/assets/manifest.generated';

const repoRoot = path.resolve(import.meta.dirname, '..');
const assetPath = 'models/environment/laboratory/birch_tree_1.glb';
const historicalPath = 'models/foliage/pine_3.glb';
const provenanceRuleId = 'quaternius-ultimate-stylized-nature-birch-tree-1';

interface GlbJson {
  animations?: unknown[];
  buffers?: { uri?: string }[];
  cameras?: unknown[];
  extensionsRequired?: string[];
  extensionsUsed?: string[];
  images?: { bufferView?: number; mimeType?: string; name?: string; uri?: string }[];
  materials?: {
    alphaMode?: string;
    doubleSided?: boolean;
    name?: string;
    normalTexture?: { index: number };
    pbrMetallicRoughness?: { baseColorTexture?: { index: number } };
  }[];
  nodes?: { extensions?: Record<string, unknown>; name?: string }[];
  scenes?: unknown[];
  textures?: { extensions?: { EXT_texture_webp?: { source: number } } }[];
}

function publicFile(relativePath: string): string {
  return path.join(repoRoot, 'public', ...relativePath.split('/'));
}

function parseGlbJson(bytes: Buffer): GlbJson {
  expect(bytes.subarray(0, 4).toString('ascii')).toBe('glTF');
  expect(bytes.readUInt32LE(4)).toBe(2);
  expect(bytes.readUInt32LE(8)).toBe(bytes.length);
  const jsonLength = bytes.readUInt32LE(12);
  expect(bytes.readUInt32LE(16)).toBe(0x4e4f534a);
  return JSON.parse(
    bytes
      .subarray(20, 20 + jsonLength)
      .toString('utf8')
      .trim(),
  ) as GlbJson;
}

function checkedInReplacementRegistry(): AssetReplacementRegistry {
  return JSON.parse(
    readFileSync(path.join(repoRoot, 'config/asset-replacements.registry.json'), 'utf8'),
  ) as AssetReplacementRegistry;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('BirchTree_1 laboratory GLB', () => {
  it('is autonomous, Meshopt-compressed, texture-complete, and free of unsafe paths or Draco', () => {
    const bytes = readFileSync(publicFile(assetPath));
    const json = parseGlbJson(bytes);

    expect(bytes.length).toBe(147_792);
    expect(json.extensionsUsed).toEqual(
      expect.arrayContaining(['EXT_meshopt_compression', 'EXT_texture_webp']),
    );
    expect(json.extensionsUsed).not.toContain('KHR_draco_mesh_compression');
    expect(json.extensionsRequired).not.toContain('KHR_draco_mesh_compression');
    expect(json.buffers?.length).toBeGreaterThan(0);
    for (const buffer of json.buffers ?? []) expect(buffer.uri).toBeUndefined();
    expect(json.images?.map((image) => image.name)).toEqual([
      'BirchTree_Bark_Normal',
      'BirchTree_Bark',
      'BirchTree_Leaves',
    ]);
    for (const image of json.images ?? []) {
      expect(image.bufferView).toBeTypeOf('number');
      expect(image.mimeType).toBe('image/webp');
      expect(image.uri).toBeUndefined();
    }

    const materials = new Map((json.materials ?? []).map((material) => [material.name, material]));
    const textureImageName = (textureIndex: number | undefined): string | undefined => {
      if (textureIndex === undefined) return undefined;
      const imageIndex = json.textures?.[textureIndex]?.extensions?.EXT_texture_webp?.source;
      return imageIndex === undefined ? undefined : json.images?.[imageIndex]?.name;
    };
    expect(materials.get('BirchTree_Bark')).toMatchObject({
      normalTexture: { index: expect.any(Number) },
      pbrMetallicRoughness: { baseColorTexture: { index: expect.any(Number) } },
    });
    expect(materials.get('BirchTree_Leaves')).toMatchObject({
      alphaMode: 'BLEND',
      doubleSided: true,
      pbrMetallicRoughness: { baseColorTexture: { index: expect.any(Number) } },
    });
    expect(
      textureImageName(
        materials.get('BirchTree_Bark')?.pbrMetallicRoughness?.baseColorTexture?.index,
      ),
    ).toBe('BirchTree_Bark');
    expect(textureImageName(materials.get('BirchTree_Bark')?.normalTexture?.index)).toBe(
      'BirchTree_Bark_Normal',
    );
    expect(
      textureImageName(
        materials.get('BirchTree_Leaves')?.pbrMetallicRoughness?.baseColorTexture?.index,
      ),
    ).toBe('BirchTree_Leaves');
    expect(json.animations ?? []).toHaveLength(0);
    expect(json.cameras ?? []).toHaveLength(0);

    const serialized = JSON.stringify(json);
    expect(serialized).not.toMatch(/[A-Za-z]:[\\/]/);
    expect(serialized).not.toContain('file:');
    expect(serialized).not.toContain('http:');
    expect(serialized).not.toContain('https:');
  });

  it('loads through the project loader and Meshopt decoder with usable bounds', async () => {
    class SupportedWebpImage {
      height = 1;
      onerror: (() => void) | null = null;
      onload: (() => void) | null = null;

      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal('self', globalThis);
    vi.stubGlobal('Image', SupportedWebpImage);
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 512, height: 512, close: vi.fn() }) as unknown as ImageBitmap),
    );

    await MeshoptDecoder.ready;
    const bytes = readFileSync(publicFile(assetPath));
    const glbBody = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    const NativeRequest = globalThis.Request;
    class BrowserRelativeRequest extends NativeRequest {
      constructor(input: RequestInfo | URL, init?: RequestInit) {
        super(
          typeof input === 'string' && input.startsWith('/') ? `http://localhost${input}` : input,
          init,
        );
      }
    }
    vi.stubGlobal('Request', BrowserRelativeRequest);
    vi.stubGlobal(
      'ProgressEvent',
      class {
        readonly lengthComputable: boolean;
        readonly loaded: number;
        readonly total: number;
        readonly type: string;

        constructor(type: string, init: ProgressEventInit = {}) {
          this.type = type;
          this.lengthComputable = init.lengthComputable ?? false;
          this.loaded = init.loaded ?? 0;
          this.total = init.total ?? 0;
        }
      },
    );
    const originalFetch = globalThis.fetch.bind(globalThis);
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (url === `http://localhost/${assetPath}`) {
          return Promise.resolve(
            new Response(glbBody, {
              headers: {
                'Content-Length': String(bytes.length),
                'Content-Type': 'model/gltf-binary',
              },
            }),
          );
        }
        return originalFetch(input, init);
      }),
    );

    const { loadGltf, releaseGltf } = await import('../src/render/assets/loader');
    const gltf = await loadGltf(`/${assetPath}`);

    expect(gltf.animations).toHaveLength(0);
    const materials = new Map<string, THREE.MeshStandardMaterial>();
    gltf.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        materials.set(material.name, material as THREE.MeshStandardMaterial);
      }
    });
    expect(materials.get('BirchTree_Bark')?.map).toBeTruthy();
    expect(materials.get('BirchTree_Bark')?.normalMap).toBeTruthy();
    expect(materials.get('BirchTree_Leaves')?.map).toBeTruthy();
    expect(materials.get('BirchTree_Leaves')?.transparent).toBe(true);
    expect(materials.get('BirchTree_Leaves')?.side).toBe(THREE.DoubleSide);

    const bounds = new THREE.Box3().setFromObject(gltf.scene);
    const size = bounds.getSize(new THREE.Vector3());
    expect(bounds.min.y).toBeGreaterThan(-0.03);
    expect(bounds.min.y).toBeLessThanOrEqual(0);
    expect(size.y).toBeGreaterThan(5);
    expect(size.y).toBeGreaterThan(size.x);
    expect(size.y).toBeGreaterThan(size.z);
    releaseGltf(`/${assetPath}`);
  });

  it('is the only planned media inventory addition for this laboratory directory', () => {
    expect(Object.keys(MEDIA_ASSETS)).toHaveLength(1_068);
    expect(MEDIA_ASSETS[assetPath]).toContain('birch_tree_1.9e48caadd4ee.glb');
    expect(readdirSync(path.dirname(publicFile(assetPath))).sort()).toEqual([
      'birch_tree_1.glb',
      'nature_palette_01',
    ]);
  });

  it('has precise declared CC0 provenance with the missing-proof warning', () => {
    const provenance = JSON.parse(
      readFileSync(path.join(repoRoot, 'docs/assets/provenance.registry.json'), 'utf8'),
    ) as { rules: Record<string, unknown>[] };
    const rule = provenance.rules.find((entry) => entry.id === provenanceRuleId);

    expect(rule).toMatchObject({
      category: 'model',
      sourceOrAuthor: 'Quaternius, Ultimate Stylized Nature Pack',
      declaredLicense: 'CC0-1.0',
      redistribution: 'allowed',
      commercialUse: 'allowed',
      status: 'reusable',
      coverage: { paths: [`public/${assetPath}`], expectedPathCount: 1 },
    });
    expect(JSON.stringify(rule)).toContain('absent or unverified');
    expect(JSON.stringify(rule)).toContain('before any public release');
    expect(JSON.stringify(rule)).toContain('without artistic modification');
  });

  it('stays inactive by default, selects Birch only in laboratory mode, and restores fallback', () => {
    const registry = checkedInReplacementRegistry();
    const rule = registry.replacements.find((entry) => entry.id === 'lab-birch-tree-1');
    expect(rule).toMatchObject({
      historicalPath,
      replacementPath: assetPath,
      status: 'laboratory',
      enabled: true,
    });

    expect(resolveAssetReplacement({ path: historicalPath, registry })).toMatchObject({
      path: historicalPath,
      historicalPath,
      fallbackPath: historicalPath,
      replaced: false,
      reason: 'laboratory-disabled',
    });
    expect(
      resolveAssetReplacement({ path: historicalPath, registry, mode: 'laboratory' }),
    ).toMatchObject({
      path: assetPath,
      historicalPath,
      fallbackPath: historicalPath,
      replaced: true,
      replacementIds: ['lab-birch-tree-1'],
    });

    const disabled = structuredClone(registry);
    disabled.replacements[0].enabled = false;
    expect(
      resolveAssetReplacement({ path: historicalPath, registry: disabled, mode: 'laboratory' }),
    ).toMatchObject({ path: historicalPath, replaced: false, reason: 'rule-inactive' });

    expect(
      validateAssetReplacementRegistry({
        registry,
        assetPaths: [historicalPath, assetPath],
        provenanceByPath: {
          [assetPath]: { ruleId: provenanceRuleId, status: 'reusable', approved: true },
        },
      }),
    ).toMatchObject({
      ok: true,
      activeCount: 1,
      productionActiveCount: 0,
      laboratoryCount: 1,
      errors: [],
    });
  });

  it('activates through the Vite development adapter only with the explicit local flag', async () => {
    vi.stubEnv('VITE_ASSET_REPLACEMENT_LAB', '');
    vi.resetModules();
    let runtime = await import('../src/assets/runtime');
    expect(runtime.ASSET_REPLACEMENT_LAB_ENABLED).toBe(false);
    expect(runtime.resolveRuntimeAssetPath(historicalPath)).toBe(historicalPath);

    vi.stubEnv('VITE_ASSET_REPLACEMENT_LAB', '1');
    vi.resetModules();
    runtime = await import('../src/assets/runtime');
    expect(runtime.ASSET_REPLACEMENT_LAB_ENABLED).toBe(true);
    expect(runtime.resolveRuntimeAssetPath(historicalPath)).toBe(assetPath);

    vi.stubEnv('VITE_ASSET_REPLACEMENT_LAB', '');
    vi.resetModules();
    runtime = await import('../src/assets/runtime');
    expect(runtime.ASSET_REPLACEMENT_LAB_ENABLED).toBe(false);
    expect(runtime.resolveRuntimeAssetPath(historicalPath)).toBe(historicalPath);
  });

  it('pins the untouched historical fallback bytes', () => {
    const digest = createHash('sha256')
      .update(readFileSync(publicFile(historicalPath)))
      .digest('hex');
    expect(digest).toBe('e28e675d78731051c8e721f4c6bf68282270151eb087778c4aed8979a0c156a3');
  });
});
