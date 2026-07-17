import * as THREE from 'three';
import type {
  FootprintAnalysis,
  ProtectedZone,
  TerrainAnchor,
  TerrainGridSample,
  TerrainSurveyGrid,
} from './terrain_survey_core';

const ROOT_NAME = 'Starter Zone Terrain Survey';
const GRID_LIFT = 0.08;
const FOOTPRINT_LIFT = 0.18;
const PROTECTED_LIFT = 0.12;
const FLAT_COLOR = new THREE.Color(0x42c96b);
const MODERATE_COLOR = new THREE.Color(0xe1b447);
const STEEP_COLOR = new THREE.Color(0xd9534f);
const PROTECTED_COLOR = 0xb86cff;
const ANCHOR_COLOR = 0x58d3ff;

function disposeMaterial(material: THREE.Material | THREE.Material[]): void {
  if (Array.isArray(material)) {
    for (const entry of material) entry.dispose();
  } else {
    material.dispose();
  }
}

function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (
      child instanceof THREE.Mesh ||
      child instanceof THREE.Line ||
      child instanceof THREE.LineSegments ||
      child instanceof THREE.Points
    ) {
      child.geometry.dispose();
      disposeMaterial(child.material);
    }
  });
  object.removeFromParent();
}

function sampleColor(sample: TerrainGridSample): THREE.Color {
  if (sample.slopeClass === 'flat') return FLAT_COLOR;
  if (sample.slopeClass === 'moderate') return MODERATE_COLOR;
  return STEEP_COLOR;
}

function appendSegment(
  positions: number[],
  colors: number[],
  first: TerrainGridSample,
  second: TerrainGridSample,
): void {
  const firstColor = sampleColor(first);
  const secondColor = sampleColor(second);
  positions.push(first.x, first.y + GRID_LIFT, first.z, second.x, second.y + GRID_LIFT, second.z);
  colors.push(
    firstColor.r,
    firstColor.g,
    firstColor.b,
    secondColor.r,
    secondColor.g,
    secondColor.b,
  );
}

