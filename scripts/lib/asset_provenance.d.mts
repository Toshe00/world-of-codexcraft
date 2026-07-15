export type ProvenanceStatus =
  | 'reusable'
  | 'attribution-required'
  | 'replace-before-release'
  | 'blocked-pending-proof'
  | 'project-owned-proof-required'
  | 'purchased-license-non-transferable'
  | 'unknown'
  | 'third-party-trademark';

export type DeclaredLicense =
  | 'CC0-1.0'
  | 'CC-BY-3.0'
  | 'CC-BY-4.0'
  | 'MIT'
  | 'OFL-1.1'
  | 'LicenseRef-CraftPix-Premium'
  | 'NOASSERTION';

export type AssetCategory =
  | 'art'
  | 'audio'
  | 'document'
  | 'font'
  | 'model'
  | 'texture'
  | 'trademark'
  | 'video';
export type AttributionRequirement =
  | 'not-required'
  | 'required'
  | 'notice-required'
  | 'trademark-guidelines'
  | 'unknown';
export type RightsDecision = 'allowed' | 'prohibited' | 'licensee-only' | 'unknown';
export type TransformationStatus =
  | 'unmodified'
  | 'converted'
  | 'optimized'
  | 'generated'
  | 'commissioned'
  | 'procedural'
  | 'composite'
  | 'unknown';
export type EvidenceType =
  | 'repository-file'
  | 'source-url'
  | 'embedded-metadata'
  | 'source-comment'
  | 'manual-review';

export interface ProvenanceEvidence {
  type: EvidenceType;
  reference: string;
  description: string;
}

export interface ProvenanceRule {
  id: string;
  category: AssetCategory;
  coverage: {
    paths: string[];
    excludePaths?: string[];
    embeddedAssetIds: string[];
    expectedPathCount: number;
    pathInventorySha256: string;
  };
  sourceOrAuthor: string;
  provenanceUrl: string | null;
  declaredLicense: DeclaredLicense;
  evidence: ProvenanceEvidence[];
  knownRightsHolder: string | null;
  attribution: AttributionRequirement;
  redistribution: RightsDecision;
  commercialUse: RightsDecision;
  transformationStatus: TransformationStatus[];
  status: ProvenanceStatus;
  justification: string;
  notes: string[];
}

export interface AssetProvenanceRegistry {
  $schema: string;
  registryVersion: 1;
  scope: {
    roots: Array<{ path: string; include: string[] }>;
    files: string[];
    nonAssetExclusions: Array<{
      id: string;
      paths: string[];
      justification: string;
      expectedPathCount: number;
      pathInventorySha256: string;
    }>;
    embeddedAssets: Array<{
      id: string;
      container: string;
      description: string;
      containerSha256: string;
    }>;
  };
  rules: ProvenanceRule[];
}

export interface ProvenanceIssue {
  code: string;
  message: string;
  asset?: string;
  ruleId?: string;
  ruleIds?: string[];
}

export interface AssetProvenanceResult {
  ok: boolean;
  errors: ProvenanceIssue[];
  scopedAssetCount: number;
  physicalAssetCount: number;
  embeddedAssetCount: number;
  excludedNonAssetCount: number;
  ruleCount: number;
  summaryByStatus: Record<string, number>;
  summaryByCategory: Record<string, number>;
  ruleAssetCounts?: Record<string, number>;
  ruleAssetHashes?: Record<string, string>;
  exclusionFileCounts?: Record<string, number>;
  exclusionFileHashes?: Record<string, string>;
  embeddedContentHashes?: Record<string, string>;
}

export declare const PROVENANCE_STATUSES: readonly ProvenanceStatus[];
export declare const DECLARED_LICENSES: readonly DeclaredLicense[];
export declare function globToRegExp(glob: string): RegExp;
export declare function verifyAssetProvenance(options: {
  repoRoot: string;
  registry: AssetProvenanceRegistry;
}): AssetProvenanceResult;
export declare function formatAssetProvenanceReport(result: AssetProvenanceResult): string;
