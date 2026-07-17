import { validateNatureZonePackage } from '../nature_placement_lab/placement_zone_publication';
import type {
  LaboratoryPublishedZoneCatalog,
  LaboratoryPublishedZoneRegistryEntry,
} from './published_zone_registry_schema';

export function selectLaboratoryPublishedZone(
  catalog: LaboratoryPublishedZoneCatalog,
  zoneId: string,
) {
  const entry = catalog.registry.entries.find(
    (candidate) => candidate.enabled && candidate.zoneId === zoneId,
  );
  if (!entry) return null;
  const zonePackage = catalog.packages.get(entry.packagePath);
  if (!zonePackage) return null;
  return {
    entry: { ...entry, platforms: [...entry.platforms] } as LaboratoryPublishedZoneRegistryEntry,
    zonePackage: validateNatureZonePackage(zonePackage),
  };
}
