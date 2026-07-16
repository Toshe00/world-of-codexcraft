import { describe, expect, it } from 'vitest';
import { replacementProvenanceDecisions } from '../scripts/lib/asset_replacement_verifier.mjs';

function provenanceRule(overrides: Record<string, unknown> = {}) {
  return {
    id: 'fixture-provenance',
    coverage: { paths: ['public/ui/fixture.webp'], excludePaths: [] },
    status: 'reusable',
    declaredLicense: 'CC0-1.0',
    redistribution: 'allowed',
    commercialUse: 'allowed',
    evidence: [{ kind: 'fixture', locator: 'tests-only' }],
    ...overrides,
  };
}

describe('asset replacement provenance decisions', () => {
  it('accepts a fixture target with approved CC0 provenance', () => {
    const result = replacementProvenanceDecisions({
      targetPaths: ['ui/fixture.webp'],
      provenanceRegistry: { rules: [provenanceRule()] } as never,
    });

    expect(result).toMatchObject({
      errors: [],
      decisions: {
        'ui/fixture.webp': {
          ruleId: 'fixture-provenance',
          status: 'reusable',
          approved: true,
        },
      },
    });
  });

  it.each([
    ['blocked-pending-proof', 'CC0-1.0', 'allowed', 'allowed'],
    ['purchased-license-non-transferable', 'LicenseRef-Purchased', 'forbidden', 'allowed'],
    ['unknown', 'UNKNOWN', 'unknown', 'unknown'],
  ])('rejects blocked provenance status %s', (status, license, redistribution, commercialUse) => {
    const result = replacementProvenanceDecisions({
      targetPaths: ['ui/fixture.webp'],
      provenanceRegistry: {
        rules: [
          provenanceRule({
            status,
            declaredLicense: license,
            redistribution,
            commercialUse,
          }),
        ],
      } as never,
    });

    expect(result.decisions['ui/fixture.webp']?.approved).toBe(false);
  });

  it('rejects replace-before-release without approved rights evidence', () => {
    const result = replacementProvenanceDecisions({
      targetPaths: ['ui/fixture.webp'],
      provenanceRegistry: {
        rules: [
          provenanceRule({
            status: 'replace-before-release',
            declaredLicense: 'UNKNOWN',
            evidence: [],
          }),
        ],
      } as never,
    });

    expect(result.decisions['ui/fixture.webp']?.approved).toBe(false);
  });

  it('reports missing and ambiguous provenance coverage', () => {
    const missing = replacementProvenanceDecisions({
      targetPaths: ['ui/fixture.webp'],
      provenanceRegistry: { rules: [] } as never,
    });
    const ambiguous = replacementProvenanceDecisions({
      targetPaths: ['ui/fixture.webp'],
      provenanceRegistry: {
        rules: [provenanceRule(), provenanceRule({ id: 'fixture-provenance-two' })],
      } as never,
    });

    expect(missing.errors.map((issue) => issue.code)).toEqual(['missing-provenance']);
    expect(ambiguous.errors.map((issue) => issue.code)).toEqual(['ambiguous-provenance']);
  });
});
