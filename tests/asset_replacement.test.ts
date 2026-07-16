import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveRuntimeAssetUrl } from '../src/assets';
import {
  type AssetReplacementRegistry,
  type AssetReplacementRule,
  inferAssetReplacementType,
  type ProvenanceDecision,
  resolveAssetReplacement,
  validateAssetReplacementRegistry,
} from '../src/assets/asset_replacement.mjs';
import { assetUrl } from '../src/render/assets/media';

const assets = [
  'audio/sfx/original.mp3',
  'audio/sfx/replacement.mp3',
  'models/creatures/a.glb',
  'models/creatures/b.glb',
  'models/creatures/c.glb',
  'textures/terrain/original.jpg',
  'textures/terrain/replacement.jpg',
  'ui/items/original.webp',
  'ui/items/replacement.webp',
];

const approvedProvenance: Record<string, ProvenanceDecision> = {
  'audio/sfx/replacement.mp3': {
    ruleId: 'fixture-approved-audio',
    status: 'reusable',
    approved: true,
  },
  'models/creatures/a.glb': {
    ruleId: 'fixture-approved-model-a',
    status: 'reusable',
    approved: true,
  },
  'models/creatures/b.glb': {
    ruleId: 'fixture-approved-model-b',
    status: 'attribution-required',
    approved: true,
  },
  'models/creatures/c.glb': {
    ruleId: 'fixture-approved-model-c',
    status: 'reusable',
    approved: true,
  },
  'textures/terrain/replacement.jpg': {
    ruleId: 'fixture-approved-texture',
    status: 'attribution-required',
    approved: true,
  },
  'ui/items/replacement.webp': {
    ruleId: 'fixture-approved-ui',
    status: 'reusable',
    approved: true,
  },
};

function rule(overrides: Partial<AssetReplacementRule> = {}): AssetReplacementRule {
  return {
    id: 'fixture-model-swap',
    historicalPath: 'models/creatures/a.glb',
    replacementPath: 'models/creatures/b.glb',
    type: 'model-glb',
    status: 'approved',
    reason: 'Artificial fixture used to pin the replacement contract.',
    provenanceRuleId: 'fixture-approved-model-b',
    enabled: true,
    platforms: ['web', 'desktop', 'android', 'ios'],
    plannedFor: 'test-fixture',
    notes: ['No real asset is referenced by this fixture.'],
    rollbackStrategy: 'Set enabled to false and retain the historical path.',
    ...overrides,
  };
}

function registry(replacements: AssetReplacementRule[] = []): AssetReplacementRegistry {
  return {
    registryVersion: 1,
    policy: {
      productionActivationAllowed: true,
      laboratoryActivationEnv: 'VITE_ASSET_REPLACEMENT_LAB',
    },
    replacements,
  };
}

function validate(value: AssetReplacementRegistry) {
  return validateAssetReplacementRegistry({
    registry: value,
    assetPaths: assets,
    provenanceByPath: approvedProvenance,
  });
}

function resolve(
  value: AssetReplacementRegistry,
  pathValue = 'models/creatures/a.glb',
  mode: 'production' | 'laboratory' = 'production',
) {
  return resolveAssetReplacement({
    path: pathValue,
    registry: value,
    mode,
    assetPaths: assets,
    provenanceByPath: approvedProvenance,
  });
}

