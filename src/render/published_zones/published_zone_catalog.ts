import registrySource from '../../../config/laboratory-published-zones.registry.json?raw';
import startZoneNatureLabSource from '../../../config/laboratory-published-zones/start-zone-nature-lab.zone.json?raw';
import {
  validateLaboratoryPublishedZoneRegistry,
  type LaboratoryPublishedZoneCatalog,
} from './published_zone_registry';

export const START_ZONE_NATURE_LAB_PACKAGE_PATH =
  'config/laboratory-published-zones/start-zone-nature-lab.zone.json';

function parseJson(source: string, label: string): unknown {
  try {
    return JSON.parse(source);
  } catch {
    throw new Error(`${label} contains invalid JSON`);
  }
}

export function loadLaboratoryPublishedZoneCatalog(): LaboratoryPublishedZoneCatalog {
  const packageDocuments = new Map<string, unknown>([
    [
      START_ZONE_NATURE_LAB_PACKAGE_PATH,
      parseJson(startZoneNatureLabSource, 'start-zone-nature-lab package'),
    ],
  ]);
  return validateLaboratoryPublishedZoneRegistry(
    parseJson(registrySource, 'laboratory published zone registry'),
    packageDocuments,
  );
}
