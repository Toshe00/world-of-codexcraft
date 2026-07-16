import {
  NATURE_PLACEMENT_LIMITS,
  type NaturePlacementPoint,
  normalizePlacementRotation,
} from './placement_core';

export const NATURE_PLACEMENT_GRID_SIZES = [0.25, 0.5, 1, 2, 5] as const;
export const NATURE_PLACEMENT_ROTATION_STEPS = [5, 15, 30, 45, 90] as const;
export const NATURE_PLACEMENT_SCALE_STEPS = [0.01, 0.05, 0.1, 0.25] as const;

export type NaturePlacementGridSize = (typeof NATURE_PLACEMENT_GRID_SIZES)[number];
export type NaturePlacementRotationStep = (typeof NATURE_PLACEMENT_ROTATION_STEPS)[number];
export type NaturePlacementScaleStep = (typeof NATURE_PLACEMENT_SCALE_STEPS)[number];

function roundFinite(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value * 1_000_000) / 1_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function snapValue(value: number, step: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0) return 0;
  return roundFinite(Math.round(value / step) * step);
}

export function snapPlacementPosition(
  point: NaturePlacementPoint,
  cellSize: NaturePlacementGridSize,
): NaturePlacementPoint {
  return {
    x: snapValue(point.x, cellSize),
    y: point.y,
    z: snapValue(point.z, cellSize),
  };
}

export function snapPlacementRotation(
  radians: number,
  stepDegrees: NaturePlacementRotationStep,
): number {
  const stepRadians = (stepDegrees * Math.PI) / 180;
  return normalizePlacementRotation(snapValue(radians, stepRadians));
}

export function snapPlacementScale(scale: number, step: NaturePlacementScaleStep): number {
  const snapped = snapValue(scale, step);
  return roundFinite(
    Math.min(NATURE_PLACEMENT_LIMITS.scaleMax, Math.max(NATURE_PLACEMENT_LIMITS.scaleMin, snapped)),
  );
}

export function placePointOnGround(
  point: NaturePlacementPoint,
  sampleGroundY: (x: number, z: number) => number,
): NaturePlacementPoint | null {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) return null;
  const y = sampleGroundY(point.x, point.z);
  if (
    !Number.isFinite(y) ||
    y < NATURE_PLACEMENT_LIMITS.groundYMin ||
    y > NATURE_PLACEMENT_LIMITS.groundYMax
  ) {
    return null;
  }
  return { x: point.x, y: roundFinite(y), z: point.z };
}
