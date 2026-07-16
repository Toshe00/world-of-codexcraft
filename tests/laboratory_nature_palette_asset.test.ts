import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MEDIA_ASSETS } from '../src/render/assets/manifest.generated';
import { LABORATORY_NATURE_PALETTE_CONFIG } from '../src/render/laboratory_nature_palette_core';

const repoRoot = path.resolve(import.meta.dirname, '..');
const paletteRoot = 'models/environment/laboratory/nature_palette_01';

const assets = [
  {
    bytes: 176_508,
    file: 'birch_tree_2.glb',
    images: ['BirchTree_Bark_Normal', 'BirchTree_Bark', 'BirchTree_Leaves'],
    ruleId: 'quaternius-ultimate-stylized-nature-birch-tree-2',
  },
  {
    bytes: 78_892,
    file: 'bush_flowers.glb',
    images: ['Bush_Leaves', 'Flowers'],
    ruleId: 'quaternius-ultimate-stylized-nature-bush-flowers',
  },
  {
    bytes: 70_060,
    file: 'dead_tree_2.glb',
    images: ['NormalTree_Bark_Normal', 'NormalTree_Bark'],
    ruleId: 'quaternius-ultimate-stylized-nature-dead-tree-2',
  },
  {
    bytes: 44_492,
    file: 'flower_1_clump.glb',
    images: ['Flowers'],
    ruleId: 'quaternius-ultimate-stylized-nature-flower-1-clump',
  },
  {
    bytes: 5_648,
    file: 'grass_large.glb',
    images: ['Grass'],
    ruleId: 'quaternius-ultimate-stylized-nature-grass-large',
  },
] as const;

interface GlbJson {
  animations?: unknown[];
  buffers?: { uri?: string }[];
  cameras?: unknown[];
  extensionsRequired?: string[];
  extensionsUsed?: string[];
  images?: { bufferView?: number; mimeType?: string; name?: string; uri?: string }[];
}

function assetPath(file: string): string {
  return `${paletteRoot}/${file}`;
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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('nature palette laboratory GLBs', () => {
  it('contains exactly five autonomous Meshopt GLBs with embedded WebP textures and no Draco', () => {
    expect(readdirSync(publicFile(paletteRoot)).sort()).toEqual(assets.map((asset) => asset.file));

    for (const asset of assets) {
      const bytes = readFileSync(publicFile(assetPath(asset.file)));
      const json = parseGlbJson(bytes);
      expect(bytes.length, asset.file).toBe(asset.bytes);
      expect(json.extensionsUsed, asset.file).toEqual(
        expect.arrayContaining(['EXT_meshopt_compression', 'EXT_texture_webp']),
      );
      expect(json.extensionsUsed, asset.file).not.toContain('KHR_draco_mesh_compression');
      expect(json.extensionsRequired, asset.file).not.toContain('KHR_draco_mesh_compression');
      expect(json.buffers?.length, asset.file).toBeGreaterThan(0);
      for (const buffer of json.buffers ?? []) expect(buffer.uri, asset.file).toBeUndefined();
      expect(
        json.images?.map((image) => image.name),
        asset.file,
      ).toEqual(asset.images);
      for (const image of json.images ?? []) {
        expect(image.bufferView, asset.file).toBeTypeOf('number');
        expect(image.mimeType, asset.file).toBe('image/webp');
        expect(image.uri, asset.file).toBeUndefined();
      }
      expect(json.animations ?? [], asset.file).toHaveLength(0);
      expect(json.cameras ?? [], asset.file).toHaveLength(0);
      expect(JSON.stringify(json), asset.file).not.toMatch(/(?:[A-Za-z]:[\\/]|file:|https?:)/);
    }
  });

  it('loads all five through the existing loader and Meshopt decoder with grounded usable bounds', async () => {
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
    const bytesByUrl = new Map<string, Buffer>(
      assets.map((asset) => {
        const logical = assetPath(asset.file);
        const bytes = readFileSync(publicFile(logical));
        return [`http://localhost/${logical}`, bytes] as const;
      }),
    );
    const originalFetch = globalThis.fetch.bind(globalThis);
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        const bytes = bytesByUrl.get(url);
        if (!bytes) return originalFetch(input, init);
        const body = bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ) as ArrayBuffer;
        return Promise.resolve(
          new Response(body, {
            headers: {
              'Content-Length': String(bytes.length),
              'Content-Type': 'model/gltf-binary',
            },
          }),
        );
      }),
    );

    await MeshoptDecoder.ready;
    const { loadGltf, releaseGltf } = await import('../src/render/assets/loader');
    for (const asset of assets) {
      const logical = assetPath(asset.file);
      const gltf = await loadGltf(`/${logical}`);
      let meshCount = 0;
      gltf.scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        meshCount++;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        expect(
          materials.some((material) => Boolean((material as THREE.MeshStandardMaterial).map)),
          asset.file,
        ).toBe(true);
      });
      const bounds = new THREE.Box3().setFromObject(gltf.scene);
      const size = bounds.getSize(new THREE.Vector3());
      expect(meshCount, asset.file).toBeGreaterThan(0);
      expect(Number.isFinite(bounds.min.y), asset.file).toBe(true);
      expect(size.y, asset.file).toBeGreaterThan(0.45);
      if (asset.file === 'flower_1_clump.glb' || asset.file === 'grass_large.glb') {
        const config = LABORATORY_NATURE_PALETTE_CONFIG.find(
          (entry) => entry.assetPath === logical,
        );
        expect(config, asset.file).toBeDefined();
        const renderedHeight = size.y * (config?.scale ?? 0);
        expect(renderedHeight, asset.file).toBeGreaterThan(0.6);
        expect(renderedHeight, asset.file).toBeLessThan(1.1);
      }
      releaseGltf(`/${logical}`);
    }
  });

  it('includes every palette GLB in the generated media manifest', () => {
    expect(Object.keys(MEDIA_ASSETS)).toHaveLength(1_068);
    for (const asset of assets) {
      const logical = assetPath(asset.file);
      expect(MEDIA_ASSETS[logical], asset.file).toMatch(
        new RegExp(`/media/${logical.replace('.glb', '\\.[a-f0-9]{12}\\.glb')}$`),
      );
    }
  });

  it('records the same declared CC0 documentation and release warning for every GLB', () => {
    const registry = JSON.parse(
      readFileSync(path.join(repoRoot, 'docs/assets/provenance.registry.json'), 'utf8'),
    ) as { rules: Record<string, unknown>[] };

    for (const asset of assets) {
      const rule = registry.rules.find((entry) => entry.id === asset.ruleId);
      expect(rule, asset.file).toMatchObject({
        attribution: 'not-required',
        commercialUse: 'allowed',
        declaredLicense: 'CC0-1.0',
        evidence: [
          {
            reference: 'operator-declared-source-metadata',
            type: 'manual-review',
          },
        ],
        knownRightsHolder: null,
        redistribution: 'allowed',
        sourceOrAuthor: 'Quaternius, Ultimate Stylized Nature Pack',
        status: 'reusable',
        transformationStatus: ['converted', 'optimized'],
      });
      expect(rule?.notes).toContain(
        'The local license proof is absent or unverified and must be checked before any public release.',
      );
    }
  });
});
