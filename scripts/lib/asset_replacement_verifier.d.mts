import type { AssetProvenanceRegistry, ProvenanceStatus } from './asset_provenance.mjs';

export interface ReplacementProvenanceIssue {
  code: 'missing-provenance' | 'ambiguous-provenance';
  message: string;
  path: string;
  ruleIds?: string[];
}

export declare function replacementProvenanceDecisions(options: {
  targetPaths: string[];
  provenanceRegistry: AssetProvenanceRegistry;
}): {
  decisions: Record<string, { ruleId: string; status: ProvenanceStatus; approved: boolean }>;
  errors: ReplacementProvenanceIssue[];
};
