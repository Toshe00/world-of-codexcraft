import {
  NATURE_PLACEMENT_LIMITS,
  type NaturePlacementPoint,
  normalizePlacementRotation,
} from './placement_core';
import {
  type NaturePlacementGridSize,
  type NaturePlacementRotationStep,
  type NaturePlacementScaleStep,
  snapPlacementPosition,
  snapPlacementRotation,
  snapPlacementScale,
} from './placement_snapping';

export const NATURE_PLACEMENT_INSPECTOR_LIMITS = Object.freeze({
  rotationDegreesMin: -360,
  rotationDegreesMax: 360,
});

export type NaturePlacementInspectorField =
  | 'positionX'
  | 'positionY'
  | 'positionZ'
  | 'rotationY'
  | 'scale'
  | 'groundOffsetY';

export interface NaturePlacementInspectorInput {
  positionX: string;
  positionY: string;
  positionZ: string;
  rotationY: string;
  scale: string;
  groundOffsetY: string;
}

export interface NaturePlacementInspectorTransform {
  position: NaturePlacementPoint;
  rotationY: number;
  scale: number;
  groundOffsetY: number;
}

export interface NaturePlacementTransformSnapOptions {
  position: boolean;
  rotation: boolean;
  scale: boolean;
  gridSize: NaturePlacementGridSize;
  rotationStep: NaturePlacementRotationStep;
  scaleStep: NaturePlacementScaleStep;
}

export type NaturePlacementValidationError =
  | { kind: 'finite'; field: NaturePlacementInspectorField }
  | { kind: 'range'; field: NaturePlacementInspectorField; min: number; max: number };

export type NaturePlacementValidationResult =
  | { ok: true; value: NaturePlacementInspectorTransform }
  | { ok: false; error: NaturePlacementValidationError };

function parseField(
  input: string,
  field: NaturePlacementInspectorField,
  min: number,
  max: number,
): number | NaturePlacementValidationError {
  if (input.trim() === '') return { kind: 'finite', field };
  const value = Number(input);
  if (!Number.isFinite(value)) return { kind: 'finite', field };
  if (value < min || value > max) return { kind: 'range', field, min, max };
  return value;
}

function isError(
  value: number | NaturePlacementValidationError,
): value is NaturePlacementValidationError {
  return typeof value !== 'number';
}

export function validateNaturePlacementTransform(
  input: NaturePlacementInspectorInput,
  snapping: NaturePlacementTransformSnapOptions,
): NaturePlacementValidationResult {
  const parsed = [
    parseField(
      input.positionX,
      'positionX',
      -NATURE_PLACEMENT_LIMITS.positionAbsMax,
      NATURE_PLACEMENT_LIMITS.positionAbsMax,
    ),
    parseField(
      input.positionY,
      'positionY',
      NATURE_PLACEMENT_LIMITS.groundYMin,
      NATURE_PLACEMENT_LIMITS.groundYMax,
    ),
    parseField(
      input.positionZ,
      'positionZ',
      -NATURE_PLACEMENT_LIMITS.positionAbsMax,
      NATURE_PLACEMENT_LIMITS.positionAbsMax,
    ),
    parseField(
      input.rotationY,
      'rotationY',
      NATURE_PLACEMENT_INSPECTOR_LIMITS.rotationDegreesMin,
      NATURE_PLACEMENT_INSPECTOR_LIMITS.rotationDegreesMax,
    ),
    parseField(
      input.scale,
      'scale',
      NATURE_PLACEMENT_LIMITS.scaleMin,
      NATURE_PLACEMENT_LIMITS.scaleMax,
    ),
    parseField(
      input.groundOffsetY,
      'groundOffsetY',
      NATURE_PLACEMENT_LIMITS.groundOffsetMin,
      NATURE_PLACEMENT_LIMITS.groundOffsetMax,
    ),
  ] as const;
  const error = parsed.find(isError);
  if (error) return { ok: false, error };

  const [positionX, positionY, positionZ, rotationDegrees, parsedScale, groundOffsetY] =
    parsed as readonly [number, number, number, number, number, number];

  let position = { x: positionX, y: positionY, z: positionZ };
  let rotationY = normalizePlacementRotation((rotationDegrees * Math.PI) / 180);
  let scale = parsedScale;
  if (snapping.position) position = snapPlacementPosition(position, snapping.gridSize);
  if (snapping.rotation) rotationY = snapPlacementRotation(rotationY, snapping.rotationStep);
  if (snapping.scale) scale = snapPlacementScale(scale, snapping.scaleStep);
  return {
    ok: true,
    value: { position, rotationY, scale, groundOffsetY },
  };
}
