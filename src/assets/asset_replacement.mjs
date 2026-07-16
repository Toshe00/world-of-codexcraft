export const ASSET_REPLACEMENT_TYPES = Object.freeze([
  'model-glb',
  'texture',
  'ui-image',
  'audio',
  'font',
  'environment',
  'other-static',
]);

export const ASSET_REPLACEMENT_STATUSES = Object.freeze([
  'inactive',
  'laboratory',
  'approved',
  'blocked',
  'retired',
]);

export const ASSET_REPLACEMENT_PLATFORMS = Object.freeze(['web', 'desktop', 'android', 'ios']);

const REGISTRY_KEYS = new Set(['$schema', 'registryVersion', 'policy', 'replacements']);
const POLICY_KEYS = new Set(['productionActivationAllowed', 'laboratoryActivationEnv']);
const RULE_KEYS = new Set([
  'id',
  'historicalPath',
  'replacementPath',
  'type',
  'status',
  'reason',
  'provenanceRuleId',
  'enabled',
  'platforms',
  'plannedFor',
  'notes',
  'rollbackStrategy',
]);
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);
const AUDIO_EXTENSIONS = new Set(['.mp3', '.ogg', '.wav', '.flac', '.m4a']);
const FONT_EXTENSIONS = new Set(['.woff', '.woff2', '.ttf', '.otf']);
const ENVIRONMENT_EXTENSIONS = new Set(['.hdr', '.exr', ...IMAGE_EXTENSIONS]);
const HARD_BLOCKED_PROVENANCE = new Set([
  'blocked-pending-proof',
  'purchased-license-non-transferable',
  'project-owned-proof-required',
  'unknown',
  'third-party-trademark',
]);

function issue(code, message, details = {}) {
  return { code, message, ...details };
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function objectRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateKeys(value, allowed, label, errors) {
  if (!objectRecord(value)) return;
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      errors.push(issue('unexpected-property', `${label} has unsupported property ${key}.`));
    }
  }
}

export function isPortableAssetPath(value) {
  if (!nonEmptyString(value) || value.includes('\\') || value.includes('\0')) return false;
  if (value.startsWith('/') || /^[A-Za-z]:/.test(value) || /^[a-z][a-z0-9+.-]*:/i.test(value)) {
    return false;
  }
  if (value.includes('?') || value.includes('#')) return false;
  const segments = value.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    return false;
  }
  const decoded = segments.map((segment) => {
    let current = segment;
    for (let depth = 0; depth < 4; depth += 1) {
      try {
        const next = decodeURIComponent(current);
        if (next === current) break;
        current = next;
      } catch {
        break;
      }
    }
    return current;
  });
  return !decoded.some(
    (segment, index) =>
      segment === '.' ||
      segment === '..' ||
      segment.includes('/') ||
      segment.includes('\\') ||
      segment.includes('\0') ||
      (index === 0 && (/^[A-Za-z]:/.test(segment) || /^[a-z][a-z0-9+.-]*:/i.test(segment))),
  );
}

function extensionOf(assetPath) {
  const name = assetPath.slice(assetPath.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot).toLowerCase();
}

export function inferAssetReplacementType(assetPath) {
  if (!isPortableAssetPath(assetPath)) return null;
  const extension = extensionOf(assetPath);
  if (assetPath.startsWith('models/') && extension === '.glb') return 'model-glb';
  if (
    (assetPath.startsWith('textures/') || assetPath.startsWith('vfx/')) &&
    IMAGE_EXTENSIONS.has(extension)
  ) {
    return 'texture';
  }
  if (assetPath.startsWith('ui/') && IMAGE_EXTENSIONS.has(extension)) {
    return 'ui-image';
  }
  if (assetPath.startsWith('audio/') && AUDIO_EXTENSIONS.has(extension)) return 'audio';
  if (assetPath.startsWith('fonts/') && FONT_EXTENSIONS.has(extension)) return 'font';
  if (assetPath.startsWith('env/') && ENVIRONMENT_EXTENSIONS.has(extension)) {
    return 'environment';
  }
  return 'other-static';
}

