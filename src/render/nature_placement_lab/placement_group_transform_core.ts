import {
  NATURE_PLACEMENT_LIMITS,
  normalizePlacementRotation,
  validNaturePlacementPoint,
} from './placement_core';
import { type NatureProjectPlacement, selectionCenter } from './placement_project_core';
import {
  type NaturePlacementGridSize,
  type NaturePlacementRotationStep,
  type NaturePlacementScaleStep,
  snapPlacementPosition,
  snapPlacementRotation,
  snapPlacementScale,
} from './placement_snapping';

export interface NaturePlacementGroupTransform {
  moveTo?: { x: number; y: number; z: number };
  rotationDelta?: number;
  scaleFactor?: number;
  groundOffsetDelta?: number;
  placeOnGround?: boolean;
}

export interface NaturePlacementGroupSnapOptions {
  position: boolean;
  rotation: boolean;
  scale: boolean;
  gridSize: NaturePlacementGridSize;
  rotationStep: NaturePlacementRotationStep;
  scaleStep: NaturePlacementScaleStep;
}

function round(value: number): number {
  const rounded = Math.round(value * 1_000_000) / 1_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function transformNaturePlacementGroup(
  placements: readonly NatureProjectPlacement[],
  transform: NaturePlacementGroupTransform,
  snapping: NaturePlacementGroupSnapOptions,
  sampleGroundY: (x: number, z: number) => number,
): NatureProjectPlacement[] | null {
  const center = selectionCenter(placements);
  if (!center || placements.length === 0) return null;
  if (
    (transform.moveTo &&
      (!Number.isFinite(transform.moveTo.x) ||
        !Number.isFinite(transform.moveTo.y) ||
        !Number.isFinite(transform.moveTo.z))) ||
    (transform.rotationDelta !== undefined && !Number.isFinite(transform.rotationDelta)) ||
    (transform.scaleFactor !== undefined &&
      (!Number.isFinite(transform.scaleFactor) || transform.scaleFactor <= 0)) ||
    (transform.groundOffsetDelta !== undefined && !Number.isFinite(transform.groundOffsetDelta))
  ) {
    return null;
  }

  const targetCenter = transform.moveTo
    ? snapping.position
      ? snapPlacementPosition(transform.moveTo, snapping.gridSize)
      : { ...transform.moveTo }
    : center;
  const translation = {
    x: targetCenter.x - center.x,
    y: targetCenter.y - center.y,
    z: targetCenter.z - center.z,
  };
  const rotationDelta =
    transform.rotationDelta === undefined
      ? 0
      : snapping.rotation
        ? snapPlacementRotation(transform.rotationDelta, snapping.rotationStep)
        : transform.rotationDelta;
  const sin = Math.sin(rotationDelta);
  const cos = Math.cos(rotationDelta);

  const result: NatureProjectPlacement[] = [];
  for (const placement of placements) {
    const relativeX = placement.position.x - center.x;
    const relativeZ = placement.position.z - center.z;
    const position = {
      x: center.x + relativeX * cos + relativeZ * sin + translation.x,
      y: placement.position.y + translation.y,
      z: center.z - relativeX * sin + relativeZ * cos + translation.z,
    };
    if (transform.placeOnGround) {
      const groundY = sampleGroundY(position.x, position.z);
      if (!Number.isFinite(groundY)) return null;
      position.y = groundY;
    }
    if (!validNaturePlacementPoint(position)) return null;
    const rawScale =
      transform.scaleFactor === undefined
        ? placement.scale
        : placement.scale * transform.scaleFactor;
    if (
      rawScale < NATURE_PLACEMENT_LIMITS.scaleMin ||
      rawScale > NATURE_PLACEMENT_LIMITS.scaleMax
    ) {
      return null;
    }
    const scale = snapping.scale
      ? snapPlacementScale(rawScale, snapping.scaleStep)
      : round(rawScale);
    const groundOffsetY = round(placement.groundOffsetY + (transform.groundOffsetDelta ?? 0));
    if (
      scale < NATURE_PLACEMENT_LIMITS.scaleMin ||
      scale > NATURE_PLACEMENT_LIMITS.scaleMax ||
      groundOffsetY < NATURE_PLACEMENT_LIMITS.groundOffsetMin ||
      groundOffsetY > NATURE_PLACEMENT_LIMITS.groundOffsetMax
    ) {
      return null;
    }
    result.push({
      ...placement,
      position: { x: round(position.x), y: round(position.y), z: round(position.z) },
      rotationY: normalizePlacementRotation(placement.rotationY + rotationDelta),
      scale,
      groundOffsetY,
    });
  }
  return result;
}
