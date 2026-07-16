import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  type AssetProvenanceRegistry,
  DECLARED_LICENSES,
  formatAssetProvenanceReport,
  PROVENANCE_STATUSES,
  type ProvenanceRule,
  verifyAssetProvenance,
} from '../scripts/lib/asset_provenance.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');
const temporaryDirectories: string[] = [];

function fixtureRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'codexcraft-provenance-'));
  temporaryDirectories.push(root);
  return root;
}

function writeFixtureFile(root: string, relativePath: string, content = 'fixture'): void {
  const absolutePath = path.join(root, ...relativePath.split('/'));
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content);
}

function pathInventoryHash(paths: string[]): string {
  return createHash('sha256')
    .update([...paths].sort().join('\n'))
    .digest('hex');
}

function reusableRule(
  id: string,
  paths: string[],
  coveredAssets: string[] = ['public/known.png'],
): ProvenanceRule {
  return {
    id,
    category: 'art',
    coverage: {
      paths,
      embeddedAssetIds: [],
      expectedPathCount: coveredAssets.length,
      pathInventorySha256: pathInventoryHash(coveredAssets),
    },
    sourceOrAuthor: 'Fixture Author',
    provenanceUrl: 'https://example.com/source',
    declaredLicense: 'CC0-1.0',
    evidence: [
      {
        type: 'source-url',
        reference: 'https://example.com/source',
        description: 'Synthetic test evidence.',
      },
    ],
    knownRightsHolder: 'Fixture Author',
    attribution: 'not-required',
    redistribution: 'allowed',
    commercialUse: 'allowed',
    transformationStatus: ['unmodified'],
    status: 'reusable',
    justification: 'The fixture declares a documented CC0 source.',
    notes: [],
  };
}

