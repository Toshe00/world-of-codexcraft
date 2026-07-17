import {
  setActiveStartZoneTerrainPlateauPatches,
  type StartZoneTerrainPlateauPatch,
} from '../../sim/start_zone_terrain_plateau';
import { buildStarterZoneSurveySource, type StarterZoneEntitySnapshot } from '../start_zone_terrain_survey/starter_zone_sources';
import type { TerrainSurveyPoint3 } from '../start_zone_terrain_survey/terrain_survey_core';
import { StartZoneTerrainPlateauController, type PlateauStorage } from './controller';
import { StartZoneTerrainPlateauRender } from './render';
import { StartZoneTerrainPlateauUi } from './ui';
import type * as THREE from 'three';

export interface StartZoneTerrainPlateauEnvironment {
  DEV: boolean;
  VITE_START_ZONE_TERRAIN_EDIT_LAB?: string;
}

export interface StartZoneTerrainPlateauOptions {
  canvas: HTMLCanvasElement;
  entities: readonly StarterZoneEntitySnapshot[];
  onTerrainChanged: () => void;
  projectTerrain: (clientX: number, clientY: number) => TerrainSurveyPoint3 | null;
  sampleHeight: (x: number, z: number) => number;
  sampleOriginalHeight: (x: number, z: number) => number;
  scene: THREE.Scene;
}

function localStorageOrNull(): PlateauStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function starterZoneTerrainPlateauEnabled(environment: StartZoneTerrainPlateauEnvironment): boolean {
  return environment.DEV === true && environment.VITE_START_ZONE_TERRAIN_EDIT_LAB === '1';
}

export function createStartZoneTerrainPlateau(
  options: StartZoneTerrainPlateauOptions,
  environment: StartZoneTerrainPlateauEnvironment = import.meta.env,
): StartZoneTerrainPlateauController | null {
  if (!starterZoneTerrainPlateauEnabled(environment)) return null;
  const source = buildStarterZoneSurveySource(options.entities);
  let controller: StartZoneTerrainPlateauController;
  const render = new StartZoneTerrainPlateauRender(options.scene, options.sampleHeight, options.sampleOriginalHeight);
  controller = new StartZoneTerrainPlateauController({
    bounds: source.zone.bounds,
    createUi: (callbacks) => {
      const mount = document.getElementById('ui') ?? document.body;
      return new StartZoneTerrainPlateauUi(document, callbacks, mount, () => controller.exportPatch());
    },
    onPatchesChanged: (patches: readonly StartZoneTerrainPlateauPatch[]) => {
      setActiveStartZoneTerrainPlateauPatches(patches);
      options.onTerrainChanged();
    },
    pointerTarget: options.canvas,
    projectTerrain: options.projectTerrain,
    protectedZones: source.protectedZones,
    render,
    sampleOriginalHeight: options.sampleOriginalHeight,
    storage: localStorageOrNull(),
  });
  return controller;
}

export { StartZoneTerrainPlateauController } from './controller';
export type { PlateauRenderAdapter, PlateauUiAdapter, PlateauUiCallbacks } from './controller';
export {
  DEFAULT_START_ZONE_TERRAIN_PLATEAU,
  START_ZONE_TERRAIN_PLATEAU_STORAGE_KEY,
} from './controller';
