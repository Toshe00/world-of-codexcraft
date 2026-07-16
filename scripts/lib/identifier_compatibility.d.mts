export type IdentifierCategory =
  | 'display-label'
  | 'brand-asset'
  | 'documentation-only'
  | 'persistent-content-id'
  | 'database-identifier'
  | 'database-value'
  | 'realm-identifier'
  | 'client-storage-key'
  | 'network-route'
  | 'network-header'
  | 'network-protocol'
  | 'desktop-app-identity'
  | 'mobile-app-identity'
  | 'oauth-or-callback'
  | 'environment-variable'
  | 'docker-or-infrastructure'
  | 'filesystem-path'
  | 'public-domain-or-url'
  | 'email-identity'
  | 'telemetry-or-metric'
  | 'economic-identifier'
  | 'web3-identifier'
  | 'generated-mirror'
  | 'third-party-trademark'
  | 'unknown-sensitive';

export type TransformationStrategy =
  | 'rename-display-only'
  | 'keep-stable'
  | 'alias-then-migrate'
  | 'dual-read-dual-write'
  | 'redirect-required'
  | 'database-migration-required'
  | 'application-transition-required'
  | 'infrastructure-migration-required'
  | 'economic-review-required'
  | 'legal-review-required'
  | 'generated-from-source'
  | 'replace-before-release'
  | 'investigate-before-change';

export type Stability = 'ephemeral' | 'versioned' | 'stable' | 'permanent' | 'unknown';
export type RenamePolicy = 'allowed' | 'forbidden' | 'migration-required' | 'unknown';
export type IdentifierTarget = 'content' | 'path';
export type DetectorTarget = IdentifierTarget | 'both';
export type DetectorKind = 'literal' | 'regex';
export type SourceValueMode = 'exact' | 'family';
export type EvidenceType = 'repository-file' | 'test' | 'runtime-contract' | 'manual-review';

export interface IdentifierEvidence {
  type: EvidenceType;
  reference: string;
  description: string;
}

export interface IdentifierDetector {
  id: string;
  target: DetectorTarget;
  kind: DetectorKind;
  expression: string;
  flags: string;
  description: string;
  paths?: string[];
  excludePaths?: string[];
  valueGroup?: number;
  sourceValueMode?: SourceValueMode;
}

export interface IdentifierRule {
  id: string;
  identifier: string;
  category: IdentifierCategory;
  coverage: {
    detectorIds: string[];
    targets: IdentifierTarget[];
    paths: string[];
    excludePaths?: string[];
    expectedOccurrenceCount: number;
    occurrenceInventorySha256: string;
  };
  owner: string;
  usage: string;
  stability: Stability;
  persistent: boolean;
  publiclyExposed: boolean;
  renamePolicy: RenamePolicy;
  strategy: TransformationStrategy;
  aliases: string[];
  risks: string[];
  justification: string;
  evidence: IdentifierEvidence[];
  tests: string[];
  notes: string[];
  uncertainties: string[];
  sourceRuleIds?: string[];
}

export interface IdentifierCompatibilityRegistry {
  $schema: string;
  registryVersion: 1;
  scope: {
    roots: string[];
    files: string[];
    pathRoots: string[];
    pathFiles: string[];
    textExtensions: string[];
    exclusions: Array<{
      id: string;
      paths: string[];
      justification: string;
      expectedPathCount: number;
      pathInventorySha256: string;
    }>;
  };
  detectors: IdentifierDetector[];
  rules: IdentifierRule[];
}

export interface IdentifierOccurrence {
  detectorId: string;
  target: IdentifierTarget;
  path: string;
  value: string;
  line: number | null;
  column: number | null;
}

export interface IdentifierCompatibilityIssue {
  code: string;
  message: string;
  path?: string;
  detectorId?: string;
  ruleId?: string;
  ruleIds?: string[];
}

export interface IdentifierCompatibilityResult {
  ok: boolean;
  errors: IdentifierCompatibilityIssue[];
  contentFileCount: number;
  pathFileCount: number;
  occurrenceCount: number;
  detectorCount: number;
  ruleCount: number;
  excludedPathCount: number;
  summaryByCategory: Record<string, number>;
  summaryByStrategy: Record<string, number>;
  ruleOccurrenceCounts: Record<string, number>;
  ruleOccurrenceHashes: Record<string, string>;
  exclusionPathCounts: Record<string, number>;
  exclusionPathHashes: Record<string, string>;
}

export declare const IDENTIFIER_CATEGORIES: readonly IdentifierCategory[];
export declare const TRANSFORMATION_STRATEGIES: readonly TransformationStrategy[];
export declare const STABILITY_VALUES: readonly Stability[];
export declare const RENAME_POLICIES: readonly RenamePolicy[];
export declare function globToRegExp(glob: string): RegExp;
export declare function verifyIdentifierCompatibility(options: {
  repoRoot: string;
  registry: IdentifierCompatibilityRegistry;
}): IdentifierCompatibilityResult;
export declare function formatIdentifierCompatibilityReport(
  result: IdentifierCompatibilityResult,
): string;
