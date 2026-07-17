import {
  validateNatureZonePackage,
  validNatureZoneId,
  type NatureZonePackage,
} from '../nature_placement_lab/placement_zone_publication';
import {
  PUBLISHED_ZONE_PLATFORMS,
  PUBLISHED_ZONE_REGISTRY_VERSION,
  type LaboratoryPublishedZoneCatalog,
  type LaboratoryPublishedZoneRegistryEntry,
  type PublishedZonePlatform,
} from './published_zone_registry_schema';

const PACKAGE_ROOT = 'config/laboratory-published-zones/';
const ENTRY_KEYS = [
  'zoneId',
  'packagePath',
  'status',
  'enabled',
  'productionEnabled',
  'platforms',
  'reason',
  'rollbackStrategy',
] as const;

export class PublishedZoneRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PublishedZoneRegistryError';
  }
}

function fail(message: string): never {
  throw new PublishedZoneRegistryError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function strictRecord(
  value: unknown,
  label: string,
  allowedKeys: readonly string[],
): Record<string, unknown> {
  if (!isRecord(value)) fail(`${label} must be an object`);
  const allowed = new Set(allowedKeys);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !allowed.has(key)) {
      fail(`${label} has unknown property: ${String(key)}`);
    }
  }
  for (const key of allowedKeys) {
    if (!Object.hasOwn(value, key)) fail(`${label} is missing property: ${key}`);
  }
  return value;
}

function nonEmptyText(value: unknown, label: string): string {
  if (
    typeof value !== 'string' ||
    value !== value.trim() ||
    value.length === 0 ||
    value.length > 500
  ) {
    fail(`${label} is invalid`);
  }
  return value;
}

export function validPublishedZonePackagePath(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.includes('\\') ||
    value.includes('%') ||
    value.includes('?') ||
    value.includes('#') ||
    value.includes('\0') ||
    value.startsWith('/') ||
    value.startsWith('//') ||
    /^[A-Za-z]:/.test(value) ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/.test(value) ||
    !value.startsWith(PACKAGE_ROOT) ||
    !value.endsWith('.zone.json')
  ) {
    return false;
  }
  const segments = value.split('/');
  return segments.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
}

function parsePlatforms(value: unknown, label: string): PublishedZonePlatform[] {
  if (!Array.isArray(value) || value.length === 0) fail(`${label} must not be empty`);
  const allowed = new Set<string>(PUBLISHED_ZONE_PLATFORMS);
  const platforms = value.map((entry) => {
    if (typeof entry !== 'string' || !allowed.has(entry)) fail(`${label} has unknown platform`);
    return entry as PublishedZonePlatform;
  });
  if (new Set(platforms).size !== platforms.length) fail(`${label} has duplicates`);
  return platforms;
}

function parseEntry(value: unknown, index: number): LaboratoryPublishedZoneRegistryEntry {
  const label = `registry entry ${index}`;
  const record = strictRecord(value, label, ENTRY_KEYS);
  if (!validNatureZoneId(record.zoneId)) fail(`${label} zoneId is invalid`);
  if (!validPublishedZonePackagePath(record.packagePath)) {
    fail(`${label} packagePath must be a local portable package path`);
  }
  if (record.status !== 'laboratory') fail(`${label} has unknown status`);
  if (typeof record.enabled !== 'boolean') fail(`${label} enabled must be boolean`);
  if (record.productionEnabled !== false) fail(`${label} cannot be active in production`);
  return {
    zoneId: record.zoneId,
    packagePath: record.packagePath,
    status: 'laboratory',
    enabled: record.enabled,
    productionEnabled: false,
    platforms: parsePlatforms(record.platforms, `${label} platforms`),
    reason: nonEmptyText(record.reason, `${label} reason`),
    rollbackStrategy: nonEmptyText(record.rollbackStrategy, `${label} rollbackStrategy`),
  };
}

export function validateLaboratoryPublishedZoneRegistry(
  value: unknown,
  packageDocuments: ReadonlyMap<string, unknown>,
): LaboratoryPublishedZoneCatalog {
  const record = strictRecord(value, 'published zone registry', [
    'version',
    'productionActivationAllowed',
    'entries',
  ]);
  if (record.version !== PUBLISHED_ZONE_REGISTRY_VERSION) {
    fail(`unsupported published zone registry version: ${String(record.version)}`);
  }
  if (record.productionActivationAllowed !== false) {
    fail('published zone registry cannot allow production activation');
  }
  if (!Array.isArray(record.entries)) fail('published zone registry entries must be an array');
  const entries = record.entries.map(parseEntry);
  const zoneIds = new Set<string>();
  const packagePaths = new Set<string>();
  const packages = new Map<string, NatureZonePackage>();
  for (const entry of entries) {
    if (zoneIds.has(entry.zoneId)) fail(`duplicate published zoneId: ${entry.zoneId}`);
    if (packagePaths.has(entry.packagePath)) fail(`duplicate published zone packagePath: ${entry.packagePath}`);
    zoneIds.add(entry.zoneId);
    packagePaths.add(entry.packagePath);
    if (!packageDocuments.has(entry.packagePath)) {
      fail(`published zone package is absent: ${entry.packagePath}`);
    }
    let zonePackage: NatureZonePackage;
    try {
      zonePackage = validateNatureZonePackage(packageDocuments.get(entry.packagePath));
    } catch (error) {
      fail(`published zone package is invalid: ${entry.packagePath}: ${String(error)}`);
    }
    if (zonePackage.zoneId !== entry.zoneId) {
      fail(`published zone package zoneId does not match registry: ${entry.zoneId}`);
    }
    packages.set(entry.packagePath, zonePackage);
  }
  return {
    registry: {
      version: PUBLISHED_ZONE_REGISTRY_VERSION,
      productionActivationAllowed: false,
      entries: entries.map((entry) => ({ ...entry, platforms: [...entry.platforms] })),
    },
    packages,
  };
}

export type { LaboratoryPublishedZoneCatalog } from './published_zone_registry_schema';
