import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { loadGltf } from './assets/loader';
import {
  type LaboratoryBirchPlayerPose,
  laboratoryBirchPlacement,
  laboratoryBirchPreviewEnabled,
} from './laboratory_birch_preview_core';

export const LABORATORY_BIRCH_HISTORICAL_PATH = 'models/foliage/pine_3.glb';
export const LABORATORY_BIRCH_PREVIEW_LABEL = 'Birch laboratory preview';

interface LaboratoryBirchPreviewDependencies {
  load: (path: string) => Promise<Pick<GLTF, 'scene'>>;
  log: (message: string) => void;
  warn: (message: string, error: unknown) => void;
}

const defaultDependencies: LaboratoryBirchPreviewDependencies = {
  load: loadGltf,
  log: (message) => console.info(message),
  warn: (message, error) => console.warn(message, error),
};

export class LaboratoryBirchPreview {
  private instance: THREE.Group | null = null;
  private initialization: Promise<void> | null = null;
  private disposed = false;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly sampleGround: (x: number, z: number) => number,
    private readonly dependencies: LaboratoryBirchPreviewDependencies,
  ) {}

  initialize(player: LaboratoryBirchPlayerPose): Promise<void> {
    if (this.disposed || this.instance) return Promise.resolve();
    if (this.initialization) return this.initialization;

    const placement = laboratoryBirchPlacement(player, this.sampleGround);
    this.initialization = this.dependencies
      .load(LABORATORY_BIRCH_HISTORICAL_PATH)
      .then((gltf) => {
        if (this.disposed) return;

        const model = gltf.scene.clone(true);
        model.scale.setScalar(placement.scale);
        model.rotation.y = placement.rotationY;
        model.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(model);
        if (bounds.isEmpty() || !Number.isFinite(bounds.min.y)) {
          throw new Error('laboratory birch preview has invalid bounds');
        }
        model.position.y -= bounds.min.y;
        model.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          object.castShadow = placement.shadows;
          object.receiveShadow = placement.shadows;
        });

        const instance = new THREE.Group();
        instance.name = LABORATORY_BIRCH_PREVIEW_LABEL;
        instance.position.set(placement.x, placement.y, placement.z);
        instance.add(model);
        this.scene.add(instance);
        this.instance = instance;
        this.dependencies.log(LABORATORY_BIRCH_PREVIEW_LABEL);
      })
      .catch((error: unknown) => {
        this.dependencies.warn('Birch laboratory preview failed to load', error);
      });
    return this.initialization;
  }

  dispose(): void {
    this.disposed = true;
    if (!this.instance) return;
    this.scene.remove(this.instance);
    this.instance = null;
  }
}

export function createLaboratoryBirchPreview(
  scene: THREE.Scene,
  sampleGround: (x: number, z: number) => number,
  environment: {
    DEV: boolean;
    VITE_ASSET_REPLACEMENT_LAB?: string;
  } = import.meta.env,
  dependencies: Partial<LaboratoryBirchPreviewDependencies> = {},
): LaboratoryBirchPreview | null {
  if (!laboratoryBirchPreviewEnabled(environment)) return null;
  return new LaboratoryBirchPreview(scene, sampleGround, {
    ...defaultDependencies,
    ...dependencies,
  });
}
