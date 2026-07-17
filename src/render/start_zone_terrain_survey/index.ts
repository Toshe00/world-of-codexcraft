import type * as THREE from 'three';
import { TerrainSurveyController, type TerrainSurveyControllerOptions } from './terrain_survey_controller';
import {
  starterZoneTerrainSurveyEnabled,
  type HeightSampler,
  type TerrainSurveyEnvironment,
  type TerrainSurveyPoint3,
} from './terrain_survey_core';
import { TerrainSurveyRender } from './terrain_survey_render';
import {
  buildStarterZoneSurveySource,
  type StarterZoneEntitySnapshot,
  type StarterZoneSurveySource,
} from './starter_zone_sources';
import { TerrainSurveyUi } from './terrain_survey_ui';

export interface StartZoneTerrainSurveyOptions {
  canvas: HTMLCanvasElement;
  entities: readonly StarterZoneEntitySnapshot[];
  projectTerrain: (clientX: number, clientY: number) => TerrainSurveyPoint3 | null;
  sampleHeight: HeightSampler;
  scene: THREE.Scene;
}

export interface StartZoneTerrainSurveyDependencies {
  createController?: (
    options: StartZoneTerrainSurveyOptions,
    source: StarterZoneSurveySource,
  ) => TerrainSurveyController;
}

function localStorageOrNull(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function createDefaultController(options: StartZoneTerrainSurveyOptions): TerrainSurveyController {
  const source = buildStarterZoneSurveySource(options.entities);
  const controllerOptions: TerrainSurveyControllerOptions = {
    createUi: (callbacks) => {
      const mount = document.getElementById('ui') ?? document.body;
      return new TerrainSurveyUi(document, callbacks, mount);
    },
    pointerTarget: options.canvas,
    projectTerrain: options.projectTerrain,
    protectedZones: source.protectedZones,
    render: new TerrainSurveyRender(options.scene, options.sampleHeight),
    sampleHeight: options.sampleHeight,
    storage: localStorageOrNull(),
    zone: source.zone,
  };
  return new TerrainSurveyController(controllerOptions);
}

export function createStartZoneTerrainSurvey(
  options: StartZoneTerrainSurveyOptions,
  environment: TerrainSurveyEnvironment = import.meta.env,
  dependencies: StartZoneTerrainSurveyDependencies = {},
): TerrainSurveyController | null {
  if (!starterZoneTerrainSurveyEnabled(environment)) return null;
  if (dependencies.createController) {
    const source = buildStarterZoneSurveySource(options.entities);
    return dependencies.createController(options, source);
  }
  return createDefaultController(options);
}

export { TerrainSurveyController } from './terrain_survey_controller';
export {
  DEFAULT_TERRAIN_SURVEY_RESOLUTION,
  FOOTPRINT_TEMPLATES,
  START_ZONE_TERRAIN_SURVEY_STORAGE_KEY,
  TERRAIN_ANCHOR_TYPES,
  TERRAIN_SURVEY_CRITERIA,
  TERRAIN_SURVEY_RESOLUTIONS,
  starterZoneTerrainSurveyEnabled,
} from './terrain_survey_core';
