import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  formatIdentifierCompatibilityReport,
  IDENTIFIER_CATEGORIES,
  type IdentifierCompatibilityRegistry,
  type IdentifierRule,
  RENAME_POLICIES,
  STABILITY_VALUES,
  TRANSFORMATION_STRATEGIES,
  verifyIdentifierCompatibility,
} from '../scripts/lib/identifier_compatibility.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');
const temporaryDirectories: string[] = [];

function fixtureRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'codexcraft-identifiers-'));
  temporaryDirectories.push(root);
  writeFixture(root, 'evidence.txt', 'fixture evidence');
  writeFixture(root, 'tests/registry.test.ts', '// fixture test');
  return root;
}

function writeFixture(root: string, relativePath: string, content: string): void {
  const absolutePath = path.join(root, ...relativePath.split('/'));
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content);
}

function hash(values: string[]): string {
  return createHash('sha256')
    .update([...values].sort().join('\n'))
    .digest('hex');
}

function occurrenceToken(
  pathName: string,
  value = 'SensitiveId',
  ordinal = 1,
  detectorId = 'sensitive-id',
  target = 'content',
): string {
  return `${target}\0${pathName}\0${detectorId}\0${value}\0${ordinal}`;
}

function rule(
  id: string,
  paths: string[],
  occurrences: string[],
  overrides: Partial<IdentifierRule> = {},
): IdentifierRule {
  return {
    id,
    identifier: 'Synthetic sensitive identifier',
    category: 'unknown-sensitive',
    coverage: {
      detectorIds: ['sensitive-id'],
      targets: ['content'],
      paths,
      expectedOccurrenceCount: occurrences.length,
      occurrenceInventorySha256: hash(occurrences),
    },
    owner: 'Fixture owner',
    usage: 'Synthetic verifier coverage.',
    stability: 'unknown',
    persistent: false,
    publiclyExposed: false,
    renamePolicy: 'unknown',
    strategy: 'investigate-before-change',
    aliases: [],
    risks: ['Changing the synthetic identifier could break the fixture contract.'],
    justification: 'The fixture deliberately treats the identifier as sensitive.',
    evidence: [
      {
        type: 'repository-file',
        reference: 'evidence.txt',
        description: 'Synthetic evidence file.',
      },
    ],
    tests: ['tests/registry.test.ts'],
    notes: [],
    uncertainties: ['The fixture does not assign a production meaning.'],
    ...overrides,
  };
}

function registry(rules: IdentifierRule[]): IdentifierCompatibilityRegistry {
  return {
    $schema: 'identifiers.schema.json',
    registryVersion: 1,
    scope: {
      roots: ['src'],
      files: [],
      pathRoots: ['src'],
      pathFiles: [],
      textExtensions: ['.ts'],
      exclusions: [],
    },
    detectors: [
      {
        id: 'sensitive-id',
        target: 'content',
        kind: 'literal',
        expression: 'SensitiveId',
        flags: '',
        description: 'Synthetic sensitive identifier.',
      },
    ],
    rules,
  };
}

