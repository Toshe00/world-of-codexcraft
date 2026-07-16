import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { loadGltf } from './assets/loader';
import {
  type LaboratoryNaturePaletteEnvironment,
  type LaboratoryNaturePlayerPose,
  laboratoryNaturePaletteEnabled,
  laboratoryNaturePlacements,
} from './laboratory_nature_palette_core';

export const LABORATORY_NATURE_PALETTE_LABEL = 'Nature laboratory palette';

interface LaboratoryNaturePaletteDependencies {
  createLabel: (name: string) => THREE.Object3D;
  load: (path: string) => Promise<Pick<GLTF, 'scene'>>;
  log: (message: string) => void;
  warn: (message: string, error: unknown) => void;
}

function createDevelopmentLabel(name: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 48;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('nature laboratory label canvas is unavailable');
  context.fillStyle = 'rgba(12, 18, 14, 0.66)';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = 'rgba(238, 246, 238, 0.92)';
  context.font = '22px sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(name, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    depthTest: false,
    map: texture,
    transparent: true,
  });
  const sprite = new THREE.Sprite(material);
  sprite.name = name;
  sprite.renderOrder = 10_000;
  sprite.scale.set(2.4, 0.45, 1);
  return sprite;
}

const defaultDependencies: LaboratoryNaturePaletteDependencies = {
  createLabel: createDevelopmentLabel,
  load: loadGltf,
  log: (message) => console.info(message),
  warn: (message, error) => console.warn(message, error),
};

export class LaboratoryNaturePalette {
  private instance: THREE.Group | null = null;
  private initialization: Promise<void> | null = null;
  private disposed = false;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly sampleGround: (x: number, z: number) => number,
    private readonly dependencies: LaboratoryNaturePaletteDependencies,
  ) {}

  initialize(player: LaboratoryNaturePlayerPose): Promise<void> {
    if (this.disposed || this.instance) return Promise.resolve();
    if (this.initialization) return this.initialization;

    const placements = laboratoryNaturePlacements(player, this.sampleGround);
    this.initialization = Promise.all(
      placements.map(async (placement) => ({
        gltf: await this.dependencies.load(placement.loadPath),
        placement,
      })),
    )
      .then((loaded) => {
        if (this.disposed) return;

        const palette = new THREE.Group();
        palette.name = LABORATORY_NATURE_PALETTE_LABEL;
        for (const { gltf, placement } of loaded) {
          const model = gltf.scene.clone(true);
          model.scale.setScalar(placement.scale);
          model.rotation.y = placement.rotationY;
          model.updateMatrixWorld(true);
          const bounds = new THREE.Box3().setFromObject(model);
          if (
            bounds.isEmpty() ||
            !Number.isFinite(bounds.min.y) ||
            !Number.isFinite(bounds.max.y)
          ) {
            throw new Error(`nature laboratory asset has invalid bounds: ${placement.label}`);
          }
          model.position.y -= bounds.min.y;
          model.traverse((object) => {
            if (!(object instanceof THREE.Mesh)) return;
            object.castShadow = placement.shadows;
            object.receiveShadow = placement.shadows;
          });

          const asset = new THREE.Group();
          asset.name = placement.label;
          asset.position.set(placement.x, placement.y, placement.z);
          asset.add(model);
          const label = this.dependencies.createLabel(placement.label);
          label.position.y = bounds.max.y - bounds.min.y + 0.4;
          asset.add(label);
          palette.add(asset);
        }
        this.scene.add(palette);
        this.instance = palette;
        this.dependencies.log(LABORATORY_NATURE_PALETTE_LABEL);
      })
      .catch((error: unknown) => {
        this.dependencies.warn('Nature laboratory palette failed to load', error);
      });
    return this.initialization;
  }

  dispose(): void {
    this.disposed = true;
    if (!this.instance) return;
    this.instance.traverse((object) => {
      if (!(object instanceof THREE.Sprite)) return;
      const material = object.material;
      material.map?.dispose();
      material.dispose();
    });
    this.scene.remove(this.instance);
    this.instance = null;
  }
}

export function createLaboratoryNaturePalette(
  scene: THREE.Scene,
  sampleGround: (x: number, z: number) => number,
  environment: LaboratoryNaturePaletteEnvironment = import.meta.env,
  dependencies: Partial<LaboratoryNaturePaletteDependencies> = {},
): LaboratoryNaturePalette | null {
  if (!laboratoryNaturePaletteEnabled(environment)) return null;
  return new LaboratoryNaturePalette(scene, sampleGround, {
    ...defaultDependencies,
    ...dependencies,
  });
}
