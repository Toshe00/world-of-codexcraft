import type { NatureZoneBounds } from '../nature_placement_lab/placement_zone_publication';

export const PUBLISHED_ZONE_LOAD_DISTANCE = 60;
export const PUBLISHED_ZONE_UNLOAD_DISTANCE = 90;
export const DEFAULT_PUBLISHED_ZONE_ID = 'start-zone-nature-lab';

export type PublishedZoneLabState =
  | 'inactive'
  | 'loading'
  | 'loaded'
  | 'unloaded'
  | 'invalid';

export interface PublishedZoneLabEnvironment {
  DEV: boolean;
  VITE_PUBLISHED_ZONE_LAB?: string;
  VITE_PUBLISHED_ZONE_ID?: string;
}

export interface PublishedZonePoint {
  x: number;
  z: number;
}

export type PublishedZoneProximityAction = 'load' | 'unload' | 'none';

export function publishedZoneLabEnabled(environment: PublishedZoneLabEnvironment): boolean {
  return environment.DEV && environment.VITE_PUBLISHED_ZONE_LAB === '1';
}

export function distanceToPublishedZoneBounds(
  point: PublishedZonePoint,
  bounds: Pick<NatureZoneBounds, 'minX' | 'maxX' | 'minZ' | 'maxZ'>,
): number {
  const dx = Math.max(bounds.minX - point.x, 0, point.x - bounds.maxX);
  const dz = Math.max(bounds.minZ - point.z, 0, point.z - bounds.maxZ);
  return Math.hypot(dx, dz);
}

export function decidePublishedZoneProximityAction(
  state: PublishedZoneLabState,
  distance: number,
  loadDistance = PUBLISHED_ZONE_LOAD_DISTANCE,
  unloadDistance = PUBLISHED_ZONE_UNLOAD_DISTANCE,
): PublishedZoneProximityAction {
  if (
    !Number.isFinite(distance) ||
    !Number.isFinite(loadDistance) ||
    !Number.isFinite(unloadDistance) ||
    loadDistance < 0 ||
    unloadDistance <= loadDistance ||
    state === 'inactive' ||
    state === 'invalid'
  ) {
    return 'none';
  }
  if (state === 'unloaded') return distance <= loadDistance ? 'load' : 'none';
  return distance > unloadDistance ? 'unload' : 'none';
}
