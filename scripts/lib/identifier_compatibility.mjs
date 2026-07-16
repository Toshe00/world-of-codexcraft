import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';

export const IDENTIFIER_CATEGORIES = Object.freeze([
  'display-label',
  'brand-asset',
  'documentation-only',
  'persistent-content-id',
  'database-identifier',
  'database-value',
  'realm-identifier',
  'client-storage-key',
  'network-route',
  'network-header',
  'network-protocol',
  'desktop-app-identity',
  'mobile-app-identity',
  'oauth-or-callback',
  'environment-variable',
  'docker-or-infrastructure',
  'filesystem-path',
  'public-domain-or-url',
  'email-identity',
  'telemetry-or-metric',
  'economic-identifier',
  'web3-identifier',
  'generated-mirror',
  'third-party-trademark',
  'unknown-sensitive',
]);

export const TRANSFORMATION_STRATEGIES = Object.freeze([
  'rename-display-only',
  'keep-stable',
  'alias-then-migrate',
  'dual-read-dual-write',
  'redirect-required',
  'database-migration-required',
  'application-transition-required',
  'infrastructure-migration-required',
  'economic-review-required',
  'legal-review-required',
  'generated-from-source',
  'replace-before-release',
  'investigate-before-change',
]);

export const STABILITY_VALUES = Object.freeze([
  'ephemeral',
  'versioned',
  'stable',
  'permanent',
  'unknown',
]);
export const RENAME_POLICIES = Object.freeze([
  'allowed',
  'forbidden',
  'migration-required',
  'unknown',
]);

const DETECTOR_TARGETS = new Set(['content', 'path', 'both']);
const OCCURRENCE_TARGETS = new Set(['content', 'path']);
const DETECTOR_KINDS = new Set(['literal', 'regex']);
const SOURCE_VALUE_MODES = new Set(['exact', 'family']);
const EVIDENCE_TYPES = new Set(['repository-file', 'test', 'runtime-contract', 'manual-review']);
const PERSISTENT_CATEGORIES = new Set([
  'persistent-content-id',
  'database-identifier',
  'database-value',
  'realm-identifier',
  'client-storage-key',
  'desktop-app-identity',
  'mobile-app-identity',
  'economic-identifier',
  'web3-identifier',
]);
const NETWORK_CATEGORIES = new Set([
  'network-route',
  'network-header',
  'network-protocol',
  'oauth-or-callback',
]);
const NETWORK_STRATEGIES = new Set([
  'keep-stable',
  'alias-then-migrate',
  'dual-read-dual-write',
  'redirect-required',
  'application-transition-required',
  'investigate-before-change',
]);
const STORAGE_STRATEGIES = new Set([
  'keep-stable',
  'alias-then-migrate',
  'dual-read-dual-write',
  'application-transition-required',
  'investigate-before-change',
]);
const DATABASE_STRATEGIES = new Set([
  'keep-stable',
  'alias-then-migrate',
  'dual-read-dual-write',
  'database-migration-required',
  'economic-review-required',
  'investigate-before-change',
]);
const INFRASTRUCTURE_STRATEGIES = new Set([
  'keep-stable',
  'alias-then-migrate',
  'dual-read-dual-write',
  'infrastructure-migration-required',
  'investigate-before-change',
]);
const APPLICATION_STRATEGIES = new Set([
  'keep-stable',
  'alias-then-migrate',
  'dual-read-dual-write',
  'application-transition-required',
  'investigate-before-change',
]);
const ECONOMIC_STRATEGIES = new Set([
  'keep-stable',
  'alias-then-migrate',
  'dual-read-dual-write',
  'economic-review-required',
  'investigate-before-change',
]);

const REGISTRY_KEYS = new Set(['$schema', 'registryVersion', 'scope', 'detectors', 'rules']);
const SCOPE_KEYS = new Set([
  'roots',
  'files',
  'pathRoots',
  'pathFiles',
  'textExtensions',
  'exclusions',
]);
const EXCLUSION_KEYS = new Set([
  'id',
  'paths',
  'justification',
  'expectedPathCount',
  'pathInventorySha256',
]);
const DETECTOR_KEYS = new Set([
  'id',
  'target',
  'kind',
  'expression',
  'flags',
  'description',
  'paths',
  'excludePaths',
  'valueGroup',
  'sourceValueMode',
]);
const RULE_KEYS = new Set([
  'id',
  'identifier',
  'category',
  'coverage',
  'owner',
  'usage',
  'stability',
  'persistent',
  'publiclyExposed',
  'renamePolicy',
  'strategy',
  'aliases',
  'risks',
  'justification',
  'evidence',
  'tests',
  'notes',
  'uncertainties',
  'sourceRuleIds',
]);
const COVERAGE_KEYS = new Set([
  'detectorIds',
  'targets',
  'paths',
  'excludePaths',
  'expectedOccurrenceCount',
  'occurrenceInventorySha256',
]);
const EVIDENCE_KEYS = new Set(['type', 'reference', 'description']);
const GLOB_CACHE = new Map();

function issue(code, message, details = {}) {
  return { code, message, ...details };
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function codePointCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizedPath(value) {
  return value.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/$/, '');
}

function escapeRegex(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

export function globToRegExp(glob) {
  const normalized = normalizedPath(glob);
  let source = '^';
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    if (char === '*' && normalized[index + 1] === '*') {
      index += 1;
      if (normalized[index + 1] === '/') {
        index += 1;
        source += '(?:.*/)?';
      } else {
        source += '.*';
      }
    } else if (char === '*') {
      source += '[^/]*';
    } else if (char === '?') {
      source += '[^/]';
    } else {
      source += escapeRegex(char);
    }
  }
  return new RegExp(`${source}$`);
}

function matches(pattern, candidate) {
  let expression = GLOB_CACHE.get(pattern);
  if (!expression) {
    expression = globToRegExp(pattern);
    GLOB_CACHE.set(pattern, expression);
  }
  return expression.test(normalizedPath(candidate));
}

function walkFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(absolutePath));
    else if (entry.isFile()) files.push(absolutePath);
  }
  return files;
}

function validateObjectKeys(value, allowed, label, errors) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      errors.push(issue('unexpected-property', `${label} has unsupported property ${key}.`));
    }
  }
}

function validateUniqueStrings(values, label, errors, { allowEmpty = true } = {}) {
  if (!Array.isArray(values)) {
    errors.push(issue('invalid-list', `${label} must be an array.`));
    return;
  }
  if (!allowEmpty && values.length === 0) {
    errors.push(issue('empty-list', `${label} must not be empty.`));
  }
  if (values.some((value) => !nonEmptyString(value))) {
    errors.push(issue('invalid-list', `${label} must contain only nonempty strings.`));
  }
  if (new Set(values).size !== values.length) {
    errors.push(issue('duplicate-list-value', `${label} contains duplicate values.`));
  }
}

function portableRelativePath(value) {
  if (!nonEmptyString(value) || value.includes('\\') || value.includes('\0')) return false;
  if (value.startsWith('/') || /[:<>"|]/.test(value)) return false;
  const segments = value.split('/');
  return !segments.some((segment) => segment === '' || segment === '.' || segment === '..');
}

function validatePortablePaths(values, label, errors) {
  if (!Array.isArray(values)) return;
  for (const value of values) {
    if (!portableRelativePath(value)) {
      errors.push(
        issue('unsafe-path', `${label} contains a nonportable repository path: ${String(value)}.`),
      );
    }
  }
}

function isInside(root, target) {
  const relative = path.relative(root, target);
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
  );
}

function resolveCanonicalRepoPath(repoRoot, relativePath, expectedKind, errors, details = {}) {
  if (!portableRelativePath(relativePath)) {
    errors.push(
      issue(
        'unsafe-path',
        `Path must be portable and repository-relative: ${String(relativePath)}.`,
        details,
      ),
    );
    return null;
  }
  let current = repoRoot;
  for (const segment of relativePath.split('/')) {
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      errors.push(
        issue('missing-path', `Repository path does not exist: ${relativePath}.`, details),
      );
      return null;
    }
    const exact = entries.find((entry) => entry.name === segment);
    if (!exact) {
      const caseOnly = entries.find((entry) => entry.name.toLowerCase() === segment.toLowerCase());
      errors.push(
        issue(
          caseOnly ? 'path-case-mismatch' : 'missing-path',
          caseOnly
            ? `Repository path casing differs: ${relativePath}; actual segment is ${caseOnly.name}.`
            : `Repository path does not exist: ${relativePath}.`,
          details,
        ),
      );
      return null;
    }
    current = path.join(current, exact.name);
  }
  const resolvedRoot = realpathSync(repoRoot);
  const resolvedTarget = realpathSync(current);
  if (!isInside(resolvedRoot, resolvedTarget)) {
    errors.push(
      issue(
        'unsafe-path',
        `Repository path resolves outside the repository: ${relativePath}.`,
        details,
      ),
    );
    return null;
  }
  const stats = statSync(resolvedTarget);
  if (
    (expectedKind === 'file' && !stats.isFile()) ||
    (expectedKind === 'directory' && !stats.isDirectory())
  ) {
    errors.push(
      issue('wrong-path-kind', `Repository path has the wrong kind: ${relativePath}.`, details),
    );
    return null;
  }
  return resolvedTarget;
}

function inventoryHash(values) {
  return createHash('sha256')
    .update([...values].sort().join('\n'))
    .digest('hex');
}

function canonicalSourceValue(value, detector) {
  let canonical = value.trim();
  const quote = canonical[0];
  if (
    canonical.length >= 2 &&
    (quote === "'" || quote === '"' || quote === '`') &&
    canonical.at(-1) === quote
  ) {
    canonical = canonical.slice(1, -1);
  }
  return detector?.flags?.includes('i') ? canonical.toLowerCase() : canonical;
}

function validateReferencePath(repoRoot, reference, label, errors, details) {
  const resolved = resolveCanonicalRepoPath(repoRoot, reference, 'file', errors, details);
  if (!resolved) {
    errors.push(
      issue('missing-reference', `${label} references missing file ${reference}.`, details),
    );
  }
}

function validateDetector(detector, index, errors) {
  const label = nonEmptyString(detector?.id) ? detector.id : `detectors[${index}]`;
  validateObjectKeys(detector, DETECTOR_KEYS, label, errors);
  if (!nonEmptyString(detector?.id) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(detector.id)) {
    errors.push(
      issue('invalid-detector-id', `${label} must have a kebab-case id.`, { detectorId: label }),
    );
  }
  if (!DETECTOR_TARGETS.has(detector?.target)) {
    errors.push(
      issue('invalid-detector-target', `${label} has an unsupported target.`, {
        detectorId: label,
      }),
    );
  }
  if (!DETECTOR_KINDS.has(detector?.kind)) {
    errors.push(
      issue('invalid-detector-kind', `${label} has an unsupported kind.`, { detectorId: label }),
    );
  }
  if (!nonEmptyString(detector?.expression)) {
    errors.push(
      issue('invalid-detector-expression', `${label} needs a nonempty expression.`, {
        detectorId: label,
      }),
    );
  }
  if (typeof detector?.flags !== 'string' || /[^imu]/.test(detector.flags)) {
    errors.push(
      issue('invalid-detector-flags', `${label} flags may contain only i, m, and u.`, {
        detectorId: label,
      }),
    );
  } else if (new Set(detector.flags).size !== detector.flags.length) {
    errors.push(
      issue('invalid-detector-flags', `${label} flags must be unique.`, { detectorId: label }),
    );
  }
  if (!nonEmptyString(detector?.description)) {
    errors.push(
      issue('missing-detector-description', `${label} needs a description.`, { detectorId: label }),
    );
  }
  validateUniqueStrings(detector?.paths ?? [], `${label}.paths`, errors);
  validateUniqueStrings(detector?.excludePaths ?? [], `${label}.excludePaths`, errors);
  validatePortablePaths(detector?.paths ?? [], `${label}.paths`, errors);
  validatePortablePaths(detector?.excludePaths ?? [], `${label}.excludePaths`, errors);
  if (
    detector?.valueGroup !== undefined &&
    (!Number.isInteger(detector.valueGroup) || detector.valueGroup < 1)
  ) {
    errors.push(
      issue('invalid-detector-value-group', `${label} valueGroup must be a positive integer.`, {
        detectorId: label,
      }),
    );
  }
  if (detector?.valueGroup !== undefined && detector?.kind !== 'regex') {
    errors.push(
      issue('literal-detector-value-group', `${label} may use valueGroup only with a regex.`, {
        detectorId: label,
      }),
    );
  }
  if (
    detector?.sourceValueMode !== undefined &&
    !SOURCE_VALUE_MODES.has(detector.sourceValueMode)
  ) {
    errors.push(
      issue('invalid-source-value-mode', `${label} sourceValueMode must be exact or family.`, {
        detectorId: label,
      }),
    );
  }
  if (nonEmptyString(detector?.expression) && DETECTOR_KINDS.has(detector?.kind)) {
    try {
      const source =
        detector.kind === 'literal' ? escapeRegex(detector.expression) : detector.expression;
      const expression = new RegExp(source, detector.flags ?? '');
      if (expression.test('')) {
        errors.push(
          issue('empty-match-detector', `${label} must not match an empty string.`, {
            detectorId: label,
          }),
        );
      }
    } catch (error) {
      errors.push(
        issue(
          'invalid-detector-regex',
          `${label} cannot compile: ${error instanceof Error ? error.message : String(error)}.`,
          { detectorId: label },
        ),
      );
    }
  }
}

