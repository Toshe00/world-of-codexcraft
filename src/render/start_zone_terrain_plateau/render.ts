import * as THREE from 'three';
import type { StartZoneTerrainPlateauPatch } from '../../sim/start_zone_terrain_plateau';
import type { ProtectedZone } from '../start_zone_terrain_survey/terrain_survey_core';
import type { PlateauRenderAdapter } from './controller';

const LIFT = 0.18;
const CORE_COLOR = 0x76b58a;
const TRANSITION_COLOR = 0xe0b466;
const RAISED_COLOR = 0x7eb6df;
const LOWERED_COLOR = 0xd98a72;
const PROTECTED_COLOR = 0xe06c75;

function dispose(object: THREE.Object3D): void {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose();
    const material = mesh.material;
    if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
    else material?.dispose();
  });
  object.removeFromParent();
}

export class StartZoneTerrainPlateauRender implements PlateauRenderAdapter {
  private readonly group = new THREE.Group();
  private current: THREE.Group | null = null;

  constructor(
    scene: THREE.Scene,
    private readonly sampleHeight: (x: number, z: number) => number,
    private readonly sampleOriginalHeight: (x: number, z: number) => number,
  ) {
    this.group.name = 'Starter Zone Plateau Lab';
    scene.add(this.group);
  }

  sync(
    patch: StartZoneTerrainPlateauPatch,
    protectedZones: readonly ProtectedZone[],
    protectedZonesVisible: boolean,
  ): void {
    if (this.current) dispose(this.current);
    const root = new THREE.Group();
    root.add(this.rectangle(patch, 0, CORE_COLOR, true));
    root.add(this.rectangle(patch, patch.blendWidth, TRANSITION_COLOR, false));
    root.add(this.marker(patch.centerX, patch.centerZ, 0xf5e6a8));
    for (const corner of this.corners(patch, 0)) root.add(this.marker(corner.x, corner.z, 0xffffff));
    if (protectedZonesVisible) {
      for (const zone of protectedZones) root.add(this.protectedShape(zone));
    }
    this.current = root;
    this.group.add(root);
  }

  dispose(): void {
    if (this.current) dispose(this.current);
    this.current = null;
    this.group.removeFromParent();
  }

  private corners(patch: StartZoneTerrainPlateauPatch, expansion: number): { x: number; z: number }[] {
    const halfX = patch.width / 2 + expansion;
    const halfZ = patch.depth / 2 + expansion;
    const cos = Math.cos(patch.rotationY);
    const sin = Math.sin(patch.rotationY);
    return [
      [-halfX, -halfZ],
      [halfX, -halfZ],
      [halfX, halfZ],
      [-halfX, halfZ],
    ].map(([x, z]) => ({ x: patch.centerX + x * cos + z * sin, z: patch.centerZ - x * sin + z * cos }));
  }

  private rectangle(
    patch: StartZoneTerrainPlateauPatch,
    expansion: number,
    color: number,
    fill: boolean,
  ): THREE.Object3D {
    const corners = this.corners(patch, expansion);
    const points = [...corners, corners[0]].map((point) => new THREE.Vector3(point.x, this.sampleHeight(point.x, point.z) + LIFT, point.z));
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.9 }),
    );
    line.renderOrder = 8_930;
    if (!fill) return line;
    const shape = new THREE.Shape(corners.map((point) => new THREE.Vector2(point.x, point.z)));
    const material = new THREE.MeshBasicMaterial({
      color: this.sampleOriginalHeight(patch.centerX, patch.centerZ) <= patch.targetHeight ? RAISED_COLOR : LOWERED_COLOR,
      transparent: true,
      opacity: 0.13,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = patch.targetHeight + LIFT / 2;
    mesh.renderOrder = 8_928;
    const root = new THREE.Group();
    root.add(mesh, line);
    return root;
  }

  private marker(x: number, z: number, color: number): THREE.Points {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([x, this.sampleHeight(x, z) + LIFT * 2, z], 3));
    const point = new THREE.Points(geometry, new THREE.PointsMaterial({ color, size: 0.75, depthTest: false }));
    point.renderOrder = 8_932;
    return point;
  }

  private protectedShape(zone: ProtectedZone): THREE.Object3D {
    const points: THREE.Vector3[] = [];
    if (zone.shape === 'corridor') {
      points.push(
        new THREE.Vector3(zone.x1, this.sampleHeight(zone.x1, zone.z1) + LIFT, zone.z1),
        new THREE.Vector3(zone.x2, this.sampleHeight(zone.x2, zone.z2) + LIFT, zone.z2),
      );
      return new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({ color: PROTECTED_COLOR, depthTest: false, transparent: true, opacity: 0.38 }),
      );
    }
    const segments = zone.shape === 'rectangle' ? 4 : 24;
    for (let index = 0; index <= segments; index++) {
      const angle = (index / segments) * Math.PI * 2;
      const x = zone.shape === 'rectangle' ? zone.x + Math.cos(angle + Math.PI / 4) * Math.hypot(zone.width, zone.depth) / 2 : zone.x + Math.cos(angle) * zone.radius;
      const z = zone.shape === 'rectangle' ? zone.z + Math.sin(angle + Math.PI / 4) * Math.hypot(zone.width, zone.depth) / 2 : zone.z + Math.sin(angle) * zone.radius;
      points.push(new THREE.Vector3(x, this.sampleHeight(x, z) + LIFT, z));
    }
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color: PROTECTED_COLOR, depthTest: false, transparent: true, opacity: 0.38 }),
    );
    line.renderOrder = 8_931;
    return line;
  }
}