function validateAssetCatalogPath(assetPath, assetSet, lowerCasePaths, label, errors, ruleId) {
  if (!isPortableAssetPath(assetPath)) {
    errors.push(
      issue('unsafe-path', `${label} must be a portable asset path: ${String(assetPath)}.`, {
        ruleId,
        path: assetPath,
      }),
    );
    return;
  }
  if (!assetSet) return;
  if (assetSet.has(assetPath)) return;
  const actual = lowerCasePaths.get(assetPath.toLowerCase());
  errors.push(
    issue(
      actual ? 'path-case-mismatch' : 'missing-asset',
      actual
        ? `${label} casing differs: ${assetPath}; actual path is ${actual}.`
        : `${label} does not exist: ${assetPath}.`,
      { ruleId, path: assetPath, actualPath: actual },
    ),
  );
}

function validateRuleShape(rule, index, errors) {
  const label = nonEmptyString(rule?.id) ? rule.id : `replacements[${index}]`;
  if (!objectRecord(rule)) {
    errors.push(issue('invalid-rule', `${label} must be an object.`));
    return label;
  }
  validateKeys(rule, RULE_KEYS, label, errors);
  if (!nonEmptyString(rule.id) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(rule.id)) {
    errors.push(
      issue('invalid-rule-id', `${label} must have a stable kebab-case id.`, {
        ruleId: label,
      }),
    );
  }
  for (const key of [
    'historicalPath',
    'replacementPath',
    'reason',
    'provenanceRuleId',
    'plannedFor',
    'rollbackStrategy',
  ]) {
    if (!nonEmptyString(rule[key])) {
      errors.push(
        issue('missing-rule-field', `${label}.${key} must be a nonempty string.`, {
          ruleId: label,
        }),
      );
    }
  }
  if (!ASSET_REPLACEMENT_TYPES.includes(rule.type)) {
    errors.push(
      issue('invalid-resource-type', `${label} has unsupported type ${String(rule.type)}.`, {
        ruleId: label,
      }),
    );
  }
  if (!ASSET_REPLACEMENT_STATUSES.includes(rule.status)) {
    errors.push(
      issue('invalid-status', `${label} has unsupported status ${String(rule.status)}.`, {
        ruleId: label,
      }),
    );
  }
  if (typeof rule.enabled !== 'boolean') {
    errors.push(
      issue('invalid-activation', `${label}.enabled must be boolean.`, {
        ruleId: label,
      }),
    );
  }
  if (
    !Array.isArray(rule.platforms) ||
    rule.platforms.length === 0 ||
    rule.platforms.some((platform) => !ASSET_REPLACEMENT_PLATFORMS.includes(platform)) ||
    new Set(rule.platforms).size !== rule.platforms.length
  ) {
    errors.push(
      issue('invalid-platforms', `${label}.platforms must contain unique controlled platforms.`, {
        ruleId: label,
      }),
    );
  }
  if (!Array.isArray(rule.notes) || rule.notes.some((note) => !nonEmptyString(note))) {
    errors.push(
      issue('invalid-notes', `${label}.notes must contain only nonempty strings.`, {
        ruleId: label,
      }),
    );
  }
  if (rule.enabled && ['inactive', 'blocked', 'retired'].includes(rule.status)) {
    errors.push(
      issue('invalid-activation', `${label} cannot be enabled while ${rule.status}.`, {
        ruleId: label,
      }),
    );
  }
  return label;
}

function findCycle(rules) {
  const edges = new Map();
  for (const rule of rules)
    if (!edges.has(rule.historicalPath)) edges.set(rule.historicalPath, rule.replacementPath);
  const visited = new Set();
  const visiting = new Set();
  const stack = [];
  function visit(node) {
    if (visiting.has(node)) {
      const index = stack.indexOf(node);
      return [...stack.slice(index), node];
    }
    if (visited.has(node)) return null;
    visited.add(node);
    visiting.add(node);
    stack.push(node);
    const next = edges.get(node);
    const cycle = next ? visit(next) : null;
    stack.pop();
    visiting.delete(node);
    return cycle;
  }
  for (const node of edges.keys()) {
    const cycle = visit(node);
    if (cycle) return cycle;
  }
  return null;
}

