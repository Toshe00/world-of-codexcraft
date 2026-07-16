import * as THREE from 'three';
import type { NaturePlacementPoint } from './placement_core';
import type { NaturePlacementGridSize } from './placement_snapping';

const GRID_WORLD_SIZE = 40;
const GRID_MAJOR_COLOR = 0xb99a58;
const GRID_MINOR_COLOR = 0x6f674f;
const GRID_OPACITY = 0.24;
const GRID_Y_LIFT = 0.02;

function disposeMaterial(material: THREE.Material | THREE.Material[]): void {
  if (Array.isArray(material)) {
    for (const entry of material) entry.dispose();
  } else {
    material.dispose();
  }
}

export class NaturePlacementGrid {
  private helper: THREE.GridHelper | null = null;
  private cellSize: NaturePlacementGridSize | null = null;
  private disposed = false;

  constructor(private readonly parent: THREE.Object3D) {}

  update(visible: boolean, cellSize: NaturePlacementGridSize, center: NaturePlacementPoint): void {
    if (this.disposed) return;
    if (!this.helper || this.cellSize !== cellSize) this.rebuild(cellSize);
    if (!this.helper) return;
    this.helper.visible = visible;
    this.helper.position.set(
      Math.round(center.x / cellSize) * cellSize,
      center.y + GRID_Y_LIFT,
      Math.round(center.z / cellSize) * cellSize,
    );
    this.helper.updateMatrixWorld(true);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.dropHelper();
  }

  private rebuild(cellSize: NaturePlacementGridSize): void {
    this.dropHelper();
    const divisions = Math.round(GRID_WORLD_SIZE / cellSize);
    const helper = new THREE.GridHelper(
      GRID_WORLD_SIZE,
      divisions,
      GRID_MAJOR_COLOR,
      GRID_MINOR_COLOR,
    );
    helper.name = 'Nature Placement Lab grid';
    const materials = Array.isArray(helper.material) ? helper.material : [helper.material];
    for (const material of materials) {
      material.transparent = true;
      material.opacity = GRID_OPACITY;
      material.depthWrite = false;
    }
    helper.renderOrder = 8_999;
    this.parent.add(helper);
    this.helper = helper;
    this.cellSize = cellSize;
  }

  private dropHelper(): void {
    if (!this.helper) return;
    this.parent.remove(this.helper);
    this.helper.geometry.dispose();
    disposeMaterial(this.helper.material);
    this.helper = null;
    this.cellSize = null;
  }
}