describe('asset replacement resolution', () => {
  it('returns the historical path when no rule exists', () => {
    expect(resolve(registry())).toMatchObject({
      path: 'models/creatures/a.glb',
      historicalPath: 'models/creatures/a.glb',
      replaced: false,
      reason: 'not-configured',
    });
  });

  it('keeps an inactive rule on the historical path', () => {
    const result = resolve(registry([rule({ status: 'inactive', enabled: false })]));
    expect(result.path).toBe('models/creatures/a.glb');
    expect(result.reason).toBe('rule-inactive');
  });

  it('does not activate a laboratory rule by default', () => {
    const value = registry([rule({ status: 'laboratory' })]);
    expect(resolve(value).path).toBe('models/creatures/a.glb');
    expect(resolve(value).reason).toBe('laboratory-disabled');
    expect(resolve(value, 'models/creatures/a.glb', 'laboratory').path).toBe(
      'models/creatures/b.glb',
    );
  });

  it('returns the target for an enabled, valid approved rule', () => {
    expect(resolve(registry([rule()]))).toMatchObject({
      path: 'models/creatures/b.glb',
      historicalPath: 'models/creatures/a.glb',
      replaced: true,
      reason: 'replacement-applied',
      replacementIds: ['fixture-model-swap'],
    });
  });

  it('rejects production activation while the checked-in policy is locked', () => {
    const value = registry([rule()]);
    value.policy.productionActivationAllowed = false;
    expect(validate(value).errors.map((error) => error.code)).toContain(
      'production-activation-forbidden',
    );
  });

  it.each([
    'C:/absolute/model.glb',
    '/models/creatures/a.glb',
    '\\\\server\\share\\a.glb',
  ])('refuses the absolute path %s', (unsafePath) => {
    expect(() => resolve(registry(), unsafePath)).toThrow(/portable asset path/i);
  });

  it.each([
    '../models/a.glb',
    'models/../a.glb',
    './models/a.glb',
  ])('refuses directory traversal in %s', (unsafePath) => {
    expect(() => resolve(registry(), unsafePath)).toThrow(/portable asset path/i);
  });

  it('refuses double-encoded traversal and Windows separators', () => {
    expect(() => resolve(registry(), 'models/%252e%252e%255csecrets.glb')).toThrow(
      /portable asset path/i,
    );
  });

  it('rejects an incorrectly cased path', () => {
    const result = validate(registry([rule({ replacementPath: 'models/creatures/B.glb' })]));
    expect(result.errors.map((error) => error.code)).toContain('path-case-mismatch');
  });

  it('rejects a replacement to the same file', () => {
    const result = validate(
      registry([
        rule({
          replacementPath: 'models/creatures/a.glb',
          provenanceRuleId: 'fixture-approved-model-a',
        }),
      ]),
    );
    expect(result.errors.map((error) => error.code)).toContain('self-replacement');
  });

  it('rejects a replacement cycle', () => {
    const result = validate(
      registry([
        rule(),
        rule({
          id: 'fixture-model-swap-back',
          historicalPath: 'models/creatures/b.glb',
          replacementPath: 'models/creatures/a.glb',
          provenanceRuleId: 'fixture-approved-model-a',
        }),
      ]),
    );
    expect(result.errors.map((error) => error.code)).toContain('replacement-cycle');
  });

  it('rejects two rules for the same historical path', () => {
    const result = validate(registry([rule(), rule({ id: 'fixture-model-swap-duplicate' })]));
    expect(result.errors.map((error) => error.code)).toContain('ambiguous-source');
  });

  it('rejects duplicate rule ids and missing historical assets', () => {
    const duplicate = validate(
      registry([
        rule(),
        rule({
          historicalPath: 'models/creatures/c.glb',
          replacementPath: 'models/creatures/a.glb',
          provenanceRuleId: 'fixture-approved-model-a',
        }),
      ]),
    );
    const missingSource = validate(
      registry([rule({ historicalPath: 'models/creatures/missing.glb' })]),
    );
    expect(duplicate.errors.map((error) => error.code)).toContain('duplicate-rule-id');
    expect(missingSource.errors.map((error) => error.code)).toContain('missing-asset');
  });

  it('rejects a missing replacement target', () => {
    const result = validate(
      registry([
        rule({
          replacementPath: 'models/creatures/missing.glb',
          provenanceRuleId: 'fixture-missing',
        }),
      ]),
    );
    expect(result.errors.map((error) => error.code)).toContain('missing-asset');
  });

  it('rejects a target without provenance', () => {
    const provenanceByPath = { ...approvedProvenance };
    delete provenanceByPath['models/creatures/b.glb'];
    const result = validateAssetReplacementRegistry({
      registry: registry([rule()]),
      assetPaths: assets,
      provenanceByPath,
    });
    expect(result.errors.map((error) => error.code)).toContain('missing-provenance');
  });

  it('rejects a target whose rights are blocked', () => {
    const result = validateAssetReplacementRegistry({
      registry: registry([rule()]),
      assetPaths: assets,
      provenanceByPath: {
        ...approvedProvenance,
        'models/creatures/b.glb': {
          ruleId: 'fixture-approved-model-b',
          status: 'blocked-pending-proof',
          approved: false,
        },
      },
    });
    expect(result.errors.map((error) => error.code)).toContain('blocked-provenance');
  });

  it('rejects a provenance rule id mismatch', () => {
    const result = validate(registry([rule({ provenanceRuleId: 'fixture-wrong-rule' })]));
    expect(result.errors.map((error) => error.code)).toContain('provenance-rule-mismatch');
  });

  it('accepts a target with approved provenance in an artificial fixture', () => {
    expect(validate(registry([rule()]))).toMatchObject({
      ok: true,
      activeCount: 1,
    });
  });

  it('rejects a resource type change', () => {
    const result = validate(
      registry([
        rule({
          replacementPath: 'textures/terrain/replacement.jpg',
          provenanceRuleId: 'fixture-approved-texture',
        }),
      ]),
    );
    expect(result.errors.map((error) => error.code)).toContain('incompatible-resource-type');
  });

  it.each([
    ['models/creatures/a.glb', 'model-glb'],
    ['textures/terrain/original.jpg', 'texture'],
    ['ui/items/original.webp', 'ui-image'],
    ['audio/sfx/original.mp3', 'audio'],
    ['fonts/fixture.woff2', 'font'],
    ['env/fixture.hdr', 'environment'],
    ['static/fixture.json', 'other-static'],
  ] as const)('classifies %s as %s', (assetPath, expectedType) => {
    expect(inferAssetReplacementType(assetPath)).toBe(expectedType);
  });

  it('is deterministic and does not mutate its input object', () => {
    const request = {
      path: 'models/creatures/a.glb',
      registry: registry([rule()]),
      mode: 'production' as const,
      assetPaths: [...assets],
      provenanceByPath: structuredClone(approvedProvenance),
    };
    const before = structuredClone(request);
    const first = resolveAssetReplacement(request);
    const second = resolveAssetReplacement(request);
    expect(first).toEqual(second);
    expect(request).toEqual(before);
  });
});

