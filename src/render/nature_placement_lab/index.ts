import type * as THREE from 'three';
import { loadGltf } from '../assets/loader';
import { NaturePlacementController } from './placement_controller';
import {
  type NaturePlacementLabEnvironment,
  type NaturePlacementPoint,
  naturePlacementLabEnabled,
} from './placement_core';
import { NaturePlacementRender } from './placement_render';
import { NaturePlacementUi } from './placement_ui';

export interface NaturePlacementLabOptions {
  camera: THREE.Camera;
  canvas: HTMLCanvasElement;
  projectTerrain: (clientX: number, clientY: number) => NaturePlacementPoint | null;
  scene: THREE.Scene;
}

export interface NaturePlacementLabFactoryDependencies {
  createController?: (options: NaturePlacementLabOptions) => NaturePlacementController;
}

function createDefaultController(options: NaturePlacementLabOptions): NaturePlacementController {
  const render = new NaturePlacementRender(options.scene, loadGltf, options.camera, options.canvas);
  return new NaturePlacementController({
    canvas: options.canvas,
    eventWindow: window,
    projectTerrain: options.projectTerrain,
    render,
    createUi: (callbacks) => {
      const mount = document.getElementById('ui') ?? document.body;
      return new NaturePlacementUi(document, callbacks, mount);
    },
  });
}

export function createNaturePlacementLab(
  options: NaturePlacementLabOptions,
  environment: NaturePlacementLabEnvironment = import.meta.env,
  dependencies: NaturePlacementLabFactoryDependencies = {},
): NaturePlacementController | null {
  if (!naturePlacementLabEnabled(environment)) return null;
  return (dependencies.createController ?? createDefaultController)(options);
}

export type { NaturePlacementController } from './placement_controller';
export type { NaturePlacement, NaturePlacementAssetId } from './placement_core';