export function validateAssetReplacementRegistry({ registry, assetPaths, provenanceByPath }) {
  const errors = [];
  if (!objectRecord(registry)) {
    return {
      ok: false,
      errors: [issue('invalid-registry', 'Asset replacement registry must be an object.')],
      ruleCount: 0,
      activeCount: 0,
      productionActiveCount: 0,
      laboratoryCount: 0,
    };
  }
  validateKeys(registry, REGISTRY_KEYS, 'registry', errors);
  if (registry.registryVersion !== 1) {
    errors.push(issue('invalid-registry-version', 'registryVersion must be 1.'));
  }
  if (!objectRecord(registry.policy)) {
    errors.push(issue('invalid-policy', 'registry.policy must be an object.'));
  } else {
    validateKeys(registry.policy, POLICY_KEYS, 'registry.policy', errors);
    if (typeof registry.policy.productionActivationAllowed !== 'boolean') {
      errors.push(issue('invalid-policy', 'productionActivationAllowed must be boolean.'));
    }
    if (registry.policy.laboratoryActivationEnv !== 'VITE_ASSET_REPLACEMENT_LAB') {
      errors.push(
        issue('invalid-policy', 'laboratoryActivationEnv must be VITE_ASSET_REPLACEMENT_LAB.'),
      );
    }
  }
  const rules = Array.isArray(registry.replacements) ? registry.replacements : [];
  if (!Array.isArray(registry.replacements)) {
    errors.push(issue('invalid-rules', 'registry.replacements must be an array.'));
  }

  const assetSet = Array.isArray(assetPaths) ? new Set(assetPaths) : null;
  const lowerCasePaths = new Map();
  if (assetSet) {
    for (const assetPath of assetSet) {
      const folded = assetPath.toLowerCase();
      if (!lowerCasePaths.has(folded)) lowerCasePaths.set(folded, assetPath);
    }
  }
  const ids = new Set();
  const sources = new Map();
  for (const [index, rule] of rules.entries()) {
    const label = validateRuleShape(rule, index, errors);
    if (!objectRecord(rule)) continue;
    if (ids.has(rule.id)) {
      errors.push(
        issue('duplicate-rule-id', `Duplicate replacement id: ${rule.id}.`, {
          ruleId: rule.id,
        }),
      );
    }
    ids.add(rule.id);
    const sourceRules = sources.get(rule.historicalPath) ?? [];
    sourceRules.push(rule.id);
    sources.set(rule.historicalPath, sourceRules);

    validateAssetCatalogPath(
      rule.historicalPath,
      assetSet,
      lowerCasePaths,
      `${label}.historicalPath`,
      errors,
      rule.id,
    );
    validateAssetCatalogPath(
      rule.replacementPath,
      assetSet,
      lowerCasePaths,
      `${label}.replacementPath`,
      errors,
      rule.id,
    );
    if (rule.historicalPath === rule.replacementPath) {
      errors.push(
        issue('self-replacement', `${label} replaces an asset with itself.`, {
          ruleId: rule.id,
        }),
      );
    }
    const sourceType = inferAssetReplacementType(rule.historicalPath);
    const targetType = inferAssetReplacementType(rule.replacementPath);
    if (sourceType !== rule.type || targetType !== rule.type) {
      errors.push(
        issue(
          'incompatible-resource-type',
          `${label} declares ${rule.type}, source is ${sourceType}, target is ${targetType}.`,
          { ruleId: rule.id },
        ),
      );
    }
    if (
      rule.enabled &&
      rule.status === 'approved' &&
      registry.policy?.productionActivationAllowed === false
    ) {
      errors.push(
        issue(
          'production-activation-forbidden',
          `${label} is production-enabled while registry policy forbids production activation.`,
          { ruleId: rule.id },
        ),
      );
    }
    if (provenanceByPath) {
      const provenance = provenanceByPath[rule.replacementPath];
      if (!provenance) {
        errors.push(
          issue('missing-provenance', `${label} target has no provenance coverage.`, {
            ruleId: rule.id,
          }),
        );
      } else if (provenance.ruleId !== rule.provenanceRuleId) {
        errors.push(
          issue(
            'provenance-rule-mismatch',
            `${label} names provenance rule ${rule.provenanceRuleId}, actual rule is ${provenance.ruleId}.`,
            { ruleId: rule.id },
          ),
        );
      } else if (HARD_BLOCKED_PROVENANCE.has(provenance.status) || !provenance.approved) {
        errors.push(
          issue(
            'blocked-provenance',
            `${label} target provenance status ${provenance.status} is not approved for replacement.`,
            { ruleId: rule.id },
          ),
        );
      }
    }
  }

  for (const [source, sourceRules] of sources) {
    if (sourceRules.length > 1) {
      errors.push(
        issue(
          'ambiguous-source',
          `Asset ${source} has multiple replacement rules: ${sourceRules.join(', ')}.`,
          { path: source, ruleIds: sourceRules },
        ),
      );
    }
  }
  const cycle = findCycle(rules.filter((rule) => objectRecord(rule)));
  if (cycle) {
    errors.push(
      issue('replacement-cycle', `Asset replacement cycle: ${cycle.join(' -> ')}.`, {
        paths: cycle,
      }),
    );
  }

  const activeCount = rules.filter((rule) => rule?.enabled === true).length;
  const productionActiveCount = rules.filter(
    (rule) => rule?.enabled === true && rule?.status === 'approved',
  ).length;
  const laboratoryCount = rules.filter((rule) => rule?.status === 'laboratory').length;
  return {
    ok: errors.length === 0,
    errors,
    ruleCount: rules.length,
    activeCount,
    productionActiveCount,
    laboratoryCount,
  };
}