export class TerrainSurveyRender {
  readonly group = new THREE.Group();
  private grid: THREE.Object3D | null = null;
  private protectedMarkers: THREE.Group | null = null;
  private footprint: THREE.Group | null = null;
  private anchors: THREE.Group | null = null;
  private disposed = false;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly sampleHeight: (x: number, z: number) => number,
  ) {
    this.group.name = ROOT_NAME;
    this.scene.add(this.group);
  }

  syncGrid(grid: TerrainSurveyGrid, visible: boolean): void {
    if (this.disposed) return;
    if (this.grid) disposeObject(this.grid);
    this.grid = null;
    if (!visible) return;
    const positions: number[] = [];
    const colors: number[] = [];
    for (let row = 0; row < grid.rows; row++) {
      for (let column = 0; column < grid.columns; column++) {
        const index = row * grid.columns + column;
        const sample = grid.samples[index];
        if (!sample) continue;
        if (column + 1 < grid.columns) {
          const right = grid.samples[index + 1];
          if (right) appendSegment(positions, colors, sample, right);
        }
        if (row + 1 < grid.rows) {
          const down = grid.samples[index + grid.columns];
          if (down) appendSegment(positions, colors, sample, down);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
    });
    const lines = new THREE.LineSegments(geometry, material);
    lines.name = 'Terrain slope grid';
    lines.renderOrder = 8_900;
    this.grid = lines;
    this.group.add(lines);
  }

  syncProtectedZones(zones: readonly ProtectedZone[]): void {
    if (this.disposed) return;
    if (this.protectedMarkers) disposeObject(this.protectedMarkers);
    const root = new THREE.Group();
    root.name = 'Protected terrain survey zones';
    for (const zone of zones) {
      if (zone.shape === 'circle') {
        root.add(this.circle(zone.x, zone.z, zone.radius, PROTECTED_COLOR));
      } else if (zone.shape === 'corridor') {
        const dx = zone.x2 - zone.x1;
        const dz = zone.z2 - zone.z1;
        const length = Math.hypot(dx, dz) || 1;
        const offsetX = (-dz / length) * zone.radius;
        const offsetZ = (dx / length) * zone.radius;
        root.add(
          this.polyline([
            { x: zone.x1 + offsetX, z: zone.z1 + offsetZ },
            { x: zone.x2 + offsetX, z: zone.z2 + offsetZ },
            { x: zone.x2 - offsetX, z: zone.z2 - offsetZ },
            { x: zone.x1 - offsetX, z: zone.z1 - offsetZ },
          ]),
        );
      } else {
        const c = Math.cos(zone.rotationY);
        const s = Math.sin(zone.rotationY);
        const corners = [
          [-zone.width / 2, zone.depth / 2],
          [zone.width / 2, zone.depth / 2],
          [zone.width / 2, -zone.depth / 2],
          [-zone.width / 2, -zone.depth / 2],
        ] as const;
        root.add(
          this.polyline(
            corners.map(([x, z]) => ({
              x: zone.x + x * c + z * s,
              z: zone.z - x * s + z * c,
            })),
          ),
        );
      }
    }
    this.protectedMarkers = root;
    this.group.add(root);
  }

  syncFootprint(analysis: FootprintAnalysis | null): void {
    if (this.disposed) return;
    if (this.footprint) disposeObject(this.footprint);
    this.footprint = null;
    if (!analysis) return;
    const root = new THREE.Group();
    root.name = 'Terrain survey footprint';
    const planeY = analysis.averageHeight + FOOTPRINT_LIFT;
    const planeGeometry = new THREE.BufferGeometry();
    planeGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        analysis.corners.flatMap((corner) => [corner.x, planeY, corner.z]),
        3,
      ),
    );
    planeGeometry.setIndex([0, 1, 2, 0, 2, 3]);
    const planeMaterial = new THREE.MeshBasicMaterial({
      color: analysis.compatible ? FLAT_COLOR : STEEP_COLOR,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const plane = new THREE.Mesh(planeGeometry, planeMaterial);
    plane.renderOrder = 8_903;
    root.add(plane);

    const outlineGeometry = new THREE.BufferGeometry().setFromPoints(
      analysis.corners.map((corner) => new THREE.Vector3(corner.x, planeY, corner.z)),
    );
    const outline = new THREE.LineLoop(
      outlineGeometry,
      new THREE.LineBasicMaterial({
        color: analysis.compatible ? FLAT_COLOR : STEEP_COLOR,
        depthTest: false,
      }),
    );
    outline.renderOrder = 8_905;
    root.add(outline);

    const deltaPositions: number[] = [];
    const pointPositions: number[] = [];
    const pointColors: number[] = [];
    for (const corner of analysis.corners) {
      deltaPositions.push(
        corner.x,
        corner.y + GRID_LIFT,
        corner.z,
        corner.x,
        planeY,
        corner.z,
      );
      pointPositions.push(corner.x, corner.y + GRID_LIFT, corner.z);
      const color =
        corner.status === 'level'
          ? FLAT_COLOR
          : corner.status === 'floating'
            ? MODERATE_COLOR
            : STEEP_COLOR;
      pointColors.push(color.r, color.g, color.b);
    }
    const deltaGeometry = new THREE.BufferGeometry();
    deltaGeometry.setAttribute('position', new THREE.Float32BufferAttribute(deltaPositions, 3));
    const deltas = new THREE.LineSegments(
      deltaGeometry,
      new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false }),
    );
    deltas.renderOrder = 8_906;
    root.add(deltas);
    const pointGeometry = new THREE.BufferGeometry();
    pointGeometry.setAttribute('position', new THREE.Float32BufferAttribute(pointPositions, 3));
    pointGeometry.setAttribute('color', new THREE.Float32BufferAttribute(pointColors, 3));
    const points = new THREE.Points(
      pointGeometry,
      new THREE.PointsMaterial({ size: 0.45, vertexColors: true, depthTest: false }),
    );
    points.renderOrder = 8_907;
    root.add(points);
    this.footprint = root;
    this.group.add(root);
  }

  syncAnchors(anchors: readonly TerrainAnchor[]): void {
    if (this.disposed) return;
    if (this.anchors) disposeObject(this.anchors);
    const root = new THREE.Group();
    root.name = 'Terrain survey anchors';
    for (const anchor of anchors) {
      root.add(this.circle(anchor.position.x, anchor.position.z, 1, ANCHOR_COLOR));
      const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(anchor.position.x, anchor.position.y + PROTECTED_LIFT, anchor.position.z),
        new THREE.Vector3(anchor.position.x, anchor.position.y + 2, anchor.position.z),
      ]);
      root.add(new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: ANCHOR_COLOR })));
    }
    this.anchors = root;
    this.group.add(root);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.grid) disposeObject(this.grid);
    if (this.protectedMarkers) disposeObject(this.protectedMarkers);
    if (this.footprint) disposeObject(this.footprint);
    if (this.anchors) disposeObject(this.anchors);
    this.grid = null;
    this.protectedMarkers = null;
    this.footprint = null;
    this.anchors = null;
    this.scene.remove(this.group);
  }

  private circle(x: number, z: number, radius: number, color: number): THREE.LineLoop {
    const points: THREE.Vector3[] = [];
    const segments = 32;
    for (let index = 0; index < segments; index++) {
      const angle = (index / segments) * Math.PI * 2;
      const px = x + Math.cos(angle) * radius;
      const pz = z + Math.sin(angle) * radius;
      points.push(new THREE.Vector3(px, this.sampleHeight(px, pz) + PROTECTED_LIFT, pz));
    }
    const line = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.82, depthTest: false }),
    );
    line.renderOrder = 8_902;
    return line;
  }

  private polyline(points: readonly { x: number; z: number }[]): THREE.LineLoop {
    const line = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(
        points.map(
          (point) =>
            new THREE.Vector3(
              point.x,
              this.sampleHeight(point.x, point.z) + PROTECTED_LIFT,
              point.z,
            ),
        ),
      ),
      new THREE.LineBasicMaterial({
        color: PROTECTED_COLOR,
        transparent: true,
        opacity: 0.82,
        depthTest: false,
      }),
    );
    line.renderOrder = 8_902;
    return line;
  }
}