function validateRule(rule, index, repoRoot, errors) {
  const label = nonEmptyString(rule?.id) ? rule.id : `rules[${index}]`;
  validateObjectKeys(rule, RULE_KEYS, label, errors);
  validateObjectKeys(rule?.coverage, COVERAGE_KEYS, `${label}.coverage`, errors);
  if (!nonEmptyString(rule?.id) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(rule.id)) {
    errors.push(issue('invalid-rule-id', `${label} must have a kebab-case id.`, { ruleId: label }));
  }
  for (const [field, value] of [
    ['identifier', rule?.identifier],
    ['owner', rule?.owner],
    ['usage', rule?.usage],
    ['justification', rule?.justification],
  ]) {
    if (!nonEmptyString(value)) {
      errors.push(issue(`missing-${field}`, `${label} must include ${field}.`, { ruleId: label }));
    }
  }
  if (!IDENTIFIER_CATEGORIES.includes(rule?.category)) {
    errors.push(
      issue('invalid-category', `${label} has unsupported category ${String(rule?.category)}.`, {
        ruleId: label,
      }),
    );
  }
  if (!TRANSFORMATION_STRATEGIES.includes(rule?.strategy)) {
    errors.push(
      issue('invalid-strategy', `${label} has unsupported strategy ${String(rule?.strategy)}.`, {
        ruleId: label,
      }),
    );
  }
  if (!STABILITY_VALUES.includes(rule?.stability)) {
    errors.push(
      issue('invalid-stability', `${label} has unsupported stability ${String(rule?.stability)}.`, {
        ruleId: label,
      }),
    );
  }
  if (!RENAME_POLICIES.includes(rule?.renamePolicy)) {
    errors.push(
      issue(
        'invalid-rename-policy',
        `${label} has unsupported rename policy ${String(rule?.renamePolicy)}.`,
        { ruleId: label },
      ),
    );
  }
  if (typeof rule?.persistent !== 'boolean' || typeof rule?.publiclyExposed !== 'boolean') {
    errors.push(
      issue('invalid-boolean', `${label} persistent and publiclyExposed must be booleans.`, {
        ruleId: label,
      }),
    );
  }

  for (const [field, allowEmpty] of [
    ['aliases', true],
    ['risks', false],
    ['tests', false],
    ['notes', true],
    ['uncertainties', true],
  ]) {
    validateUniqueStrings(rule?.[field], `${label}.${field}`, errors, { allowEmpty });
  }
  validateUniqueStrings(rule?.sourceRuleIds ?? [], `${label}.sourceRuleIds`, errors);

  if (!Array.isArray(rule?.evidence) || rule.evidence.length === 0) {
    errors.push(
      issue('missing-evidence', `${label} needs at least one evidence entry.`, { ruleId: label }),
    );
  } else {
    for (const [evidenceIndex, evidence] of rule.evidence.entries()) {
      validateObjectKeys(evidence, EVIDENCE_KEYS, `${label}.evidence[${evidenceIndex}]`, errors);
      if (!EVIDENCE_TYPES.has(evidence?.type)) {
        errors.push(
          issue(
            'invalid-evidence-type',
            `${label} evidence ${evidenceIndex} has an unsupported type.`,
            { ruleId: label },
          ),
        );
      }
      if (!nonEmptyString(evidence?.reference) || !nonEmptyString(evidence?.description)) {
        errors.push(
          issue(
            'invalid-evidence',
            `${label} evidence ${evidenceIndex} needs a reference and description.`,
            { ruleId: label },
          ),
        );
      } else {
        validateReferencePath(
          repoRoot,
          evidence.reference,
          `${label} evidence ${evidenceIndex}`,
          errors,
          { ruleId: label },
        );
      }
    }
  }
  if (Array.isArray(rule?.tests)) {
    validatePortablePaths(rule.tests, `${label}.tests`, errors);
    for (const testPath of rule.tests) {
      if (portableRelativePath(testPath)) {
        validateReferencePath(repoRoot, testPath, `${label} test`, errors, { ruleId: label });
      }
    }
  }

  if (!rule?.coverage || typeof rule.coverage !== 'object' || Array.isArray(rule.coverage)) {
    errors.push(issue('invalid-coverage', `${label} needs a coverage object.`, { ruleId: label }));
  } else {
    validateUniqueStrings(rule.coverage.detectorIds, `${label}.coverage.detectorIds`, errors, {
      allowEmpty: false,
    });
    validateUniqueStrings(rule.coverage.targets, `${label}.coverage.targets`, errors, {
      allowEmpty: false,
    });
    validateUniqueStrings(rule.coverage.paths, `${label}.coverage.paths`, errors, {
      allowEmpty: false,
    });
    validateUniqueStrings(
      rule.coverage.excludePaths ?? [],
      `${label}.coverage.excludePaths`,
      errors,
    );
    validatePortablePaths(rule.coverage.paths, `${label}.coverage.paths`, errors);
    validatePortablePaths(
      rule.coverage.excludePaths ?? [],
      `${label}.coverage.excludePaths`,
      errors,
    );
    if (Array.isArray(rule.coverage.targets)) {
      for (const target of rule.coverage.targets) {
        if (!OCCURRENCE_TARGETS.has(target)) {
          errors.push(
            issue(
              'invalid-coverage-target',
              `${label} has unsupported coverage target ${String(target)}.`,
              { ruleId: label },
            ),
          );
        }
      }
    }
    if (
      !Number.isInteger(rule.coverage.expectedOccurrenceCount) ||
      rule.coverage.expectedOccurrenceCount < 0
    ) {
      errors.push(
        issue(
          'invalid-inventory-count',
          `${label} expectedOccurrenceCount must be a nonnegative integer.`,
          { ruleId: label },
        ),
      );
    }
    if (!/^[a-f0-9]{64}$/.test(rule.coverage.occurrenceInventorySha256 ?? '')) {
      errors.push(
        issue(
          'invalid-inventory-hash',
          `${label} occurrenceInventorySha256 must be a lowercase SHA-256.`,
          { ruleId: label },
        ),
      );
    }
  }

  if (PERSISTENT_CATEGORIES.has(rule?.category) && rule?.persistent !== true) {
    errors.push(
      issue('persistent-category-not-marked', `${label} category must be marked persistent.`, {
        ruleId: label,
      }),
    );
  }
  if (rule?.persistent && rule?.renamePolicy === 'allowed') {
    errors.push(
      issue('persistent-freely-renamable', `${label} is persistent and cannot be freely renamed.`, {
        ruleId: label,
      }),
    );
  }
  if (
    rule?.persistent &&
    ['rename-display-only', 'replace-before-release'].includes(rule?.strategy)
  ) {
    errors.push(
      issue(
        'persistent-without-migration',
        `${label} is persistent but has no compatibility or migration strategy.`,
        { ruleId: label },
      ),
    );
  }
  if (NETWORK_CATEGORIES.has(rule?.category) && !NETWORK_STRATEGIES.has(rule?.strategy)) {
    errors.push(
      issue(
        'network-without-transition',
        `${label} network identifier needs a transition-compatible strategy.`,
        { ruleId: label },
      ),
    );
  }
  if (rule?.category === 'client-storage-key' && !STORAGE_STRATEGIES.has(rule?.strategy)) {
    errors.push(
      issue(
        'storage-without-compatibility',
        `${label} storage key needs a compatibility strategy.`,
        { ruleId: label },
      ),
    );
  }
  if (
    ['database-identifier', 'database-value'].includes(rule?.category) &&
    !DATABASE_STRATEGIES.has(rule?.strategy)
  ) {
    errors.push(
      issue(
        'database-without-migration',
        `${label} database identifier must stay stable or define a migration.`,
        { ruleId: label },
      ),
    );
  }
  if (
    ['docker-or-infrastructure', 'filesystem-path'].includes(rule?.category) &&
    !INFRASTRUCTURE_STRATEGIES.has(rule?.strategy)
  ) {
    errors.push(
      issue(
        'infrastructure-without-migration',
        `${label} infrastructure identifier needs a migration-compatible strategy.`,
        { ruleId: label },
      ),
    );
  }
  if (
    ['desktop-app-identity', 'mobile-app-identity'].includes(rule?.category) &&
    !APPLICATION_STRATEGIES.has(rule?.strategy)
  ) {
    errors.push(
      issue(
        'application-without-transition',
        `${label} application identity needs a transition-compatible strategy.`,
        { ruleId: label },
      ),
    );
  }
  if (
    ['economic-identifier', 'web3-identifier'].includes(rule?.category) &&
    !ECONOMIC_STRATEGIES.has(rule?.strategy)
  ) {
    errors.push(
      issue(
        'economic-without-review',
        `${label} economic identifier needs an economic compatibility strategy.`,
        { ruleId: label },
      ),
    );
  }
  if (
    rule?.category === 'display-label' &&
    rule?.renamePolicy === 'allowed' &&
    (rule?.persistent || rule?.strategy !== 'rename-display-only')
  ) {
    errors.push(
      issue(
        'invalid-display-rename',
        `${label} display-only rename must be nonpersistent and use rename-display-only.`,
        { ruleId: label },
      ),
    );
  }
  const uncertain =
    rule?.stability === 'unknown' ||
    rule?.renamePolicy === 'unknown' ||
    rule?.strategy === 'investigate-before-change' ||
    rule?.category === 'unknown-sensitive';
  if (uncertain && (!Array.isArray(rule?.uncertainties) || rule.uncertainties.length === 0)) {
    errors.push(
      issue('missing-uncertainty', `${label} must explain its uncertainty.`, { ruleId: label }),
    );
  }
  if (rule?.category === 'generated-mirror') {
    if (rule?.strategy !== 'generated-from-source') {
      errors.push(
        issue(
          'invalid-generated-strategy',
          `${label} generated mirror must use generated-from-source.`,
          { ruleId: label },
        ),
      );
    }
    if (!Array.isArray(rule?.sourceRuleIds) || rule.sourceRuleIds.length === 0) {
      errors.push(
        issue(
          'missing-generated-source',
          `${label} generated mirror must reference source rules.`,
          { ruleId: label },
        ),
      );
    }
  } else if (Array.isArray(rule?.sourceRuleIds) && rule.sourceRuleIds.length > 0) {
    errors.push(
      issue(
        'unexpected-generated-source',
        `${label} is not a generated mirror but references source rules.`,
        { ruleId: label },
      ),
    );
  }
}

