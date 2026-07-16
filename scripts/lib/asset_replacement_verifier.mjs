import { globToRegExp } from './asset_provenance.mjs';

const APPROVED_LICENSES = new Set(['CC0-1.0', 'CC-BY-3.0', 'CC-BY-4.0', 'MIT', 'OFL-1.1']);

function matches(pattern, candidate) {
  return globToRegExp(pattern).test(candidate);
}

function ruleCoversPath(rule, repositoryPath) {
  if (!rule?.coverage?.paths?.some((pattern) => matches(pattern, repositoryPath))) return false;
  return !(rule.coverage.excludePaths ?? []).some((pattern) => matches(pattern, repositoryPath));
}

function provenanceApprovedForReplacement(rule) {
  if (!rule || !APPROVED_LICENSES.has(rule.declaredLicense)) return false;
  if (rule.redistribution !== 'allowed' || rule.commercialUse !== 'allowed') return false;
  if (!Array.isArray(rule.evidence) || rule.evidence.length === 0) return false;
  if (rule.status === 'reusable') return rule.declaredLicense === 'CC0-1.0';
  if (rule.status === 'attribution-required') return true;
  return rule.status === 'replace-before-release';
}

export function replacementProvenanceDecisions({ targetPaths, provenanceRegistry }) {
  const decisions = {};
  const errors = [];
  const rules = Array.isArray(provenanceRegistry?.rules) ? provenanceRegistry.rules : [];
  for (const targetPath of targetPaths) {
    const repositoryPath = `public/${targetPath}`;
    const matchesForPath = rules.filter((rule) => ruleCoversPath(rule, repositoryPath));
    if (matchesForPath.length === 0) {
      errors.push({
        code: 'missing-provenance',
        message: `Replacement target has no provenance rule: ${repositoryPath}.`,
        path: targetPath,
      });
      continue;
    }
    if (matchesForPath.length > 1) {
      errors.push({
        code: 'ambiguous-provenance',
        message: `Replacement target has multiple provenance rules: ${repositoryPath} (${matchesForPath.map((rule) => rule.id).join(', ')}).`,
        path: targetPath,
        ruleIds: matchesForPath.map((rule) => rule.id),
      });
      continue;
    }
    const rule = matchesForPath[0];
    decisions[targetPath] = {
      ruleId: rule.id,
      status: rule.status,
      approved: provenanceApprovedForReplacement(rule),
    };
  }
  return { decisions, errors };
}
