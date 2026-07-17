import type { NatureZonePackage } from '../nature_placement_lab/placement_zone_publication';

export const PUBLISHED_ZONE_REGISTRY_VERSION = 1 as const;
export const PUBLISHED_ZONE_PLATFORMS = ['web', 'desktop', 'android', 'ios'] as const;

export type PublishedZonePlatform = (typeof PUBLISHED_ZONE_PLATFORMS)[number];

export interface LaboratoryPublishedZoneRegistryEntry {
  zoneId: string;
  packagePath: string;
  status: 'laboratory';
  enabled: boolean;
  productionEnabled: false;
  platforms: PublishedZonePlatform[];
  reason: string;
  rollbackStrategy: string;
}

export interface LaboratoryPublishedZoneRegistry {
  version: typeof PUBLISHED_ZONE_REGISTRY_VERSION;
  productionActivationAllowed: false;
  entries: LaboratoryPublishedZoneRegistryEntry[];
}

export interface LaboratoryPublishedZoneCatalog {
  registry: LaboratoryPublishedZoneRegistry;
  packages: ReadonlyMap<string, NatureZonePackage>;
}