function fixtureRegistry(rules: ProvenanceRule[]): AssetProvenanceRegistry {
  return {
    $schema: 'docs/assets/provenance.schema.json',
    registryVersion: 1,
    scope: {
      roots: [{ path: 'public', include: ['**/*.png'] }],
      files: [],
      nonAssetExclusions: [],
      embeddedAssets: [],
    },
    rules,
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('asset provenance verifier', () => {
  it('accepts exactly one valid rule per scoped asset and summarizes statuses', () => {
    const root = fixtureRoot();
    writeFixtureFile(root, 'public/known.png');

    const result = verifyAssetProvenance({
      repoRoot: root,
      registry: fixtureRegistry([reusableRule('fixture-cc0', ['public/**/*.png'])]),
    });

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.scopedAssetCount).toBe(1);
    expect(result.summaryByStatus).toEqual({ reusable: 1 });
    expect(formatAssetProvenanceReport(result)).toContain('reusable: 1');
  });

  it('fails after an unregistered asset is added to the scoped fixture', () => {
    const root = fixtureRoot();
    writeFixtureFile(root, 'public/known.png');
    const registry = fixtureRegistry([reusableRule('known-only', ['public/known.png'])]);

    expect(verifyAssetProvenance({ repoRoot: root, registry }).ok).toBe(true);

    writeFixtureFile(root, 'public/unregistered.png');
    const result = verifyAssetProvenance({ repoRoot: root, registry });

    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'uncovered', asset: 'public/unregistered.png' }),
    );
  });

  it('fails inventory locks when a broad rule silently absorbs a new asset', () => {
    const root = fixtureRoot();
    writeFixtureFile(root, 'public/known.png');
    const registry = fixtureRegistry([reusableRule('broad', ['public/**/*.png'])]);

    writeFixtureFile(root, 'public/newly-absorbed.png');
    const result = verifyAssetProvenance({ repoRoot: root, registry });

    expect(result.ok).toBe(false);
    expect(result.errors.map((error) => error.code)).toEqual(
      expect.arrayContaining(['rule-inventory-count-drift', 'rule-inventory-hash-drift']),
    );
  });

  it('fails when a broad non-asset exclusion silently absorbs a new file', () => {
    const root = fixtureRoot();
    writeFixtureFile(root, 'public/known.png');
    writeFixtureFile(root, 'public/metadata.json');
    const registry = fixtureRegistry([reusableRule('known', ['public/known.png'])]);
    registry.scope.roots[0].include = ['**/*'];
    registry.scope.nonAssetExclusions = [
      {
        id: 'fixture-metadata',
        paths: ['public/**/*.json'],
        justification: 'Synthetic non-asset metadata.',
        expectedPathCount: 1,
        pathInventorySha256: pathInventoryHash(['public/metadata.json']),
      },
    ];

    expect(verifyAssetProvenance({ repoRoot: root, registry }).ok).toBe(true);

    writeFixtureFile(root, 'public/art-data.json');
    const result = verifyAssetProvenance({ repoRoot: root, registry });
    expect(result.errors.map((error) => error.code)).toEqual(
      expect.arrayContaining(['exclusion-inventory-count-drift', 'exclusion-inventory-hash-drift']),
    );
  });

  it('locks embedded asset containers by content hash', () => {
    const root = fixtureRoot();
    writeFixtureFile(root, 'public/known.png');
    writeFixtureFile(root, 'src/icons.ts', 'export const icon = "first";\n');
    const embeddedAsset = 'embedded:inline-icons';
    const inlineRule = reusableRule('inline-icons', [], [embeddedAsset]);
    inlineRule.coverage.embeddedAssetIds = ['inline-icons'];
    const registry = fixtureRegistry([reusableRule('physical', ['public/known.png']), inlineRule]);
    registry.scope.embeddedAssets = [
      {
        id: 'inline-icons',
        container: 'src/icons.ts',
        description: 'Synthetic inline icons.',
        containerSha256: createHash('sha256')
          .update('export const icon = "first";\n')
          .digest('hex'),
      },
    ];

    expect(verifyAssetProvenance({ repoRoot: root, registry }).ok).toBe(true);

    writeFixtureFile(root, 'src/icons.ts', 'export const icon = "changed";\n');
    const result = verifyAssetProvenance({ repoRoot: root, registry });
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'embedded-container-drift', asset: 'inline-icons' }),
    );
  });

  it('fails when two rules ambiguously cover the same asset', () => {
    const root = fixtureRoot();
    writeFixtureFile(root, 'public/known.png');
    const result = verifyAssetProvenance({
      repoRoot: root,
      registry: fixtureRegistry([
        reusableRule('broad', ['public/**/*.png']),
        reusableRule('exact', ['public/known.png']),
      ]),
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: 'ambiguous',
        asset: 'public/known.png',
        ruleIds: ['broad', 'exact'],
      }),
    );
  });

  it('rejects empty path rules and unsupported controlled values', () => {
    const root = fixtureRoot();
    writeFixtureFile(root, 'public/known.png');
    const invalid = reusableRule('invalid', ['public/missing.png'], []) as unknown as {
      status: string;
      declaredLicense: string;
      justification: string;
    };
    invalid.status = 'probably-fine';
    invalid.declaredLicense = 'A license someone remembered';
    invalid.justification = '';

    const result = verifyAssetProvenance({
      repoRoot: root,
      registry: fixtureRegistry([invalid as ProvenanceRule]),
    });

    expect(result.ok).toBe(false);
    expect(result.errors.map((error) => error.code)).toEqual(
      expect.arrayContaining([
        'empty-rule-path',
        'invalid-license',
        'invalid-status',
        'missing-justification',
        'uncovered',
      ]),
    );
  });

  it('enforces schema shape, kebab-case ids, and unique transformation values', () => {
    const root = fixtureRoot();
    writeFixtureFile(root, 'public/known.png');
    const invalid = reusableRule('valid-before-mutation', ['public/known.png']) as unknown as {
      id: string;
      transformationStatus: string[];
      unexpected: boolean;
    };
    invalid.id = 'Bad Id';
    invalid.transformationStatus = ['unmodified', 'unmodified'];
    invalid.unexpected = true;

    const result = verifyAssetProvenance({
      repoRoot: root,
      registry: fixtureRegistry([invalid as unknown as ProvenanceRule]),
    });

    expect(result.errors.map((error) => error.code)).toEqual(
      expect.arrayContaining(['unexpected-property', 'invalid-rule-id', 'invalid-transformation']),
    );
  });

  it('rejects traversal, drive-qualified, backslash, and incorrectly cased paths', () => {
    const root = fixtureRoot();
    writeFixtureFile(root, 'public/known.png');
    const registry = fixtureRegistry([reusableRule('known', ['public/known.png'])]);
    registry.scope.files = [
      '../outside.png',
      'C:/outside.png',
      'public\\known.png',
      'public/KNOWN.png',
    ];

    const result = verifyAssetProvenance({ repoRoot: root, registry });
    expect(result.ok).toBe(false);
    expect(result.errors.map((error) => error.code)).toEqual(
      expect.arrayContaining(['unsafe-path', 'path-case-mismatch']),
    );
  });

  it('returns a nonzero CLI exit code for an uncovered fixture', () => {
    const root = fixtureRoot();
    writeFixtureFile(root, 'public/known.png');
    writeFixtureFile(root, 'public/unregistered.png');
    const registryPath = path.join(root, 'registry.json');
    writeFileSync(
      registryPath,
      `${JSON.stringify(fixtureRegistry([reusableRule('known-only', ['public/known.png'])]))}\n`,
    );

    const cli = spawnSync(
      process.execPath,
      [
        path.join(repoRoot, 'scripts/verify_asset_provenance.mjs'),
        '--root',
        root,
        '--registry',
        registryPath,
      ],
      { encoding: 'utf8' },
    );

    expect(cli.status).toBe(1);
    expect(`${cli.stdout}\n${cli.stderr}`).toContain('public/unregistered.png');
  });

  it('accepts the checked-in registry against the current distributed assets', () => {
    const registry = JSON.parse(
      readFileSync(path.join(repoRoot, 'docs/assets/provenance.registry.json'), 'utf8'),
    ) as AssetProvenanceRegistry;

    const result = verifyAssetProvenance({ repoRoot, registry });

    expect(result.ok, formatAssetProvenanceReport(result)).toBe(true);
    expect(result.scopedAssetCount).toBe(2337);
    expect(result.summaryByStatus).toEqual({
      'attribution-required': 27,
      'blocked-pending-proof': 592,
      'project-owned-proof-required': 275,
      'purchased-license-non-transferable': 407,
      'replace-before-release': 50,
      reusable: 943,
      'third-party-trademark': 3,
      unknown: 40,
    });
  });

  it('pins safety-critical classifications in the checked-in registry', () => {
    const registry = JSON.parse(
      readFileSync(path.join(repoRoot, 'docs/assets/provenance.registry.json'), 'utf8'),
    ) as AssetProvenanceRegistry;
    const rules = new Map(registry.rules.map((rule) => [rule.id, rule]));

    expect(rules.get('craftpix-purchased-icons')).toMatchObject({
      status: 'purchased-license-non-transferable',
      declaredLicense: 'LicenseRef-CraftPix-Premium',
      redistribution: 'licensee-only',
      commercialUse: 'licensee-only',
    });
    for (const id of [
      'render-ai-and-disputed-paid-sources',
      'ui-ai-derived-art',
      'dungeon-portraits-mixed-derivatives',
      'audio-elevenlabs-generated',
      'claudium-higgsfield-recraft-assets',
      'guide-stills-mixed-derivatives',
    ]) {
      expect(rules.get(id)).toMatchObject({
        status: 'blocked-pending-proof',
        declaredLicense: 'NOASSERTION',
        redistribution: 'unknown',
        commercialUse: 'unknown',
      });
    }
    for (const id of [
      'render-project-assets-without-transfer-proof',
      'ui-project-art-without-transfer-proof',
      'audio-project-ui-synthesis',
    ]) {
      expect(rules.get(id)).toMatchObject({
        status: 'project-owned-proof-required',
        declaredLicense: 'NOASSERTION',
      });
    }
    for (const id of [
      'render-assets-with-unknown-provenance',
      'ui-assets-with-unknown-provenance',
      'audio-with-unknown-provenance',
      'public-background-media-with-unknown-provenance',
    ]) {
      expect(rules.get(id)).toMatchObject({
        status: 'unknown',
        declaredLicense: 'NOASSERTION',
      });
    }
    expect(rules.get('world-of-claudecraft-brand-assets')).toMatchObject({
      status: 'replace-before-release',
      declaredLicense: 'NOASSERTION',
    });
    expect(rules.get('third-party-platform-marks')).toMatchObject({
      status: 'third-party-trademark',
      declaredLicense: 'NOASSERTION',
    });
  });

  it('keeps the schema controlled values synchronized with the verifier', () => {
    const schema = JSON.parse(
      readFileSync(path.join(repoRoot, 'docs/assets/provenance.schema.json'), 'utf8'),
    ) as {
      $defs: {
        rule: { properties: { status: { enum: string[] }; declaredLicense: { enum: string[] } } };
      };
    };

    expect(schema.$defs.rule.properties.status.enum).toEqual([...PROVENANCE_STATUSES]);
    expect(schema.$defs.rule.properties.declaredLicense.enum).toEqual([...DECLARED_LICENSES]);
  });
});
