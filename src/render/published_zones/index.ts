import type * as THREE from 'three';
import { PublishedZoneLabIndicator } from '../../ui/published_zone_lab_indicator';
import { loadLaboratoryPublishedZoneCatalog } from './published_zone_catalog';
import { PublishedZoneController } from './published_zone_controller';
import {
  PublishedZoneInstances,
  type PublishedZoneInstanceOwner,
} from './published_zone_instances';
import {
  type LaboratoryPublishedZoneCatalog,
} from './published_zone_registry';
import { selectLaboratoryPublishedZone } from './published_zone_selection';
import {
  DEFAULT_PUBLISHED_ZONE_ID,
  type PublishedZoneLabState,
  type PublishedZonePoint,
} from './published_zone_runtime_core';

export interface PublishedZoneLabHandle {
  readonly state: PublishedZoneLabState;
  update(playerPosition: PublishedZonePoint): void;
  dispose(): void;
}

export interface PublishedZoneLabOptions {
  mount: HTMLElement;
  scene: THREE.Scene;
  zoneId?: string;
}

export interface PublishedZoneLabDependencies {
  catalog?: LaboratoryPublishedZoneCatalog;
  document?: Document;
  instances?: PublishedZoneInstanceOwner;
}

export function createPublishedZoneLab(
  options: PublishedZoneLabOptions,
  dependencies: PublishedZoneLabDependencies = {},
): PublishedZoneLabHandle {
  const zoneId = options.zoneId || DEFAULT_PUBLISHED_ZONE_ID;
  const documentRef = dependencies.document ?? document;
  const indicator = new PublishedZoneLabIndicator(documentRef, options.mount, zoneId);
  const instances = dependencies.instances ?? new PublishedZoneInstances(options.scene);
  const controller = new PublishedZoneController(instances, (state) => indicator.update(state));
  try {
    const catalog = dependencies.catalog ?? loadLaboratoryPublishedZoneCatalog();
    const selected = selectLaboratoryPublishedZone(catalog, zoneId);
    if (selected) controller.install(selected.zonePackage);
    else controller.invalidate();
  } catch (error) {
    console.warn('Published Zone Lab registry or package is invalid', error);
    controller.invalidate();
  }
  return {
    get state() {
      return controller.state;
    },
    update(playerPosition) {
      controller.update(playerPosition);
    },
    dispose() {
      controller.dispose();
      indicator.dispose();
    },
  };
}

export {
  DEFAULT_PUBLISHED_ZONE_ID,
  PUBLISHED_ZONE_LOAD_DISTANCE,
  PUBLISHED_ZONE_UNLOAD_DISTANCE,
} from './published_zone_runtime_core';
