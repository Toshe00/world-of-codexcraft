import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { loadGltf } from '../assets/loader';
import {
  type NaturePlacement,
  type NaturePlacementAssetId,
  type NaturePlacementPoint,
  type NaturePlacementTransform,
  naturePlacementAsset,
} from './placement_core';
import { NaturePlacementGrid } from './placement_grid';
import type { NaturePlacementGridSize } from './placement_snapping';

const ROOT_NAME = 'Nature Placement Lab';
const SELECTION_COLOR = 0xd4af37;
const GHOST_OPACITY = 0.42;

type LoadGltf = (path: string) => Promise<Pick<GLTF, 'scene'>>;

interface Template {
  minY: number;
  scene: THREE.Object3D;
}

interface RenderEntry {
  group: THREE.Group;
  model: THREE.Object3D | null;
  placement: NaturePlacement;
  removed: boolean;
  template: Template | null;
}

function disposeMaterial(material: THREE.Material | THREE.Material[]): void {
  if (Array.isArray(material)) {
    for (const entry of material) entry.dispose();
  } else {
    material.dispose();
  }
}

export class NaturePlacementRender {
  readonly group = new THREE.Group();
  private readonly entries = new Map<string, RenderEntry>();
  private readonly templates = new Map<NaturePlacementAssetId, Promise<Template>>();
  private readonly pending = new Set<Promise<unknown>>();
  private readonly raycaster = new THREE.Raycaster();
  private ghost: THREE.Group | null = null;
  private ghostAssetId: NaturePlacementAssetId | null = null;
  private ghostGeneration = 0;
  private selectionHelper: THREE.BoxHelper | null = null;
  private selectedId: string | null = null;
  private disposed = false;
  private readonly grid: NaturePlacementGrid;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly load: LoadGltf = loadGltf,
    private readonly camera?: THREE.Camera,
    private readonly canvas?: HTMLCanvasElement,
  ) {
    this.group.name = ROOT_NAME;
    this.scene.add(this.group);
    this.grid = new NaturePlacementGrid(this.group);
  }

  syncGrid(
    visible: boolean,
    cellSize: NaturePlacementGridSize,
    center: NaturePlacementPoint,
  ): void {
    this.grid.update(visible, cellSize, center);
  }

  sync(placements: readonly NaturePlacement[], selectedId: string | null): void {
    if (this.disposed) return;
    const selectionChanged = this.selectedId !== selectedId;
    const liveIds = new Set(placements.map((placement) => placement.id));
    for (const id of [...this.entries.keys()]) {
      if (!liveIds.has(id)) this.removeEntry(id);
    }
    for (const placement of placements) {
      const existing = this.entries.get(placement.id);
      if (existing && existing.placement.assetId === placement.assetId) {
        existing.placement = { ...placement, position: { ...placement.position } };
        this.applyTransform(existing);
      } else {
        if (existing) this.removeEntry(placement.id);
        this.addEntry(placement);
      }
    }
    this.selectedId = selectedId;
    if (selectionChanged || (selectedId !== null && !this.selectionHelper)) {
      this.refreshSelection();
    } else {
      this.selectionHelper?.update();
    }
  }

  updateGhost(
    assetId: NaturePlacementAssetId,
    point: NaturePlacementPoint,
    transform: NaturePlacementTransform,
  ): void {
    if (this.disposed) return;
    if (this.ghost && this.ghostAssetId === assetId) {
      this.applyObjectTransform(this.ghost, point, transform, this.ghost.userData.minY ?? 0);
      this.ghost.visible = true;
      return;
    }
    this.clearGhost();
    const generation = this.ghostGeneration;
    const task = this.template(assetId)
      .then((template) => {
        if (this.disposed || generation !== this.ghostGeneration) return;
        const ghost = new THREE.Group();
        ghost.name = `Nature Placement Lab ghost: ${assetId}`;
        ghost.userData.minY = template.minY;
        const model = template.scene.clone(true);
        model.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          const source = Array.isArray(object.material) ? object.material : [object.material];
          const cloned = source.map((material) => {
            const copy = material.clone();
            copy.transparent = true;
            copy.opacity = Math.min(copy.opacity, GHOST_OPACITY);
            copy.depthWrite = false;
            return copy;
          });
          object.material = Array.isArray(object.material) ? cloned : cloned[0];
          object.renderOrder = 9_000;
        });
        ghost.add(model);
        this.applyObjectTransform(ghost, point, transform, template.minY);
        this.group.add(ghost);
        this.ghost = ghost;
        this.ghostAssetId = assetId;
      })
      .catch((error: unknown) => console.warn('Nature Placement Lab ghost load failed', error));
    this.track(task);
  }

  clearGhost(): void {
    this.ghostGeneration++;
    if (!this.ghost) return;
    this.ghost.traverse((object) => {
      if (object instanceof THREE.Mesh) disposeMaterial(object.material);
    });
    this.group.remove(this.ghost);
    this.ghost = null;
    this.ghostAssetId = null;
  }

  pickPlacement(clientX: number, clientY: number): string | null {
    if (!this.camera || !this.canvas || this.entries.size === 0) return null;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const targets = [...this.entries.values()]
      .map((entry) => entry.model)
      .filter((model): model is THREE.Object3D => model !== null);
    for (const hit of this.raycaster.intersectObjects(targets, true)) {
      let object: THREE.Object3D | null = hit.object;
      while (object && object !== this.group) {
        const id = object.userData.naturePlacementId;
        if (typeof id === 'string' && this.entries.has(id)) return id;
        object = object.parent;
      }
    }
    return null;
  }

  async settled(): Promise<void> {
    await Promise.allSettled([...this.pending]);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearGhost();
    this.grid.dispose();
    this.dropSelection();
    for (const id of [...this.entries.keys()]) this.removeEntry(id);
    this.scene.remove(this.group);
    this.templates.clear();
  }

  private template(assetId: NaturePlacementAssetId): Promise<Template> {
    let cached = this.templates.get(assetId);
    if (!cached) {
      const asset = naturePlacementAsset(assetId);
      cached = this.load(asset.assetPath)
        .then((gltf) => {
          const bounds = new THREE.Box3().setFromObject(gltf.scene);
          if (bounds.isEmpty() || !Number.isFinite(bounds.min.y)) {
            throw new Error(`Nature Placement Lab asset has invalid bounds: ${assetId}`);
          }
          return { minY: bounds.min.y, scene: gltf.scene };
        })
        .catch((error: unknown) => {
          if (this.templates.get(assetId) === cached) this.templates.delete(assetId);
          throw error;
        });
      this.templates.set(assetId, cached);
    }
    return cached;
  }

  private addEntry(placement: NaturePlacement): void {
    const group = new THREE.Group();
    group.name = placement.id;
    group.userData.naturePlacementId = placement.id;
    this.group.add(group);
    const entry: RenderEntry = {
      group,
      model: null,
      placement: { ...placement, position: { ...placement.position } },
      removed: false,
      template: null,
    };
    this.entries.set(placement.id, entry);
    const task = this.template(placement.assetId)
      .then((template) => {
        if (this.disposed || entry.removed) return;
        const model = template.scene.clone(true);
        const asset = naturePlacementAsset(entry.placement.assetId);
        model.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          object.castShadow = asset.shadows;
          object.receiveShadow = asset.shadows;
        });
        model.userData.naturePlacementId = entry.placement.id;
        entry.template = template;
        entry.model = model;
        entry.group.add(model);
        this.applyTransform(entry);
        if (this.selectedId === entry.placement.id) this.refreshSelection();
      })
      .catch((error: unknown) =>
        console.warn(`Nature Placement Lab asset failed to load: ${placement.assetId}`, error),
      );
    this.track(task);
  }

  private removeEntry(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.removed = true;
    this.entries.delete(id);
    this.group.remove(entry.group);
    if (this.selectedId === id) this.dropSelection();
  }

  private applyTransform(entry: RenderEntry): void {
    if (!entry.model || !entry.template) return;
    const transform: NaturePlacementTransform = {
      assetId: entry.placement.assetId,
      rotationY: entry.placement.rotationY,
      scale: entry.placement.scale,
      groundOffsetY: entry.placement.groundOffsetY,
    };
    this.applyObjectTransform(
      entry.group,
      entry.placement.position,
      transform,
      entry.template.minY,
    );
  }

  private applyObjectTransform(
    group: THREE.Group,
    point: NaturePlacementPoint,
    transform: NaturePlacementTransform,
    minY: number,
  ): void {
    const asset = naturePlacementAsset(transform.assetId);
    const worldScale = asset.baseScale * transform.scale;
    group.position.set(point.x, point.y + transform.groundOffsetY, point.z);
    group.rotation.y = transform.rotationY;
    const model = group.children[0];
    if (model) {
      model.scale.setScalar(worldScale);
      model.position.y = -minY * worldScale;
    }
    group.updateMatrixWorld(true);
    if (this.selectionHelper && this.selectedId === group.userData.naturePlacementId) {
      this.selectionHelper.update();
    }
  }

  private refreshSelection(): void {
    this.dropSelection();
    const entry = this.selectedId === null ? undefined : this.entries.get(this.selectedId);
    if (!entry?.model) return;
    this.selectionHelper = new THREE.BoxHelper(entry.group, SELECTION_COLOR);
    this.selectionHelper.name = 'Nature Placement Lab selection';
    this.selectionHelper.renderOrder = 9_001;
    this.group.add(this.selectionHelper);
  }

  private dropSelection(): void {
    if (!this.selectionHelper) return;
    this.group.remove(this.selectionHelper);
    this.selectionHelper.geometry.dispose();
    disposeMaterial(this.selectionHelper.material);
    this.selectionHelper = null;
  }

  private track(task: Promise<unknown>): void {
    this.pending.add(task);
    void task.finally(() => this.pending.delete(task));
  }
}