function hasTextExtension(relativePath, extensions) {
  const lower = relativePath.toLowerCase();
  return extensions.some((extension) => lower.endsWith(extension.toLowerCase()));
}

function expandScope(repoRoot, scope, errors) {
  validateObjectKeys(scope, SCOPE_KEYS, 'scope', errors);
  const roots = Array.isArray(scope?.roots) ? scope.roots : [];
  const files = Array.isArray(scope?.files) ? scope.files : [];
  const pathRoots = Array.isArray(scope?.pathRoots) ? scope.pathRoots : [];
  const pathFiles = Array.isArray(scope?.pathFiles) ? scope.pathFiles : [];
  const textExtensions = Array.isArray(scope?.textExtensions) ? scope.textExtensions : [];
  const exclusions = Array.isArray(scope?.exclusions) ? scope.exclusions : [];
  for (const [label, values, allowEmpty] of [
    ['scope.roots', roots, false],
    ['scope.files', files, true],
    ['scope.pathRoots', pathRoots, false],
    ['scope.pathFiles', pathFiles, true],
    ['scope.textExtensions', textExtensions, false],
  ]) {
    validateUniqueStrings(values, label, errors, { allowEmpty });
  }
  validatePortablePaths(roots, 'scope.roots', errors);
  validatePortablePaths(files, 'scope.files', errors);
  validatePortablePaths(pathRoots, 'scope.pathRoots', errors);
  validatePortablePaths(pathFiles, 'scope.pathFiles', errors);
  for (const extension of textExtensions) {
    if (!/^\.[a-z0-9.]+$/i.test(extension)) {
      errors.push(issue('invalid-text-extension', `Invalid text extension: ${String(extension)}.`));
    }
  }

  const contentFiles = new Set();
  const allPathFiles = new Set();
  for (const root of roots) {
    const absoluteRoot = resolveCanonicalRepoPath(repoRoot, root, 'directory', errors, {
      path: root,
    });
    if (!absoluteRoot) continue;
    for (const file of walkFiles(absoluteRoot)) {
      const relative = normalizedPath(path.relative(repoRoot, file));
      if (hasTextExtension(relative, textExtensions)) contentFiles.add(relative);
    }
  }
  for (const file of files) {
    const absoluteFile = resolveCanonicalRepoPath(repoRoot, file, 'file', errors, { path: file });
    if (absoluteFile) contentFiles.add(normalizedPath(file));
  }
  for (const root of pathRoots) {
    const absoluteRoot = resolveCanonicalRepoPath(repoRoot, root, 'directory', errors, {
      path: root,
    });
    if (!absoluteRoot) continue;
    for (const file of walkFiles(absoluteRoot)) {
      allPathFiles.add(normalizedPath(path.relative(repoRoot, file)));
    }
  }
  for (const file of pathFiles) {
    const absoluteFile = resolveCanonicalRepoPath(repoRoot, file, 'file', errors, { path: file });
    if (absoluteFile) allPathFiles.add(normalizedPath(file));
  }

  if (!Array.isArray(scope?.exclusions))
    errors.push(issue('invalid-scope', 'scope.exclusions must be an array.'));
  const exclusionCounts = new Map();
  const exclusionHashes = new Map();
  const excluded = new Set();
  const exclusionIds = new Set();
  const candidates = new Set([...contentFiles, ...allPathFiles]);
  for (const [index, exclusion] of exclusions.entries()) {
    const label = nonEmptyString(exclusion?.id) ? exclusion.id : `scope.exclusions[${index}]`;
    validateObjectKeys(exclusion, EXCLUSION_KEYS, label, errors);
    if (!nonEmptyString(exclusion?.id) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(exclusion.id)) {
      errors.push(issue('invalid-exclusion-id', `${label} must have a kebab-case id.`));
      continue;
    }
    if (exclusionIds.has(exclusion.id))
      errors.push(issue('duplicate-exclusion-id', `Duplicate exclusion id: ${exclusion.id}.`));
    exclusionIds.add(exclusion.id);
    validateUniqueStrings(exclusion.paths, `${label}.paths`, errors, { allowEmpty: false });
    validatePortablePaths(exclusion.paths, `${label}.paths`, errors);
    if (!nonEmptyString(exclusion.justification)) {
      errors.push(issue('missing-exclusion-justification', `${label} needs a justification.`));
    }
    const excludedByRule = new Set();
    if (Array.isArray(exclusion.paths)) {
      for (const pattern of exclusion.paths) {
        const matched = [...candidates].filter((candidate) => matches(pattern, candidate));
        if (matched.length === 0)
          errors.push(
            issue('empty-exclusion-path', `${label} path matches no scoped file: ${pattern}.`),
          );
        for (const candidate of matched) excludedByRule.add(candidate);
      }
    }
    const hash = inventoryHash(excludedByRule);
    exclusionCounts.set(exclusion.id, excludedByRule.size);
    exclusionHashes.set(exclusion.id, hash);
    if (!Number.isInteger(exclusion.expectedPathCount) || exclusion.expectedPathCount < 0) {
      errors.push(
        issue(
          'invalid-exclusion-count',
          `${label} expectedPathCount must be a nonnegative integer.`,
        ),
      );
    } else if (exclusion.expectedPathCount !== excludedByRule.size) {
      errors.push(
        issue(
          'exclusion-inventory-count-drift',
          `${label} expected ${exclusion.expectedPathCount} paths but excludes ${excludedByRule.size}.`,
          { ruleId: exclusion.id },
        ),
      );
    }
    if (!/^[a-f0-9]{64}$/.test(exclusion.pathInventorySha256 ?? '')) {
      errors.push(
        issue(
          'invalid-exclusion-hash',
          `${label} pathInventorySha256 must be a lowercase SHA-256.`,
        ),
      );
    } else if (exclusion.pathInventorySha256 !== hash) {
      errors.push(
        issue(
          'exclusion-inventory-hash-drift',
          `${label} path inventory changed. Actual SHA-256: ${hash}.`,
          { ruleId: exclusion.id },
        ),
      );
    }
    for (const candidate of excludedByRule) {
      if (excluded.has(candidate))
        errors.push(
          issue(
            'ambiguous-exclusion',
            `Path is covered by multiple scope exclusions: ${candidate}.`,
            { path: candidate },
          ),
        );
      excluded.add(candidate);
    }
  }

  return {
    contentFiles: [...contentFiles].filter((file) => !excluded.has(file)).sort(),
    pathFiles: [...allPathFiles].filter((file) => !excluded.has(file)).sort(),
    excludedPathCount: excluded.size,
    exclusionCounts,
    exclusionHashes,
  };
}

