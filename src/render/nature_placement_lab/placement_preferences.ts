import {
  NATURE_PLACEMENT_GRID_SIZES,
  NATURE_PLACEMENT_ROTATION_STEPS,
  NATURE_PLACEMENT_SCALE_STEPS,
  type NaturePlacementGridSize,
  type NaturePlacementRotationStep,
  type NaturePlacementScaleStep,
} from './placement_snapping';

export const NATURE_PLACEMENT_PREFERENCES_KEY = 'dev.nature-placement-lab.preferences.v1';

export interface NaturePlacementPreferences {
  gridVisible: boolean;
  gridSize: NaturePlacementGridSize;
  snapPosition: boolean;
  snapRotation: boolean;
  snapScale: boolean;
  snapToGround: boolean;
  rotationStep: NaturePlacementRotationStep;
  scaleStep: NaturePlacementScaleStep;
}

export const DEFAULT_NATURE_PLACEMENT_PREFERENCES: Readonly<NaturePlacementPreferences> =
  Object.freeze({
    gridVisible: true,
    gridSize: 1,
    snapPosition: false,
    snapRotation: false,
    snapScale: false,
    snapToGround: false,
    rotationStep: 15,
    scaleStep: 0.1,
  });

export interface NaturePlacementPreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function includesNumber<T extends number>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'number' && values.includes(value as T);
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function normalizeNaturePlacementPreferences(value: unknown): NaturePlacementPreferences {
  const source =
    typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const defaults = DEFAULT_NATURE_PLACEMENT_PREFERENCES;
  return {
    gridVisible: booleanOr(source.gridVisible, defaults.gridVisible),
    gridSize: includesNumber(NATURE_PLACEMENT_GRID_SIZES, source.gridSize)
      ? source.gridSize
      : defaults.gridSize,
    snapPosition: booleanOr(source.snapPosition, defaults.snapPosition),
    snapRotation: booleanOr(source.snapRotation, defaults.snapRotation),
    snapScale: booleanOr(source.snapScale, defaults.snapScale),
    snapToGround: booleanOr(source.snapToGround, defaults.snapToGround),
    rotationStep: includesNumber(NATURE_PLACEMENT_ROTATION_STEPS, source.rotationStep)
      ? source.rotationStep
      : defaults.rotationStep,
    scaleStep: includesNumber(NATURE_PLACEMENT_SCALE_STEPS, source.scaleStep)
      ? source.scaleStep
      : defaults.scaleStep,
  };
}

export function loadNaturePlacementPreferences(
  storage: NaturePlacementPreferenceStorage | null,
): NaturePlacementPreferences {
  if (!storage) return { ...DEFAULT_NATURE_PLACEMENT_PREFERENCES };
  try {
    return normalizeNaturePlacementPreferences(
      JSON.parse(storage.getItem(NATURE_PLACEMENT_PREFERENCES_KEY) ?? 'null'),
    );
  } catch {
    return { ...DEFAULT_NATURE_PLACEMENT_PREFERENCES };
  }
}

export function saveNaturePlacementPreferences(
  storage: NaturePlacementPreferenceStorage | null,
  preferences: NaturePlacementPreferences,
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(
      NATURE_PLACEMENT_PREFERENCES_KEY,
      JSON.stringify(normalizeNaturePlacementPreferences(preferences)),
    );
    return true;
  } catch {
    return false;
  }
}
