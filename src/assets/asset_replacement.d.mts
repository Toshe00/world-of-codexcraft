export type AssetReplacementType =
  | 'model-glb'
  | 'texture'
  | 'ui-image'
  | 'audio'
  | 'font'
  | 'environment'
  | 'other-static';

export type AssetReplacementStatus = 'inactive' | 'laboratory' | 'approved' | 'blocked' | 'retired';

export type AssetReplacementPlatform = 'web' | 'desktop' | 'android' | 'ios';
export type AssetReplacementMode = 'production' | 'laboratory';

export interface AssetReplacementRule {
  id: string;
  historicalPath: string;
  replacementPath: string;
  type: AssetReplacementType;
  status: AssetReplacementStatus;
  reason: string;
  provenanceRuleId: string;
  enabled: boolean;
  platforms: AssetReplacementPlatform[];
  plannedFor: string;
  notes: string[];
  rollbackStrategy: string;
}

export interface AssetReplacementRegistry {
  $schema?: string;
  registryVersion: 1;
  policy: {
    productionActivationAllowed: boolean;
    laboratoryActivationEnv: 'VITE_ASSET_REPLACEMENT_LAB';
  };
  replacements: AssetReplacementRule[];
}

export interface ProvenanceDecision {
  ruleId: string;
  status: string;
  approved: boolean;
}

export interface AssetReplacementIssue {
  code: string;
  message: string;
  ruleId?: string;
  ruleIds?: string[];
  path?: string;
  actualPath?: string;
  paths?: string[];
}

export interface AssetReplacementValidation {
  ok: boolean;
  errors: AssetReplacementIssue[];
  ruleCount: number;
  activeCount: number;
  productionActiveCount: number;
  laboratoryCount: number;
}

export interface AssetReplacementRequest {
  path: string;
  registry: AssetReplacementRegistry;
  mode?: AssetReplacementMode;
  assetPaths?: string[];
  provenanceByPath?: Record<string, ProvenanceDecision>;
}

export interface AssetReplacementResolution {
  path: string;
  historicalPath: string;
  fallbackPath: string;
  replaced: boolean;
  reason:
    | 'not-configured'
    | 'rule-inactive'
    | 'laboratory-disabled'
    | 'rule-blocked'
    | 'rule-retired'
    | 'replacement-applied';
  replacementIds: string[];
}

export declare const ASSET_REPLACEMENT_TYPES: readonly AssetReplacementType[];
export declare const ASSET_REPLACEMENT_STATUSES: readonly AssetReplacementStatus[];
export declare const ASSET_REPLACEMENT_PLATFORMS: readonly AssetReplacementPlatform[];
export declare function isPortableAssetPath(value: unknown): value is string;
export declare function inferAssetReplacementType(assetPath: string): AssetReplacementType | null;
export declare function validateAssetReplacementRegistry(
  request: Omit<AssetReplacementRequest, 'path' | 'mode'>,
): AssetReplacementValidation;
export declare class AssetReplacementError extends Error {
  readonly errors: AssetReplacementIssue[];
  constructor(errors: AssetReplacementIssue[]);
}
export declare function resolveAssetReplacement(
  request: AssetReplacementRequest,
): AssetReplacementResolution;
