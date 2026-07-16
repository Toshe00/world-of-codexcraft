import replacementRegistryJson from '../../config/asset-replacements.registry.json?raw';
import {
  type AssetReplacementRegistry,
  type AssetReplacementResolution,
  resolveAssetReplacement,
} from './asset_replacement.mjs';

const registry = JSON.parse(replacementRegistryJson) as AssetReplacementRegistry;

export const ASSET_REPLACEMENT_LAB_ENABLED =
  import.meta.env.DEV && import.meta.env.VITE_ASSET_REPLACEMENT_LAB === '1';

export function resolveRuntimeAssetPathDetailed(path: string): AssetReplacementResolution {
  return resolveAssetReplacement({
    path,
    registry,
    mode: ASSET_REPLACEMENT_LAB_ENABLED ? 'laboratory' : 'production',
  });
}

export function resolveRuntimeAssetPath(path: string): string {
  return resolveRuntimeAssetPathDetailed(path).path;
}

export function resolveRuntimeAssetUrl(url: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('//')) return url;
  const match = /^(\/)?([^?#]+)([?#].*)?$/.exec(url);
  if (!match) return url;
  const [, leadingSlash = '', logicalPath, suffix = ''] = match;
  const result = resolveRuntimeAssetPathDetailed(logicalPath);
  return `${leadingSlash}${result.path}${suffix}`;
}

export function assetReplacementRegistryForDiagnostics(): AssetReplacementRegistry {
  return registry;
}