describe('real asset replacement registry', () => {
  const repoRoot = path.resolve(__dirname, '..');
  const realRegistry = JSON.parse(
    readFileSync(path.join(repoRoot, 'config/asset-replacements.registry.json'), 'utf8'),
  ) as AssetReplacementRegistry;

  it('contains no enabled replacement and preserves representative historical paths', () => {
    expect(realRegistry.replacements.filter((entry) => entry.enabled)).toHaveLength(0);
    for (const historicalPath of [
      'models/chars/players/knight.glb',
      'textures/water/Water_1_M_Normal.jpg',
      'audio/main-theme.mp3',
      'ui/items/backpack.webp',
    ]) {
      expect(
        resolveAssetReplacement({
          path: historicalPath,
          registry: realRegistry,
        }),
      ).toMatchObject({
        path: historicalPath,
        replaced: false,
        reason: 'not-configured',
      });
    }
  });

  it('keeps current runtime URLs and media-manifest inputs unchanged', () => {
    expect(resolveRuntimeAssetUrl('/audio/main-theme.mp3')).toBe('/audio/main-theme.mp3');
    expect(resolveRuntimeAssetUrl('/ui/items/backpack.webp?revision=1')).toBe(
      '/ui/items/backpack.webp?revision=1',
    );
    expect(assetUrl('/models/chars/players/knight.glb')).toBe('/models/chars/players/knight.glb');
  });

  it('wires each covered loader family through the centralized runtime resolver', () => {
    const expectedWiring = [
      ['src/render/assets/media.ts', 'resolveRuntimeAssetPath(logicalPath(url))'],
      ['src/game/sfx.ts', 'fetch(resolveRuntimeAssetUrl(variant.url))'],
      ['src/game/voice.ts', 'this.el.src = resolveRuntimeAssetUrl(src)'],
      ['src/game/music.ts', 'new Audio(resolveRuntimeAssetUrl(url))'],
      [
        'src/assets/runtime.ts',
        "import.meta.env.DEV && import.meta.env.VITE_ASSET_REPLACEMENT_LAB === '1'",
      ],
      ['src/main.ts', "new Audio(resolveRuntimeAssetUrl('/audio/main-theme.mp3'))"],
      ['src/ui/icons.ts', 'resolveRuntimeAssetUrl(`'],
      ['src/ui/emote_icons.ts', 'resolveRuntimeAssetUrl(`'],
      ['src/ui/daily_rewards_window.ts', 'resolveRuntimeAssetUrl(row.art)'],
    ] as const;

    for (const [relativePath, marker] of expectedWiring) {
      expect(readFileSync(path.join(repoRoot, relativePath), 'utf8')).toContain(marker);
    }
  });
});
