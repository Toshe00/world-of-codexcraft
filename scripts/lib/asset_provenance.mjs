import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';

export const PROVENANCE_STATUSES = Object.freeze([
  'reusable',
  'attribution-required',
  'replace-before-release',
  'blocked-pending-proof',
  'project-owned-proof-required',
  'purchased-license-non-transferable',
  'unknown',
  'third-party-trademark',
]);

export const DECLARED_LICENSES = Object.freeze([
  'CC0-1.0',
  'CC-BY-3.0',
  'CC-BY-4.0',
  'MIT',
  'OFL-1.1',
  'LicenseRef-CraftPix-Premium',
  'NOASSERTION',
]);

const CATEGORIES = new Set([
  'art',
  'audio',
  'document',
  'font',
  'model',
  'texture',
  'trademark',
  'video',
]);
const ATTRIBUTION_VALUES = new Set([
  'not-required',
  'required',
  'notice-required',
  'trademark-guidelines',
  'unknown',
]);
const RIGHTS_VALUES = new Set(['allowed', 'prohibited', 'licensee-only', 'unknown']);
const TRANSFORMATION_VALUES = new Set([
  'unmodified',
  'converted',
  'optimized',
  'generated',
  'commissioned',
  'procedural',
  'composite',
  'unknown',
]);
const EVIDENCE_TYPES = new Set([
  'repository-file',
  'source-url',
  'embedded-metadata',
  'source-comment',
  'manual-review',
]);
const UNCERTAIN_STATUSES = new Set([
  'replace-before-release',
  'blocked-pending-proof',
  'project-owned-proof-required',
  'purchased-license-non-transferable',
  'unknown',
]);
const UNCERTAIN_LICENSES = new Set(['NOASSERTION']);
const GLOB_CACHE = new Map();
const REGISTRY_KEYS = new Set(['$schema', 'registryVersion', 'scope', 'rules']);
const SCOPE_KEYS = new Set(['roots', 'files', 'nonAssetExclusions', 'embeddedAssets']);
const SCOPE_ROOT_KEYS = new Set(['path', 'include']);
const EXCLUSION_KEYS = new Set([
  'id',
  'paths',
  'justification',
  'expectedPathCount',
  'pathInventorySha256',
]);
const EMBEDDED_KEYS = new Set(['id', 'container', 'description', 'containerSha256']);
const RULE_KEYS = new Set([
  'id',
  'category',
  'coverage',
  'sourceOrAuthor',
  'provenanceUrl',
  'declaredLicense',
  'evidence',
  'knownRightsHolder',
  'attribution',
  'redistribution',
  'commercialUse',
  'transformationStatus',
  'status',
  'justification',
  'notes',
]);
const COVERAGE_KEYS = new Set([
  'paths',
  'excludePaths',
  'embeddedAssetIds',
  'expectedPathCount',
  'pathInventorySha256',
]);
const EVIDENCE_KEYS = new Set(['type', 'reference', 'description']);

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

function issue(code, message, details = {}) {
  return { code, message, ...details };
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function codePointCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function validateObjectKeys(value, allowed, label, errors) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      errors.push(issue('unexpected-property', `${label} has unsupported property ${key}.`));
    }
  }
}