function compileDetector(detector) {
  const source =
    detector.kind === 'literal' ? escapeRegex(detector.expression) : detector.expression;
  return new RegExp(source, `${detector.flags ?? ''}g`);
}

function lineAndColumn(content, offset) {
  const before = content.slice(0, offset);
  const lines = before.split('\n');
  return { line: lines.length, column: lines[lines.length - 1].length + 1 };
}

function findOccurrences(repoRoot, scope, detectors, errors) {
  const occurrences = [];
  const contentCache = new Map();
  const invalidValueGroupDetectors = new Set();

  function scopedContent(relativePath) {
    if (contentCache.has(relativePath)) return contentCache.get(relativePath);
    try {
      const content = readFileSync(path.join(repoRoot, ...relativePath.split('/')), 'utf8');
      contentCache.set(relativePath, content);
      return content;
    } catch (error) {
      errors.push(
        issue(
          'unreadable-file',
          `Cannot read scoped text file ${relativePath}: ${error instanceof Error ? error.message : String(error)}.`,
          { path: relativePath },
        ),
      );
      contentCache.set(relativePath, null);
      return null;
    }
  }

  function matchedValue(detector, match, relativePath) {
    if (detector.valueGroup === undefined) return match[0];
    const value = match[detector.valueGroup];
    if (typeof value === 'string') return value;
    if (!invalidValueGroupDetectors.has(detector.id)) {
      errors.push(
        issue(
          'unmatched-detector-value-group',
          `Detector ${detector.id} valueGroup ${detector.valueGroup} did not capture a value in ${relativePath}.`,
          { detectorId: detector.id, path: relativePath },
        ),
      );
      invalidValueGroupDetectors.add(detector.id);
    }
    return match[0];
  }

  for (const detector of detectors) {
    let expression;
    try {
      expression = compileDetector(detector);
    } catch {
      continue;
    }
    if (detector.target === 'content' || detector.target === 'both') {
      for (const relativePath of scope.contentFiles) {
        if (
          detector.paths?.length &&
          !detector.paths.some((pattern) => matches(pattern, relativePath))
        )
          continue;
        if ((detector.excludePaths ?? []).some((pattern) => matches(pattern, relativePath)))
          continue;
        const content = scopedContent(relativePath);
        if (content === null) continue;
        expression.lastIndex = 0;
        let match = expression.exec(content);
        while (match !== null) {
          if (match[0].length === 0) break;
          const location = lineAndColumn(content, match.index);
          occurrences.push({
            detectorId: detector.id,
            target: 'content',
            path: relativePath,
            value: matchedValue(detector, match, relativePath),
            line: location.line,
            column: location.column,
            offset: match.index,
          });
          match = expression.exec(content);
        }
      }
    }
    if (detector.target === 'path' || detector.target === 'both') {
      for (const relativePath of scope.pathFiles) {
        if (
          detector.paths?.length &&
          !detector.paths.some((pattern) => matches(pattern, relativePath))
        )
          continue;
        if ((detector.excludePaths ?? []).some((pattern) => matches(pattern, relativePath)))
          continue;
        expression.lastIndex = 0;
        let match = expression.exec(relativePath);
        while (match !== null) {
          if (match[0].length === 0) break;
          occurrences.push({
            detectorId: detector.id,
            target: 'path',
            path: relativePath,
            value: matchedValue(detector, match, relativePath),
            line: null,
            column: null,
            offset: match.index,
          });
          match = expression.exec(relativePath);
        }
      }
    }
  }
  occurrences.sort((left, right) =>
    codePointCompare(
      `${left.path}\0${left.target}\0${left.detectorId}\0${String(left.offset).padStart(12, '0')}`,
      `${right.path}\0${right.target}\0${right.detectorId}\0${String(right.offset).padStart(12, '0')}`,
    ),
  );
  const ordinals = new Map();
  return occurrences.map((occurrence) => {
    const ordinalKey = `${occurrence.target}\0${occurrence.path}\0${occurrence.detectorId}\0${occurrence.value}`;
    const ordinal = (ordinals.get(ordinalKey) ?? 0) + 1;
    ordinals.set(ordinalKey, ordinal);
    return {
      ...occurrence,
      key: `${occurrence.target}\0${occurrence.path}\0${occurrence.detectorId}\0${occurrence.offset}`,
      inventoryToken: `${ordinalKey}\0${ordinal}`,
    };
  });
}