function checkedInRegistry(): IdentifierCompatibilityRegistry {
  return JSON.parse(
    readFileSync(path.join(repoRoot, 'docs/compatibility/identifiers.registry.json'), 'utf8'),
  ) as IdentifierCompatibilityRegistry;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('identifier compatibility verifier', () => {
  it('accepts the checked-in registry', () => {
    const result = verifyIdentifierCompatibility({ repoRoot, registry: checkedInRegistry() });

    expect(result.ok, formatIdentifierCompatibilityReport(result)).toBe(true);
    expect(result.occurrenceCount).toBeGreaterThan(0);
    expect(result.summaryByCategory['persistent-content-id']).toBeGreaterThan(0);
    expect(result.summaryByStrategy['keep-stable']).toBeGreaterThan(0);
  }, 30_000);

  it('fails on an unregistered sensitive occurrence', () => {
    const root = fixtureRoot();
    writeFixture(root, 'src/known.ts', 'export const value = "SensitiveId";\n');
    const fixture = registry([rule('known', ['src/known.ts'], [occurrenceToken('src/known.ts')])]);
    expect(verifyIdentifierCompatibility({ repoRoot: root, registry: fixture }).ok).toBe(true);

    writeFixture(root, 'src/unregistered.ts', 'export const other = "SensitiveId";\n');
    const result = verifyIdentifierCompatibility({ repoRoot: root, registry: fixture });

    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: 'uncovered',
        path: 'src/unregistered.ts',
        detectorId: 'sensitive-id',
      }),
    );
  });

  it('fails when two rules ambiguously cover one occurrence', () => {
    const root = fixtureRoot();
    writeFixture(root, 'src/known.ts', 'SensitiveId\n');
    const token = occurrenceToken('src/known.ts');
    const result = verifyIdentifierCompatibility({
      repoRoot: root,
      registry: registry([
        rule('first', ['src/*.ts'], [token]),
        rule('second', ['src/known.ts'], [token]),
      ]),
    });

    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'ambiguous', ruleIds: ['first', 'second'] }),
    );
  });

  it('fails on an unknown category', () => {
    const root = fixtureRoot();
    writeFixture(root, 'src/known.ts', 'SensitiveId\n');
    const invalid = rule('invalid', ['src/known.ts'], [occurrenceToken('src/known.ts')], {
      category: 'visual-enough' as IdentifierRule['category'],
    });

    const result = verifyIdentifierCompatibility({ repoRoot: root, registry: registry([invalid]) });
    expect(result.errors.map((error) => error.code)).toContain('invalid-category');
  });

  it('fails on an unknown strategy', () => {
    const root = fixtureRoot();
    writeFixture(root, 'src/known.ts', 'SensitiveId\n');
    const invalid = rule('invalid', ['src/known.ts'], [occurrenceToken('src/known.ts')], {
      strategy: 'rename-everywhere' as IdentifierRule['strategy'],
    });

    const result = verifyIdentifierCompatibility({ repoRoot: root, registry: registry([invalid]) });
    expect(result.errors.map((error) => error.code)).toContain('invalid-strategy');
  });

  it('fails on absolute, traversal, backslash, and incorrectly cased paths', () => {
    const root = fixtureRoot();
    writeFixture(root, 'src/known.ts', 'SensitiveId\n');
    const fixture = registry([rule('known', ['src/known.ts'], [occurrenceToken('src/known.ts')])]);
    fixture.scope.files = ['/absolute.ts', '../outside.ts', 'src\\known.ts', 'src/KNOWN.ts'];

    const result = verifyIdentifierCompatibility({ repoRoot: root, registry: fixture });
    expect(result.errors.map((error) => error.code)).toEqual(
      expect.arrayContaining(['unsafe-path', 'path-case-mismatch']),
    );
  });

  it('fails on a persistent identifier declared freely renameable', () => {
    const root = fixtureRoot();
    writeFixture(root, 'src/known.ts', 'SensitiveId\n');
    const invalid = rule('persistent', ['src/known.ts'], [occurrenceToken('src/known.ts')], {
      category: 'persistent-content-id',
      stability: 'permanent',
      persistent: true,
      renamePolicy: 'allowed',
      strategy: 'keep-stable',
      uncertainties: [],
    });

    const result = verifyIdentifierCompatibility({ repoRoot: root, registry: registry([invalid]) });
    expect(result.errors.map((error) => error.code)).toContain('persistent-freely-renamable');
  });

  it('fails on a network identifier without a transition strategy', () => {
    const root = fixtureRoot();
    writeFixture(root, 'src/known.ts', 'SensitiveId\n');
    const invalid = rule('network', ['src/known.ts'], [occurrenceToken('src/known.ts')], {
      category: 'network-route',
      stability: 'stable',
      renamePolicy: 'migration-required',
      strategy: 'rename-display-only',
      uncertainties: [],
    });

    const result = verifyIdentifierCompatibility({ repoRoot: root, registry: registry([invalid]) });
    expect(result.errors.map((error) => error.code)).toContain('network-without-transition');
  });

  it('fails on a client storage key without a compatibility strategy', () => {
    const root = fixtureRoot();
    writeFixture(root, 'src/known.ts', 'SensitiveId\n');
    const invalid = rule('storage', ['src/known.ts'], [occurrenceToken('src/known.ts')], {
      category: 'client-storage-key',
      stability: 'stable',
      persistent: true,
      renamePolicy: 'migration-required',
      strategy: 'redirect-required',
      uncertainties: [],
    });

    const result = verifyIdentifierCompatibility({ repoRoot: root, registry: registry([invalid]) });
    expect(result.errors.map((error) => error.code)).toContain('storage-without-compatibility');
  });

  it('fails on a database identifier without migration or stable retention', () => {
    const root = fixtureRoot();
    writeFixture(root, 'src/known.ts', 'SensitiveId\n');
    const invalid = rule('database', ['src/known.ts'], [occurrenceToken('src/known.ts')], {
      category: 'database-identifier',
      stability: 'permanent',
      persistent: true,
      renamePolicy: 'migration-required',
      strategy: 'application-transition-required',
      uncertainties: [],
    });

    const result = verifyIdentifierCompatibility({ repoRoot: root, registry: registry([invalid]) });
    expect(result.errors.map((error) => error.code)).toContain('database-without-migration');
  });

  it('accepts a justified display-only label', () => {
    const root = fixtureRoot();
    writeFixture(root, 'src/known.ts', 'SensitiveId\n');
    const display = rule('display', ['src/known.ts'], [occurrenceToken('src/known.ts')], {
      category: 'display-label',
      stability: 'versioned',
      persistent: false,
      publiclyExposed: true,
      renamePolicy: 'allowed',
      strategy: 'rename-display-only',
      uncertainties: [],
    });

    const result = verifyIdentifierCompatibility({ repoRoot: root, registry: registry([display]) });
    expect(result.ok, formatIdentifierCompatibilityReport(result)).toBe(true);
  });

  it('accepts a generated mirror linked to a real source occurrence', () => {
    const root = fixtureRoot();
    writeFixture(root, 'src/source.ts', 'SensitiveId\n');
    writeFixture(root, 'src/output.generated.ts', 'SensitiveId\n');
    const source = rule('source', ['src/source.ts'], [occurrenceToken('src/source.ts')], {
      category: 'display-label',
      stability: 'versioned',
      renamePolicy: 'forbidden',
      strategy: 'keep-stable',
      uncertainties: [],
    });
    const mirror = rule(
      'mirror',
      ['src/output.generated.ts'],
      [occurrenceToken('src/output.generated.ts')],
      {
        category: 'generated-mirror',
        stability: 'versioned',
        renamePolicy: 'forbidden',
        strategy: 'generated-from-source',
        sourceRuleIds: ['source'],
        uncertainties: [],
      },
    );

    const result = verifyIdentifierCompatibility({
      repoRoot: root,
      registry: registry([source, mirror]),
    });
    expect(result.ok, formatIdentifierCompatibilityReport(result)).toBe(true);
  });

  it('fails when a generated value has only a different source value under the same detector', () => {
    const root = fixtureRoot();
    writeFixture(root, 'src/source.ts', 'SensitiveSource\n');
    writeFixture(root, 'src/output.generated.ts', 'SensitiveMirror\n');
    const source = rule(
      'source',
      ['src/source.ts'],
      [occurrenceToken('src/source.ts', 'SensitiveSource')],
      {
        category: 'display-label',
        stability: 'versioned',
        renamePolicy: 'forbidden',
        strategy: 'keep-stable',
        uncertainties: [],
      },
    );
    const mirror = rule(
      'mirror',
      ['src/output.generated.ts'],
      [occurrenceToken('src/output.generated.ts', 'SensitiveMirror')],
      {
        category: 'generated-mirror',
        stability: 'versioned',
        renamePolicy: 'forbidden',
        strategy: 'generated-from-source',
        sourceRuleIds: ['source'],
        uncertainties: [],
      },
    );
    const fixture = registry([source, mirror]);
    fixture.detectors[0] = {
      ...fixture.detectors[0],
      kind: 'regex',
      expression: 'Sensitive(?:Source|Mirror)',
    };

    const result = verifyIdentifierCompatibility({ repoRoot: root, registry: fixture });
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: 'generated-without-source',
        detectorId: 'sensitive-id',
        ruleId: 'mirror',
      }),
    );
  });

  it('returns a nonzero CLI exit code on registry failure', () => {
    const root = fixtureRoot();
    writeFixture(root, 'src/unregistered.ts', 'SensitiveId\n');
    const registryPath = path.join(root, 'registry.json');
    writeFileSync(registryPath, `${JSON.stringify(registry([]))}\n`);

    const cli = spawnSync(
      process.execPath,
      [
        path.join(repoRoot, 'scripts/verify_identifier_compatibility.mjs'),
        '--root',
        root,
        '--registry',
        registryPath,
      ],
      { encoding: 'utf8' },
    );

    expect(cli.status).toBe(1);
    expect(`${cli.stdout}\n${cli.stderr}`).toContain('unregistered.ts');
  });

  it('pins critical checked-in classifications as nonvisual contracts', () => {
    const registry = checkedInRegistry();
    const rules = new Map(registry.rules.map((entry) => [entry.id, entry]));
    const detectors = new Map(registry.detectors.map((entry) => [entry.id, entry]));

    for (const id of [
      'persistent-content-identifiers',
      'claudemoon-realm',
      'woc-client-storage',
      'armory-ownership-database',
      'eastbrook-database',
      'eastbrook-docker-volumes',
      'woc-infrastructure-identities',
      'woc-schema-advisory-lock',
      'wallet-link-database',
    ]) {
      expect(rules.get(id)?.category).not.toBe('display-label');
      expect(rules.get(id)?.persistent).toBe(true);
      expect(rules.get(id)?.renamePolicy).not.toBe('allowed');
    }
    expect(rules.get('woc-network-headers')).toMatchObject({
      category: 'network-header',
      strategy: 'keep-stable',
    });
    expect(rules.get('woc-balance-route')).toMatchObject({
      category: 'network-route',
      strategy: 'keep-stable',
    });
    expect(rules.get('desktop-application-id')).toMatchObject({
      category: 'desktop-app-identity',
      strategy: 'application-transition-required',
    });
    expect(rules.get('desktop-deep-link')).toMatchObject({
      category: 'network-protocol',
      strategy: 'alias-then-migrate',
    });
    expect(rules.get('installed-url-schemes')).toMatchObject({
      category: 'network-protocol',
      strategy: 'alias-then-migrate',
    });
    expect(rules.get('mobile-application-id')).toMatchObject({
      category: 'mobile-app-identity',
      strategy: 'application-transition-required',
    });
    expect(rules.get('claudium-economic')).toMatchObject({
      category: 'economic-identifier',
      strategy: 'economic-review-required',
    });
    expect(rules.get('armory-economic')).toMatchObject({
      category: 'economic-identifier',
      strategy: 'economic-review-required',
    });
    expect(rules.get('web3-mint')).toMatchObject({
      category: 'web3-identifier',
      strategy: 'economic-review-required',
    });
    expect(rules.get('public-domains')).toMatchObject({
      category: 'public-domain-or-url',
      strategy: 'redirect-required',
    });
    expect(rules.get('oauth-callbacks')).toMatchObject({
      category: 'oauth-or-callback',
      strategy: 'alias-then-migrate',
    });
    expect(rules.get('economic-environment')).toMatchObject({
      category: 'economic-identifier',
      strategy: 'economic-review-required',
    });
    expect(rules.get('economic-code-contracts')).toMatchObject({
      category: 'economic-identifier',
      strategy: 'economic-review-required',
    });

    for (const [ruleId, detectorId] of [
      ['persistent-content-identifiers', 'persistent-content-property'],
      ['persistent-content-identifiers', 'persistent-composite-content-id'],
      ['persistent-content-identifiers', 'claudemoon-grant-id'],
      ['persistent-content-identifiers', 'derived-heroic-content-id'],
      ['claudemoon-realm', 'claudemoon'],
      ['woc-client-storage', 'woc-client-storage-key'],
      ['woc-delimited-technical-identifiers', 'woc-delimited-technical'],
      ['woc-network-headers', 'woc-network-header'],
      ['woc-balance-route', 'woc-network-route'],
      ['desktop-application-id', 'desktop-app-id'],
      ['desktop-deep-link', 'desktop-deep-link'],
      ['installed-url-schemes', 'electron-url-scheme'],
      ['installed-url-schemes', 'android-url-scheme'],
      ['installed-url-schemes', 'ios-url-scheme'],
      ['mobile-application-id', 'mobile-app-id'],
      ['eastbrook-database', 'eastbrook-database-config'],
      ['eastbrook-docker-volumes', 'eastbrook-docker'],
      ['woc-infrastructure-identities', 'woc-infrastructure-name'],
      ['claudium-economic', 'claudium'],
      ['armory-economic', 'armory'],
      ['armory-ownership-database', 'armory-ownership'],
      ['woc-schema-advisory-lock', 'woc-schema-lock'],
      ['wallet-link-database', 'wallet-database-identity'],
      ['economic-environment', 'economic-environment-variable'],
      ['economic-code-contracts', 'economic-code-constant'],
      ['woc-uppercase-technical-identifiers', 'woc-uppercase-technical'],
      ['web3-mint', 'solana-mint'],
      ['public-domains', 'public-domain'],
      ['oauth-callbacks', 'oauth-callback-route'],
    ] as const) {
      expect(rules.get(ruleId)?.coverage.detectorIds).toContain(detectorId);
    }
    expect(rules.get('generated-identifier-mirrors')?.coverage.detectorIds).toContain(
      'derived-heroic-content-id',
    );
    expect(rules.get('generated-identifier-mirrors')?.sourceRuleIds).toContain(
      'persistent-content-identifiers',
    );

    expect(detectors.get('claudemoon')?.expression).toBe('\\bClaudemoon\\b');
    expect(detectors.get('claudemoon-grant-id')?.expression).toBe('champion_of_claudemoon');
    expect(detectors.get('persistent-content-property')?.expression).toEqual(
      expect.stringContaining('itemId'),
    );
    const persistentProperty = new RegExp(
      detectors.get('persistent-content-property')?.expression ?? '',
    );
    expect(persistentProperty.test("id: 'eastbrook_vale'")).toBe(true);
    expect(persistentProperty.test("questId: 'a_persistent_quest'")).toBe(true);
    expect(persistentProperty.test("itemId: 'a_shipped_item'")).toBe(true);
    expect(detectors.get('persistent-composite-content-id')?.expression).toEqual(
      expect.stringContaining('worldboss'),
    );
    expect(
      new RegExp(detectors.get('persistent-composite-content-id')?.expression ?? '').test(
        "'poi:eastbrook_vale:eastbrook'",
      ),
    ).toBe(true);
    expect(
      new RegExp(detectors.get('derived-heroic-content-id')?.expression ?? '').test(
        "'heroic_boundstone_helm'",
      ),
    ).toBe(true);
    expect(detectors.get('woc-client-storage-key')?.expression).toEqual(
      expect.stringContaining('woc_'),
    );
    expect(detectors.get('woc-token')?.flags).toBe('');
    expect(new RegExp(detectors.get('woc-token')?.expression ?? '').test('woc-mediawiki')).toBe(
      false,
    );
    expect(
      new RegExp(
        detectors.get('woc-infrastructure-name')?.expression ?? '',
        detectors.get('woc-infrastructure-name')?.flags,
      ).test('woc/LocalSettings.php'),
    ).toBe(true);
    const delimitedTechnical = detectors.get('woc-delimited-technical');
    const delimitedExpression = new RegExp(
      delimitedTechnical?.expression ?? '',
      delimitedTechnical?.flags,
    );
    expect(delimitedExpression.test('woc-static-page-alias')).toBe(true);
    expect(delimitedExpression.test('application/x-woc-hotbar-action')).toBe(true);
    expect(delimitedTechnical?.excludePaths).toContain('mediawiki/Dockerfile');
    expect(detectors.get('woc-network-header')?.expression).toBe('\\bx-woc-[a-z0-9-]+\\b');
    expect(detectors.get('woc-network-route')?.expression).toEqual(
      expect.stringContaining('/api/woc/'),
    );
    expect(detectors.get('desktop-app-id')?.expression).toBe('com.worldofclaudecraft.desktop');
    expect(detectors.get('desktop-deep-link')?.expression).toBe('worldofclaudecraft://');
    expect(detectors.get('electron-url-scheme')).toMatchObject({
      paths: ['package.json'],
      valueGroup: 1,
    });
    expect(detectors.get('android-url-scheme')).toMatchObject({
      paths: ['android/app/src/main/AndroidManifest.xml'],
      valueGroup: 1,
    });
    expect(detectors.get('ios-url-scheme')).toMatchObject({
      paths: ['ios/App/App/Info.plist'],
      valueGroup: 1,
    });
    expect(detectors.get('mobile-app-id')?.expression).toEqual(
      expect.stringContaining('com\\.worldofclaudecraft'),
    );
    expect(detectors.get('eastbrook-docker')?.expression).toEqual(
      expect.stringContaining('pgdata'),
    );
    expect(detectors.get('eastbrook-database-config')?.expression).toEqual(
      expect.stringContaining('POSTGRES_'),
    );
    expect(detectors.get('economic-environment-variable')?.expression).toEqual(
      expect.stringContaining('MINT'),
    );
    const economicEnvironment = new RegExp(
      detectors.get('economic-environment-variable')?.expression ?? '',
    );
    expect(economicEnvironment.test('WOC_MINT')).toBe(true);
    const wocEnvironment = new RegExp(detectors.get('woc-environment-variable')?.expression ?? '');
    expect(wocEnvironment.test('WOC_MINT')).toBe(true);
    expect(wocEnvironment.test('WOC_MAX_SUPPLY')).toBe(false);
    expect(
      new RegExp(detectors.get('woc-uppercase-technical')?.expression ?? '').test('WOC_MAX_SUPPLY'),
    ).toBe(true);
    expect(detectors.get('claudium')?.expression).toBe('\\bClaudium\\b');
    expect(detectors.get('armory')?.expression).toBe('\\bArmory\\b');
    expect(detectors.get('armory-ownership')?.expression).toEqual(
      expect.stringContaining('account_weapon_cosmetics'),
    );
    expect(detectors.get('woc-schema-lock')?.expression).toBe('0x57_4f_43_01');
    expect(detectors.get('wallet-database-identity')?.expression).toEqual(
      expect.stringContaining('wallet_links'),
    );
    expect(detectors.get('economic-code-constant')?.expression).toEqual(
      expect.stringContaining('WOC_MAX_SUPPLY'),
    );
    expect(detectors.get('solana-mint')?.expression).toBe(
      '3WjLscH2JsXLEFJZRA9z8ti8yRGxWGKbqymPd7UicRth',
    );
    expect(detectors.get('public-domain')?.expression).toEqual(
      expect.stringContaining('worldofclaudecraft\\.com'),
    );
    expect(detectors.get('oauth-callback-route')?.expression).toEqual(
      expect.stringContaining('api/auth'),
    );
  });

  it('keeps schema controlled values synchronized with the verifier', () => {
    const schema = JSON.parse(
      readFileSync(path.join(repoRoot, 'docs/compatibility/identifiers.schema.json'), 'utf8'),
    ) as {
      $defs: {
        category: { enum: string[] };
        strategy: { enum: string[] };
        rule: {
          properties: {
            stability: { enum: string[] };
            renamePolicy: { enum: string[] };
          };
        };
      };
    };

    expect(schema.$defs.category.enum).toEqual([...IDENTIFIER_CATEGORIES]);
    expect(schema.$defs.strategy.enum).toEqual([...TRANSFORMATION_STRATEGIES]);
    expect(schema.$defs.rule.properties.stability.enum).toEqual([...STABILITY_VALUES]);
    expect(schema.$defs.rule.properties.renamePolicy.enum).toEqual([...RENAME_POLICIES]);
  });
});