function validateUniqueStrings(values, label, errors) {
  if (!Array.isArray(values)) return;
  if (values.some((value) => !nonEmptyString(value))) {
    errors.push(issue('invalid-path-list', `${label} must contain only nonempty strings.`));
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

function inventoryHash(assets) {
  return createHash('sha256')
    .update([...assets].sort().join('\n'))
    .digest('hex');
}

function contentHash(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function validUrl(value) {
  if (value == null) return true;
  if (!nonEmptyString(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function validateRule(rule, index, repoRoot, errors) {
  const label = nonEmptyString(rule?.id) ? rule.id : `rules[${index}]`;
  validateObjectKeys(rule, RULE_KEYS, label, errors);
  validateObjectKeys(rule?.coverage, COVERAGE_KEYS, `${label}.coverage`, errors);
  if (!nonEmptyString(rule?.id) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(rule.id)) {
    errors.push(issue('invalid-rule-id', `${label} must have a kebab-case id.`, { ruleId: label }));
  }
  if (!CATEGORIES.has(rule?.category)) {
    errors.push(
      issue('invalid-category', `${label} has unsupported category ${String(rule?.category)}.`, {
        ruleId: label,
      }),
    );
  }
  if (!PROVENANCE_STATUSES.includes(rule?.status)) {
    errors.push(
      issue('invalid-status', `${label} has unsupported status ${String(rule?.status)}.`, {
        ruleId: label,
      }),
    );
  }
  if (!DECLARED_LICENSES.includes(rule?.declaredLicense)) {
    errors.push(
      issue(
        'invalid-license',
        `${label} has unsupported declared license ${String(rule?.declaredLicense)}.`,
        { ruleId: label },
      ),
    );
  }
  if (!nonEmptyString(rule?.sourceOrAuthor)) {
    errors.push(
      issue('missing-source', `${label} must identify a source or author.`, { ruleId: label }),
    );
  }
  if (!validUrl(rule?.provenanceUrl)) {
    errors.push(issue('invalid-url', `${label} has an invalid provenance URL.`, { ruleId: label }));
  }
  if (rule?.knownRightsHolder !== null && !nonEmptyString(rule?.knownRightsHolder)) {
    errors.push(
      issue('invalid-rights-holder', `${label} must use a nonempty holder or null.`, {
        ruleId: label,
      }),
    );
  }
  if (!ATTRIBUTION_VALUES.has(rule?.attribution)) {
    errors.push(
      issue('invalid-attribution', `${label} has an unsupported attribution value.`, {
        ruleId: label,
      }),
    );
  }
  if (!RIGHTS_VALUES.has(rule?.redistribution)) {
    errors.push(
      issue('invalid-redistribution', `${label} has an unsupported redistribution value.`, {
        ruleId: label,
      }),
    );
  }
  if (!RIGHTS_VALUES.has(rule?.commercialUse)) {
    errors.push(
      issue('invalid-commercial-use', `${label} has an unsupported commercial-use value.`, {
        ruleId: label,
      }),
    );
  }
  if (
    !Array.isArray(rule?.transformationStatus) ||
    rule.transformationStatus.length === 0 ||
    rule.transformationStatus.some((value) => !TRANSFORMATION_VALUES.has(value)) ||
    new Set(rule.transformationStatus).size !== rule.transformationStatus.length
  ) {
    errors.push(
      issue('invalid-transformation', `${label} has an unsupported transformation status.`, {
        ruleId: label,
      }),
    );
  }
  if (!nonEmptyString(rule?.justification)) {
    errors.push(
      issue('missing-justification', `${label} must include a justification.`, { ruleId: label }),
    );
  }
  if (!Array.isArray(rule?.notes)) {
    errors.push(issue('invalid-notes', `${label} notes must be an array.`, { ruleId: label }));
  } else if (rule.notes.some((note) => !nonEmptyString(note))) {
    errors.push(
      issue('invalid-notes', `${label} notes must contain only nonempty strings.`, {
        ruleId: label,
      }),
    );
  } else if (
    UNCERTAIN_STATUSES.has(rule?.status) &&
    rule.notes.every((note) => !nonEmptyString(note))
  ) {
    errors.push(
      issue('missing-uncertainty-note', `${label} must state its uncertainty or required proof.`, {
        ruleId: label,
      }),
    );
  }
  if (!Array.isArray(rule?.evidence) || rule.evidence.length === 0) {
    errors.push(
      issue('missing-evidence', `${label} must contain at least one evidence entry.`, {
        ruleId: label,
      }),
    );
  } else {
    for (const [evidenceIndex, evidence] of rule.evidence.entries()) {
      validateObjectKeys(evidence, EVIDENCE_KEYS, `${label}.evidence[${evidenceIndex}]`, errors);
      if (!EVIDENCE_TYPES.has(evidence?.type)) {
        errors.push(
          issue(
            'invalid-evidence-type',
            `${label} evidence ${evidenceIndex} has an unsupported type.`,
            {
              ruleId: label,
            },
          ),
        );
      }
      if (!nonEmptyString(evidence?.reference) || !nonEmptyString(evidence?.description)) {
        errors.push(
          issue(
            'invalid-evidence',
            `${label} evidence ${evidenceIndex} needs a reference and description.`,
            {
              ruleId: label,
            },
          ),
        );
      } else if (evidence.type === 'source-url' && !validUrl(evidence.reference)) {
        errors.push(
          issue('invalid-evidence-url', `${label} evidence ${evidenceIndex} has an invalid URL.`, {
            ruleId: label,
          }),
        );
      } else if (evidence.type === 'repository-file') {
        const before = errors.length;
        resolveCanonicalRepoPath(repoRoot, evidence.reference, 'file', errors, { ruleId: label });
        if (errors.length > before) {
          errors.push(
            issue(
              'missing-evidence-file',
              `${label} references missing evidence file ${evidence.reference}.`,
              { ruleId: label },
            ),
          );
        }
      }
    }
  }
  if (
    UNCERTAIN_LICENSES.has(rule?.declaredLicense) &&
    (rule?.redistribution === 'allowed' || rule?.commercialUse === 'allowed')
  ) {
    errors.push(
      issue(
        'unsafe-rights-claim',
        `${label} cannot claim allowed rights while its declared license is uncertain.`,
        { ruleId: label },
      ),
    );
  }
  if (rule?.status === 'reusable' && rule?.declaredLicense !== 'CC0-1.0') {
    errors.push(
      issue('inconsistent-status-license', `${label} can be reusable only with CC0-1.0.`, {
        ruleId: label,
      }),
    );
  }
  if (
    rule?.status === 'attribution-required' &&
    !['CC-BY-3.0', 'CC-BY-4.0', 'MIT', 'OFL-1.1'].includes(rule?.declaredLicense)
  ) {
    errors.push(
      issue('inconsistent-status-license', `${label} has no supported attribution license.`, {
        ruleId: label,
      }),
    );
  }
  if (
    rule?.status === 'purchased-license-non-transferable' &&
    rule?.declaredLicense !== 'LicenseRef-CraftPix-Premium'
  ) {
    errors.push(
      issue(
        'inconsistent-status-license',
        `${label} must declare the CraftPix license reference.`,
        {
          ruleId: label,
        },
      ),
    );
  }
  if (
    !rule?.coverage ||
    !Array.isArray(rule.coverage.paths) ||
    !Array.isArray(rule.coverage.embeddedAssetIds)
  ) {
    errors.push(
      issue(
        'invalid-coverage',
        `${label} coverage must define paths and embeddedAssetIds arrays.`,
        {
          ruleId: label,
        },
      ),
    );
  }
  if (rule?.coverage?.excludePaths != null && !Array.isArray(rule.coverage.excludePaths)) {
    errors.push(
      issue('invalid-coverage', `${label} excludePaths must be an array when present.`, {
        ruleId: label,
      }),
    );
  }
  validateUniqueStrings(rule?.coverage?.paths, `${label}.coverage.paths`, errors);
  validateUniqueStrings(
    rule?.coverage?.excludePaths ?? [],
    `${label}.coverage.excludePaths`,
    errors,
  );
  validateUniqueStrings(
    rule?.coverage?.embeddedAssetIds,
    `${label}.coverage.embeddedAssetIds`,
    errors,
  );
  validatePortablePaths(rule?.coverage?.paths, `${label}.coverage.paths`, errors);
  validatePortablePaths(
    rule?.coverage?.excludePaths ?? [],
    `${label}.coverage.excludePaths`,
    errors,
  );
  if (!Number.isInteger(rule?.coverage?.expectedPathCount) || rule.coverage.expectedPathCount < 0) {
    errors.push(
      issue(
        'invalid-inventory-count',
        `${label} expectedPathCount must be a nonnegative integer.`,
        { ruleId: label },
      ),
    );
  }
  if (!/^[a-f0-9]{64}$/.test(rule?.coverage?.pathInventorySha256 ?? '')) {
    errors.push(
      issue('invalid-inventory-hash', `${label} pathInventorySha256 must be a lowercase SHA-256.`, {
        ruleId: label,
      }),
    );
  }
}

function expandScope(repoRoot, scope, errors) {
  const candidateFiles = new Set();
  const patternMatches = new Map();
  const exclusionCounts = new Map();
  const exclusionHashes = new Map();
  const embeddedContentHashes = new Map();
  validateObjectKeys(scope, SCOPE_KEYS, 'scope', errors);
  const roots = Array.isArray(scope?.roots) ? scope.roots : [];
  if (!Array.isArray(scope?.roots)) {
    errors.push(issue('invalid-scope', 'scope.roots must be an array.'));
  }

  for (const root of roots) {
    validateObjectKeys(root, SCOPE_ROOT_KEYS, 'scope root', errors);
    if (!nonEmptyString(root?.path) || !Array.isArray(root?.include) || root.include.length === 0) {
      errors.push(
        issue('invalid-scope-root', 'Every scope root needs a path and include patterns.'),
      );
      continue;
    }
    validateUniqueStrings(root.include, `scope root ${root.path}.include`, errors);
    validatePortablePaths(root.include, `scope root ${root.path}.include`, errors);
    const scopeRoot = normalizedPath(root.path);
    const absoluteRoot = resolveCanonicalRepoPath(repoRoot, root.path, 'directory', errors, {
      asset: scopeRoot,
    });
    if (!absoluteRoot) {
      errors.push(
        issue('missing-scope-root', `Scope root does not exist: ${scopeRoot}.`, {
          asset: scopeRoot,
        }),
      );
      continue;
    }
    const relativeFiles = walkFiles(absoluteRoot).map((file) =>
      normalizedPath(path.relative(absoluteRoot, file)),
    );
    for (const pattern of root.include) {
      const key = `${scopeRoot}:${pattern}`;
      const matched = relativeFiles.filter((file) => matches(pattern, file));
      patternMatches.set(key, matched.length);
      if (matched.length === 0) {
        errors.push(
          issue('empty-scope-pattern', `Scope pattern matches no file: ${scopeRoot}/${pattern}.`, {
            asset: `${scopeRoot}/${pattern}`,
          }),
        );
      }
      for (const file of matched) candidateFiles.add(`${scopeRoot}/${file}`);
    }
  }

  const exactFiles = Array.isArray(scope?.files) ? scope.files : [];
  if (!Array.isArray(scope?.files))
    errors.push(issue('invalid-scope', 'scope.files must be an array.'));
  validateUniqueStrings(exactFiles, 'scope.files', errors);
  validatePortablePaths(exactFiles, 'scope.files', errors);
  for (const file of exactFiles) {
    const normalized = normalizedPath(file);
    const absolutePath = resolveCanonicalRepoPath(repoRoot, file, 'file', errors, {
      asset: normalized,
    });
    if (!absolutePath) {
      errors.push(
        issue('missing-scope-file', `Scoped file does not exist: ${normalized}.`, {
          asset: normalized,
        }),
      );
    } else {
      candidateFiles.add(normalized);
    }
  }

  const exclusions = Array.isArray(scope?.nonAssetExclusions) ? scope.nonAssetExclusions : [];
  if (!Array.isArray(scope?.nonAssetExclusions)) {
    errors.push(issue('invalid-scope', 'scope.nonAssetExclusions must be an array.'));
  }
  const excludedFiles = new Set();
  const exclusionIds = new Set();
  for (const [index, exclusion] of exclusions.entries()) {
    validateObjectKeys(exclusion, EXCLUSION_KEYS, `scope.nonAssetExclusions[${index}]`, errors);
    if (
      !nonEmptyString(exclusion?.id) ||
      !nonEmptyString(exclusion?.justification) ||
      !Array.isArray(exclusion?.paths) ||
      !Number.isInteger(exclusion?.expectedPathCount) ||
      exclusion.expectedPathCount < 0 ||
      !/^[a-f0-9]{64}$/.test(exclusion?.pathInventorySha256 ?? '')
    ) {
      errors.push(issue('invalid-scope-exclusion', `Non-asset exclusion ${index} is incomplete.`));
      continue;
    }
    if (exclusionIds.has(exclusion.id)) {
      errors.push(
        issue('duplicate-exclusion-id', `Duplicate non-asset exclusion id: ${exclusion.id}.`),
      );
    }
    exclusionIds.add(exclusion.id);
    validateUniqueStrings(exclusion.paths, `${exclusion.id}.paths`, errors);
    validatePortablePaths(exclusion.paths, `${exclusion.id}.paths`, errors);
    const excludedByRule = new Set();
    for (const pattern of exclusion.paths) {
      const matched = [...candidateFiles].filter((file) => matches(pattern, file));
      if (matched.length === 0) {
        errors.push(
          issue(
            'empty-scope-exclusion',
            `Non-asset exclusion ${exclusion.id} matches no file: ${pattern}.`,
            {
              ruleId: exclusion.id,
            },
          ),
        );
      }
      for (const file of matched) excludedByRule.add(file);
    }
    const actualHash = inventoryHash(excludedByRule);
    exclusionCounts.set(exclusion.id, excludedByRule.size);
    exclusionHashes.set(exclusion.id, actualHash);
    if (exclusion.expectedPathCount !== excludedByRule.size) {
      errors.push(
        issue(
          'exclusion-inventory-count-drift',
          `Non-asset exclusion ${exclusion.id} expected ${exclusion.expectedPathCount} files but excludes ${excludedByRule.size}.`,
          { ruleId: exclusion.id },
        ),
      );
    }
    if (exclusion.pathInventorySha256 !== actualHash) {
      errors.push(
        issue(
          'exclusion-inventory-hash-drift',
          `Non-asset exclusion ${exclusion.id} path inventory changed. Actual SHA-256: ${actualHash}.`,
          { ruleId: exclusion.id },
        ),
      );
    }
    for (const file of excludedByRule) {
      if (excludedFiles.has(file)) {
        errors.push(
          issue(
            'ambiguous-scope-exclusion',
            `File is covered by multiple non-asset exclusions: ${file}.`,
            { asset: file },
          ),
        );
      }
      excludedFiles.add(file);
    }
  }

  const embeddedAssets = Array.isArray(scope?.embeddedAssets) ? scope.embeddedAssets : [];
  if (!Array.isArray(scope?.embeddedAssets)) {
    errors.push(issue('invalid-scope', 'scope.embeddedAssets must be an array.'));
  }
  const embeddedIds = new Set();
  for (const [index, embedded] of embeddedAssets.entries()) {
    validateObjectKeys(embedded, EMBEDDED_KEYS, `scope.embeddedAssets[${index}]`, errors);
    if (
      !nonEmptyString(embedded?.id) ||
      !nonEmptyString(embedded?.container) ||
      !nonEmptyString(embedded?.description) ||
      !/^[a-f0-9]{64}$/.test(embedded?.containerSha256 ?? '')
    ) {
      errors.push(
        issue(
          'invalid-embedded-asset',
          'Each embedded asset needs an id, container, and description.',
        ),
      );
      continue;
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(embedded.id)) {
      errors.push(
        issue('invalid-embedded-id', `Embedded asset id must be kebab-case: ${embedded.id}.`),
      );
    }
    if (embeddedIds.has(embedded.id)) {
      errors.push(
        issue('duplicate-embedded-id', `Duplicate embedded asset id: ${embedded.id}.`, {
          asset: embedded.id,
        }),
      );
    }
    embeddedIds.add(embedded.id);
    const container = normalizedPath(embedded.container);
    const absoluteContainer = resolveCanonicalRepoPath(
      repoRoot,
      embedded.container,
      'file',
      errors,
      {
        asset: embedded.id,
      },
    );
    if (!absoluteContainer) {
      errors.push(
        issue(
          'missing-embedded-container',
          `Embedded asset container does not exist: ${container}.`,
          {
            asset: embedded.id,
          },
        ),
      );
    } else {
      const actualHash = contentHash(absoluteContainer);
      embeddedContentHashes.set(embedded.id, actualHash);
      if (embedded.containerSha256 !== actualHash) {
        errors.push(
          issue(
            'embedded-container-drift',
            `Embedded asset container changed for ${embedded.id}. Actual SHA-256: ${actualHash}.`,
            { asset: embedded.id },
          ),
        );
      }
    }
  }

  const physicalAssets = [...candidateFiles].filter((file) => !excludedFiles.has(file)).sort();
  return {
    physicalAssets,
    embeddedIds: [...embeddedIds].sort(),
    excludedNonAssetCount: excludedFiles.size,
    patternMatches,
    exclusionCounts,
    exclusionHashes,
    embeddedContentHashes,
  };
}

export function verifyAssetProvenance({ repoRoot, registry }) {
  const errors = [];
  const absoluteRepoRoot = path.resolve(repoRoot);
  if (!registry || typeof registry !== 'object') {
    return {
      ok: false,
      errors: [issue('invalid-registry', 'Registry must be a JSON object.')],
      scopedAssetCount: 0,
      physicalAssetCount: 0,
      embeddedAssetCount: 0,
      excludedNonAssetCount: 0,
      ruleCount: 0,
      summaryByStatus: {},
      summaryByCategory: {},
    };
  }
  validateObjectKeys(registry, REGISTRY_KEYS, 'registry', errors);
  if (registry.registryVersion !== 1) {
    errors.push(issue('invalid-registry-version', 'registryVersion must be 1.'));
  }
  if (!nonEmptyString(registry.$schema)) {
    errors.push(issue('missing-schema-reference', 'Registry must reference its JSON schema.'));
  }

  const rules = Array.isArray(registry.rules) ? registry.rules : [];
  if (!Array.isArray(registry.rules))
    errors.push(issue('invalid-rules', 'rules must be an array.'));
  const ruleIds = new Set();
  for (const [index, rule] of rules.entries()) {
    validateRule(rule, index, absoluteRepoRoot, errors);
    if (nonEmptyString(rule?.id)) {
      if (ruleIds.has(rule.id)) {
        errors.push(
          issue('duplicate-rule-id', `Duplicate provenance rule id: ${rule.id}.`, {
            ruleId: rule.id,
          }),
        );
      }
      ruleIds.add(rule.id);
    }
  }

  const scope = expandScope(absoluteRepoRoot, registry.scope, errors);
  const physicalMatches = new Map(scope.physicalAssets.map((asset) => [asset, []]));
  const embeddedMatches = new Map(scope.embeddedIds.map((id) => [id, []]));
  const ruleCounts = new Map();
  const ruleHashes = new Map();

  for (const rule of rules) {
    if (
      !rule?.coverage ||
      !Array.isArray(rule.coverage.paths) ||
      !Array.isArray(rule.coverage.embeddedAssetIds)
    )
      continue;
    const includedByRule = new Set();
    for (const pattern of rule.coverage.paths) {
      const matched = scope.physicalAssets.filter((asset) => matches(pattern, asset));
      if (matched.length === 0) {
        errors.push(
          issue('empty-rule-path', `Rule ${rule.id} path matches no scoped asset: ${pattern}.`, {
            ruleId: rule.id,
          }),
        );
      }
      for (const asset of matched) includedByRule.add(asset);
    }
    for (const pattern of rule.coverage.excludePaths ?? []) {
      const matched = [...includedByRule].filter((asset) => matches(pattern, asset));
      if (matched.length === 0) {
        errors.push(
          issue(
            'empty-rule-exclusion',
            `Rule ${rule.id} exclusion matches no included asset: ${pattern}.`,
            {
              ruleId: rule.id,
            },
          ),
        );
      }
      for (const asset of matched) includedByRule.delete(asset);
    }
    for (const asset of includedByRule) physicalMatches.get(asset)?.push(rule.id);

    let embeddedCount = 0;
    for (const id of rule.coverage.embeddedAssetIds) {
      if (!embeddedMatches.has(id)) {
        errors.push(
          issue(
            'unknown-embedded-asset',
            `Rule ${rule.id} references unknown embedded asset ${id}.`,
            {
              ruleId: rule.id,
            },
          ),
        );
      } else {
        embeddedMatches.get(id).push(rule.id);
        embeddedCount += 1;
      }
    }
    const coveredAssets = [
      ...includedByRule,
      ...rule.coverage.embeddedAssetIds
        .filter((id) => embeddedMatches.has(id))
        .map((id) => `embedded:${id}`),
    ].sort();
    const actualInventoryHash = inventoryHash(coveredAssets);
    ruleCounts.set(rule.id, coveredAssets.length);
    ruleHashes.set(rule.id, actualInventoryHash);
    if (
      rule.coverage.expectedPathCount != null &&
      rule.coverage.expectedPathCount !== coveredAssets.length
    ) {
      errors.push(
        issue(
          'rule-inventory-count-drift',
          `Rule ${rule.id} expected ${rule.coverage.expectedPathCount} assets but covers ${coveredAssets.length}.`,
          { ruleId: rule.id },
        ),
      );
    }
    if (
      rule.coverage.pathInventorySha256 != null &&
      rule.coverage.pathInventorySha256 !== actualInventoryHash
    ) {
      errors.push(
        issue(
          'rule-inventory-hash-drift',
          `Rule ${rule.id} path inventory changed. Actual SHA-256: ${actualInventoryHash}.`,
          { ruleId: rule.id },
        ),
      );
    }
    if (includedByRule.size + embeddedCount === 0 && rule.coverage.paths.length === 0) {
      errors.push(issue('empty-rule', `Rule ${rule.id} covers no asset.`, { ruleId: rule.id }));
    }
  }

  const allMatches = [
    ...[...physicalMatches.entries()].map(([asset, ids]) => ({ asset, ids })),
    ...[...embeddedMatches.entries()].map(([id, ids]) => ({ asset: `embedded:${id}`, ids })),
  ];
  for (const { asset, ids } of allMatches) {
    if (ids.length === 0) {
      errors.push(issue('uncovered', `Scoped asset has no provenance rule: ${asset}.`, { asset }));
    } else if (ids.length > 1) {
      errors.push(
        issue(
          'ambiguous',
          `Scoped asset has multiple provenance rules: ${asset} (${ids.join(', ')}).`,
          {
            asset,
            ruleIds: ids,
          },
        ),
      );
    }
  }

  const ruleById = new Map(rules.map((rule) => [rule.id, rule]));
  const summaryByStatus = {};
  const summaryByCategory = {};
  for (const { ids } of allMatches) {
    if (ids.length !== 1) continue;
    const rule = ruleById.get(ids[0]);
    if (!rule) continue;
    summaryByStatus[rule.status] = (summaryByStatus[rule.status] ?? 0) + 1;
    summaryByCategory[rule.category] = (summaryByCategory[rule.category] ?? 0) + 1;
  }

  return {
    ok: errors.length === 0,
    errors,
    scopedAssetCount: scope.physicalAssets.length + scope.embeddedIds.length,
    physicalAssetCount: scope.physicalAssets.length,
    embeddedAssetCount: scope.embeddedIds.length,
    excludedNonAssetCount: scope.excludedNonAssetCount,
    ruleCount: rules.length,
    summaryByStatus,
    summaryByCategory,
    ruleAssetCounts: Object.fromEntries(
      [...ruleCounts.entries()].sort(([a], [b]) => codePointCompare(a, b)),
    ),
    ruleAssetHashes: Object.fromEntries(
      [...ruleHashes.entries()].sort(([a], [b]) => codePointCompare(a, b)),
    ),
    exclusionFileCounts: Object.fromEntries(
      [...scope.exclusionCounts.entries()].sort(([a], [b]) => codePointCompare(a, b)),
    ),
    exclusionFileHashes: Object.fromEntries(
      [...scope.exclusionHashes.entries()].sort(([a], [b]) => codePointCompare(a, b)),
    ),
    embeddedContentHashes: Object.fromEntries(
      [...scope.embeddedContentHashes.entries()].sort(([a], [b]) => codePointCompare(a, b)),
    ),
  };
}

export function formatAssetProvenanceReport(result) {
  const lines = [
    `Asset provenance verification: ${result.ok ? 'PASS' : 'FAIL'}`,
    `Scoped assets: ${result.scopedAssetCount} (${result.physicalAssetCount} files, ${result.embeddedAssetCount} embedded sets)`,
    `Excluded non-asset files: ${result.excludedNonAssetCount}`,
    `Provenance rules: ${result.ruleCount}`,
    'By status:',
  ];
  for (const [status, count] of Object.entries(result.summaryByStatus).sort(([a], [b]) =>
    codePointCompare(a, b),
  )) {
    lines.push(`  ${status}: ${count}`);
  }
  lines.push('By category:');
  for (const [category, count] of Object.entries(result.summaryByCategory).sort(([a], [b]) =>
    codePointCompare(a, b),
  )) {
    lines.push(`  ${category}: ${count}`);
  }
  if (result.errors.length > 0) {
    lines.push(`Errors: ${result.errors.length}`);
    for (const error of result.errors) lines.push(`  [${error.code}] ${error.message}`);
  }
  return lines.join('\n');
}