function emptyResult(errors) {
  return {
    ok: false,
    errors,
    contentFileCount: 0,
    pathFileCount: 0,
    occurrenceCount: 0,
    detectorCount: 0,
    ruleCount: 0,
    excludedPathCount: 0,
    summaryByCategory: {},
    summaryByStrategy: {},
    ruleOccurrenceCounts: {},
    ruleOccurrenceHashes: {},
    exclusionPathCounts: {},
    exclusionPathHashes: {},
  };
}

export function verifyIdentifierCompatibility({ repoRoot, registry }) {
  const errors = [];
  const absoluteRepoRoot = path.resolve(repoRoot);
  if (!registry || typeof registry !== 'object' || Array.isArray(registry)) {
    return emptyResult([issue('invalid-registry', 'Registry must be a JSON object.')]);
  }
  validateObjectKeys(registry, REGISTRY_KEYS, 'registry', errors);
  if (registry.registryVersion !== 1)
    errors.push(issue('invalid-registry-version', 'registryVersion must be 1.'));
  if (!nonEmptyString(registry.$schema))
    errors.push(issue('missing-schema-reference', 'Registry must reference its JSON schema.'));

  const detectors = Array.isArray(registry.detectors) ? registry.detectors : [];
  const rules = Array.isArray(registry.rules) ? registry.rules : [];
  if (!Array.isArray(registry.detectors))
    errors.push(issue('invalid-detectors', 'detectors must be an array.'));
  if (!Array.isArray(registry.rules))
    errors.push(issue('invalid-rules', 'rules must be an array.'));
  const detectorIds = new Set();
  for (const [index, detector] of detectors.entries()) {
    validateDetector(detector, index, errors);
    if (nonEmptyString(detector?.id)) {
      if (detectorIds.has(detector.id))
        errors.push(
          issue('duplicate-detector-id', `Duplicate detector id: ${detector.id}.`, {
            detectorId: detector.id,
          }),
        );
      detectorIds.add(detector.id);
    }
  }
  const ruleIds = new Set();
  for (const [index, rule] of rules.entries()) {
    validateRule(rule, index, absoluteRepoRoot, errors);
    if (nonEmptyString(rule?.id)) {
      if (ruleIds.has(rule.id))
        errors.push(
          issue('duplicate-rule-id', `Duplicate rule id: ${rule.id}.`, { ruleId: rule.id }),
        );
      ruleIds.add(rule.id);
    }
  }
  for (const rule of rules) {
    for (const detectorId of rule?.coverage?.detectorIds ?? []) {
      if (!detectorIds.has(detectorId))
        errors.push(
          issue('unknown-detector', `Rule ${rule.id} references unknown detector ${detectorId}.`, {
            ruleId: rule.id,
            detectorId,
          }),
        );
    }
    for (const sourceRuleId of rule?.sourceRuleIds ?? []) {
      if (!ruleIds.has(sourceRuleId))
        errors.push(
          issue(
            'unknown-source-rule',
            `Rule ${rule.id} references unknown source rule ${sourceRuleId}.`,
            { ruleId: rule.id },
          ),
        );
    }
  }

  const scope = expandScope(absoluteRepoRoot, registry.scope, errors);
  const scopedDetectorCandidates = new Set([...scope.contentFiles, ...scope.pathFiles]);
  for (const detector of detectors) {
    for (const pattern of detector?.paths ?? []) {
      if (![...scopedDetectorCandidates].some((candidate) => matches(pattern, candidate))) {
        errors.push(
          issue(
            'missing-detector-path',
            `Detector ${detector.id} path matches no scoped file: ${pattern}.`,
            { detectorId: detector.id },
          ),
        );
      }
    }
    for (const pattern of detector?.excludePaths ?? []) {
      if (![...scopedDetectorCandidates].some((candidate) => matches(pattern, candidate))) {
        errors.push(
          issue(
            'missing-detector-exclusion',
            `Detector ${detector.id} exclusion matches no scoped file: ${pattern}.`,
            { detectorId: detector.id },
          ),
        );
      }
    }
  }
  const validDetectors = detectors.filter(
    (detector) =>
      nonEmptyString(detector?.id) &&
      DETECTOR_TARGETS.has(detector?.target) &&
      DETECTOR_KINDS.has(detector?.kind) &&
      nonEmptyString(detector?.expression) &&
      typeof detector?.flags === 'string' &&
      !/[^imu]/.test(detector.flags),
  );
  const occurrences = findOccurrences(absoluteRepoRoot, scope, validDetectors, errors);
  const occurrenceMatches = new Map(occurrences.map((occurrence) => [occurrence.key, []]));
  const ruleOccurrences = new Map();
  const ruleHashes = new Map();
  const scopedCandidates = new Set([...scope.contentFiles, ...scope.pathFiles]);

  for (const rule of rules) {
    if (!rule?.coverage || !Array.isArray(rule.coverage.paths)) continue;
    for (const pattern of rule.coverage.paths) {
      if (![...scopedCandidates].some((candidate) => matches(pattern, candidate))) {
        errors.push(
          issue('missing-rule-path', `Rule ${rule.id} path matches no scoped file: ${pattern}.`, {
            ruleId: rule.id,
          }),
        );
      }
    }
    for (const pattern of rule.coverage.excludePaths ?? []) {
      if (![...scopedCandidates].some((candidate) => matches(pattern, candidate))) {
        errors.push(
          issue(
            'missing-rule-exclusion',
            `Rule ${rule.id} exclusion matches no scoped file: ${pattern}.`,
            { ruleId: rule.id },
          ),
        );
      }
    }
    const covered = occurrences.filter((occurrence) => {
      if (!rule.coverage.detectorIds.includes(occurrence.detectorId)) return false;
      if (!rule.coverage.targets.includes(occurrence.target)) return false;
      if (!rule.coverage.paths.some((pattern) => matches(pattern, occurrence.path))) return false;
      if ((rule.coverage.excludePaths ?? []).some((pattern) => matches(pattern, occurrence.path)))
        return false;
      return true;
    });
    for (const occurrence of covered) occurrenceMatches.get(occurrence.key)?.push(rule.id);
    const hash = inventoryHash(covered.map((occurrence) => occurrence.inventoryToken));
    ruleOccurrences.set(rule.id, covered);
    ruleHashes.set(rule.id, hash);
    if (covered.length === 0)
      errors.push(
        issue('empty-rule', `Rule ${rule.id} covers no sensitive occurrence.`, { ruleId: rule.id }),
      );
    if (rule.coverage.expectedOccurrenceCount !== covered.length) {
      errors.push(
        issue(
          'rule-inventory-count-drift',
          `Rule ${rule.id} expected ${rule.coverage.expectedOccurrenceCount} occurrences but covers ${covered.length}.`,
          { ruleId: rule.id },
        ),
      );
    }
    if (rule.coverage.occurrenceInventorySha256 !== hash) {
      errors.push(
        issue(
          'rule-inventory-hash-drift',
          `Rule ${rule.id} occurrence inventory changed. Actual SHA-256: ${hash}.`,
          { ruleId: rule.id },
        ),
      );
    }
  }

  for (const occurrence of occurrences) {
    const matchedRuleIds = occurrenceMatches.get(occurrence.key) ?? [];
    const location =
      occurrence.line == null
        ? occurrence.path
        : `${occurrence.path}:${occurrence.line}:${occurrence.column}`;
    if (matchedRuleIds.length === 0) {
      errors.push(
        issue(
          'uncovered',
          `Sensitive occurrence is not registered: ${location} (${occurrence.detectorId}: ${occurrence.value}).`,
          { path: occurrence.path, detectorId: occurrence.detectorId },
        ),
      );
    } else if (matchedRuleIds.length > 1) {
      errors.push(
        issue(
          'ambiguous',
          `Sensitive occurrence has multiple rules: ${location} (${matchedRuleIds.join(', ')}).`,
          { path: occurrence.path, detectorId: occurrence.detectorId, ruleIds: matchedRuleIds },
        ),
      );
    }
  }

  const ruleById = new Map(rules.map((rule) => [rule.id, rule]));
  const detectorById = new Map(detectors.map((detector) => [detector.id, detector]));
  for (const rule of rules) {
    if (rule?.category !== 'generated-mirror') continue;
    const covered = ruleOccurrences.get(rule.id) ?? [];
    const sourceRules = (rule.sourceRuleIds ?? []).map((id) => ruleById.get(id)).filter(Boolean);
    if (sourceRules.some((sourceRule) => sourceRule.category === 'generated-mirror')) {
      errors.push(
        issue(
          'generated-source-is-mirror',
          `Generated rule ${rule.id} may not source another generated mirror.`,
          { ruleId: rule.id },
        ),
      );
    }
    const missingSources = new Set();
    for (const occurrence of covered) {
      const detectorId = occurrence.detectorId;
      const detector = detectorById.get(detectorId);
      const generatedValue = canonicalSourceValue(occurrence.value, detector);
      const sourceExists = sourceRules.some((sourceRule) =>
        (ruleOccurrences.get(sourceRule.id) ?? []).some(
          (sourceOccurrence) =>
            sourceOccurrence.detectorId === detectorId &&
            (detector?.sourceValueMode === 'family' ||
              canonicalSourceValue(sourceOccurrence.value, detector) === generatedValue),
        ),
      );
      const missingKey = `${detectorId}\0${generatedValue}`;
      if (!sourceExists && !missingSources.has(missingKey)) {
        errors.push(
          issue(
            'generated-without-source',
            `Generated rule ${rule.id} has ${detectorId} value ${occurrence.value} without a registered source value.`,
            { ruleId: rule.id, detectorId },
          ),
        );
        missingSources.add(missingKey);
      }
    }
  }

  const summaryByCategory = {};
  const summaryByStrategy = {};
  for (const occurrence of occurrences) {
    const matchedRuleIds = occurrenceMatches.get(occurrence.key) ?? [];
    if (matchedRuleIds.length !== 1) continue;
    const rule = ruleById.get(matchedRuleIds[0]);
    if (!rule) continue;
    summaryByCategory[rule.category] = (summaryByCategory[rule.category] ?? 0) + 1;
    summaryByStrategy[rule.strategy] = (summaryByStrategy[rule.strategy] ?? 0) + 1;
  }

  return {
    ok: errors.length === 0,
    errors,
    contentFileCount: scope.contentFiles.length,
    pathFileCount: scope.pathFiles.length,
    occurrenceCount: occurrences.length,
    detectorCount: detectors.length,
    ruleCount: rules.length,
    excludedPathCount: scope.excludedPathCount,
    summaryByCategory,
    summaryByStrategy,
    ruleOccurrenceCounts: Object.fromEntries(
      [...ruleOccurrences.entries()]
        .map(([id, covered]) => [id, covered.length])
        .sort(([left], [right]) => codePointCompare(left, right)),
    ),
    ruleOccurrenceHashes: Object.fromEntries(
      [...ruleHashes.entries()].sort(([left], [right]) => codePointCompare(left, right)),
    ),
    exclusionPathCounts: Object.fromEntries(
      [...scope.exclusionCounts.entries()].sort(([left], [right]) => codePointCompare(left, right)),
    ),
    exclusionPathHashes: Object.fromEntries(
      [...scope.exclusionHashes.entries()].sort(([left], [right]) => codePointCompare(left, right)),
    ),
  };
}

export function formatIdentifierCompatibilityReport(result) {
  const lines = [
    `Identifier compatibility verification: ${result.ok ? 'PASS' : 'FAIL'}`,
    `Scoped text files: ${result.contentFileCount}`,
    `Scoped paths: ${result.pathFileCount}`,
    `Sensitive occurrences: ${result.occurrenceCount}`,
    `Detectors: ${result.detectorCount}`,
    `Rules: ${result.ruleCount}`,
    `Excluded control paths: ${result.excludedPathCount}`,
    'By category:',
  ];
  for (const [category, count] of Object.entries(result.summaryByCategory).sort(([left], [right]) =>
    codePointCompare(left, right),
  )) {
    lines.push(`  ${category}: ${count}`);
  }
  lines.push('By strategy:');
  for (const [strategy, count] of Object.entries(result.summaryByStrategy).sort(([left], [right]) =>
    codePointCompare(left, right),
  )) {
    lines.push(`  ${strategy}: ${count}`);
  }
  if (result.errors.length > 0) {
    lines.push(`Errors: ${result.errors.length}`);
    for (const error of result.errors) lines.push(`  [${error.code}] ${error.message}`);
  }
  return lines.join('\n');
}
