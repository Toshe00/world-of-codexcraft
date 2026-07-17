import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { loadGltf } from '../assets/loader';
import { naturePlacementAsset, type NaturePlacementAssetId } from '../nature_placement_lab/placement_core';
import type { NatureZonePackage } from '../nature_placement_lab/placement_zone_publication';

export const PUBLISHED_ZONE_ROOT_PREFIX = 'Published Zone: ';

type LoadGltf = (path: string) => Promise<Pick<GLTF, 'scene'>>;

interface Template {
  minY: number;
  scene: THREE.Object3D;
}

export interface PublishedZoneInstanceOwner {
  load(zonePackage: NatureZonePackage): Promise<boolean>;
  unload(): void;
  dispose(): void;
}

export class PublishedZoneInstances implements PublishedZoneInstanceOwner {
  private generation = 0;
  private root: THREE.Group | null = null;
  private disposed = false;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly loadAsset: LoadGltf = loadGltf,
  ) {}

  async load(zonePackage: NatureZonePackage): Promise<boolean> {
    if (this.disposed) return false;
    if (this.root?.userData.publishedZoneId === zonePackage.zoneId) return true;
    const generation = ++this.generation;
    this.removeRoot();
    const templates = new Map<NaturePlacementAssetId, Template>();
    await Promise.all(
      zonePackage.assetSummary.map(async (summary) => {
        const gltf = await this.loadAsset(summary.assetPath);
        const bounds = new THREE.Box3().setFromObject(gltf.scene);
        if (bounds.isEmpty() || !Number.isFinite(bounds.min.y)) {
          throw new Error(`published zone asset has invalid bounds: ${summary.assetId}`);
        }
        templates.set(summary.assetId, { minY: bounds.min.y, scene: gltf.scene });
      }),
    );
    if (this.disposed || generation !== this.generation) return false;

    const root = new THREE.Group();
    root.name = `${PUBLISHED_ZONE_ROOT_PREFIX}${zonePackage.zoneId}`;
    root.userData.publishedZoneId = zonePackage.zoneId;
    for (const placement of zonePackage.placements) {
      const template = templates.get(placement.assetId);
      if (!template) throw new Error(`published zone template is missing: ${placement.assetId}`);
      const asset = naturePlacementAsset(placement.assetId);
      const worldScale = asset.baseScale * placement.scale;
      const model = template.scene.clone(true);
      model.scale.setScalar(worldScale);
      model.position.y = -template.minY * worldScale;
      model.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.castShadow = asset.shadows;
        object.receiveShadow = asset.shadows;
      });

      const instance = new THREE.Group();
      instance.name = placement.id;
      instance.position.set(
        placement.position.x,
        placement.position.y + placement.groundOffsetY,
        placement.position.z,
      );
      instance.rotation.y = placement.rotationY;
      instance.userData.publishedZonePlacement = {
        position: { ...placement.position },
        rotationY: placement.rotationY,
        scale: placement.scale,
        groundOffsetY: placement.groundOffsetY,
      };
      instance.add(model);
      root.add(instance);
    }
    root.updateMatrixWorld(true);
    if (this.disposed || generation !== this.generation) return false;
    this.scene.add(root);
    this.root = root;
    return true;
  }

  unload(): void {
    this.generation++;
    this.removeRoot();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unload();
  }

  private removeRoot(): void {
    if (!this.root) return;
    this.scene.remove(this.root);
    this.root.clear();
    this.root = null;
  }
}