export class AssetReplacementError extends Error {
  constructor(errors) {
    super(
      `Invalid asset replacement request: ${errors.map((error) => `[${error.code}] ${error.message}`).join('; ')}`,
    );
    this.name = 'AssetReplacementError';
    this.errors = errors;
  }
}

function activeRule(rule, mode) {
  if (!rule.enabled) return false;
  if (rule.status === 'approved') return true;
  return rule.status === 'laboratory' && mode === 'laboratory';
}

function inactiveReason(rule, mode) {
  if (rule.status === 'laboratory' && mode !== 'laboratory') return 'laboratory-disabled';
  if (!rule.enabled || rule.status === 'inactive') return 'rule-inactive';
  if (rule.status === 'blocked') return 'rule-blocked';
  if (rule.status === 'retired') return 'rule-retired';
  return 'rule-inactive';
}

export function resolveAssetReplacement(request) {
  if (!objectRecord(request) || !isPortableAssetPath(request.path)) {
    throw new AssetReplacementError([
      issue('unsafe-path', `Path must be a portable asset path: ${String(request?.path)}.`),
    ]);
  }
  const validation = validateAssetReplacementRegistry(request);
  if (!validation.ok) throw new AssetReplacementError(validation.errors);
  const mode = request.mode === 'laboratory' ? 'laboratory' : 'production';
  const bySource = new Map(
    request.registry.replacements.map((rule) => [rule.historicalPath, rule]),
  );
  const first = bySource.get(request.path);
  if (!first) {
    return {
      path: request.path,
      historicalPath: request.path,
      fallbackPath: request.path,
      replaced: false,
      reason: 'not-configured',
      replacementIds: [],
    };
  }
  if (!activeRule(first, mode)) {
    return {
      path: request.path,
      historicalPath: request.path,
      fallbackPath: request.path,
      replaced: false,
      reason: inactiveReason(first, mode),
      replacementIds: [first.id],
    };
  }
  let current = request.path;
  const replacementIds = [];
  while (true) {
    const rule = bySource.get(current);
    if (!rule || !activeRule(rule, mode)) break;
    replacementIds.push(rule.id);
    current = rule.replacementPath;
  }
  return {
    path: current,
    historicalPath: request.path,
    fallbackPath: request.path,
    replaced: current !== request.path,
    reason: current === request.path ? 'not-configured' : 'replacement-applied',
    replacementIds,
  };
}
