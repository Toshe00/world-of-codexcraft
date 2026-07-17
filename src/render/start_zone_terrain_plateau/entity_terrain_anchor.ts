import {
  terrainAnchoredEntityY,
  type TerrainEntityHeightSource,
} from '../../sim/start_zone_terrain_plateau';

export interface TerrainEntityPosition {
  x: number;
  y: number;
  z: number;
}

interface TerrainEntityPositionWriter {
  position: {
    set(x: number, y: number, z: number): unknown;
  };
}

export interface TerrainEntityRenderPositionInput {
  authoritativePosition: TerrainEntityPosition;
  dead: boolean;
  group: TerrainEntityPositionWriter;
  hasHoverVisual: boolean;
  interpolationAlpha: number;
  isSelf: boolean;
  jumping: boolean;
  modifiedTerrainHeight(x: number, z: number): number;
  onGround: boolean;
  originalTerrainHeight(x: number, z: number): number;
  plateauEnabled: boolean;
  previousHeightSource: TerrainEntityHeightSource;
  previousPosition: TerrainEntityPosition;
  selfPosition: TerrainEntityPosition | null;
  snapshotUpdatedAt: number | undefined;
  swimming: boolean;
}

export interface TerrainEntityRenderPosition {
  heightSource: TerrainEntityHeightSource;
  interpolatedAuthoritativeX: number;
  interpolatedAuthoritativeY: number;
  interpolatedAuthoritativeZ: number;
  modifiedTerrainY: number;
  originalTerrainY: number;
  parentGroupY: number;
  plateauDelta: number;
  terrainAnchored: boolean;
  visualAirborne: boolean;
}

const HEIGHT_SOURCE_TIE_EPSILON = 1e-6;

function interpolate(from: number, to: number, alpha: number): number {
  return from + (to - from) * alpha;
}

/**
 * Snapshots always carry the server's original heightfield. Offline entities
 * have no snapshot clock, so their stored authority is classified by the
 * surface it actually matches: static actors made before enabling the lab
 * remain original, while a mover that has ticked across the edited terrain is
 * already modified. The previous result only resolves an exact tie, where the
 * two surfaces are equal or visually indistinguishable.
 */
function resolveHeightSource(input: TerrainEntityRenderPositionInput): TerrainEntityHeightSource {
  if (input.isSelf) return 'modified';
  if (input.snapshotUpdatedAt !== undefined) return 'original';

  const { x, y, z } = input.authoritativePosition;
  const originalY = input.originalTerrainHeight(x, z);
  const modifiedY = input.modifiedTerrainHeight(x, z);
  if (!Number.isFinite(originalY) || !Number.isFinite(modifiedY)) return input.previousHeightSource;

  const originalDistance = Math.abs(y - originalY);
  const modifiedDistance = Math.abs(y - modifiedY);
  if (Math.abs(originalDistance - modifiedDistance) <= HEIGHT_SOURCE_TIE_EPSILON) {
    return input.previousHeightSource;
  }
  return originalDistance < modifiedDistance ? 'original' : 'modified';
}

/**
 * The sole final parent-group write for a terrestrial entity in the plateau
 * renderer path. It deliberately runs after interpolation, samples both
 * terrain functions at that interpolated X/Z, and leaves every child-model
 * pivot offset such as CharacterVisual's prep.yOffset untouched.
 */
export function updateTerrainEntityRenderPosition(
  input: TerrainEntityRenderPositionInput,
): TerrainEntityRenderPosition {
  const source = input.isSelf && input.selfPosition ? input.selfPosition : null;
  const interpolatedAuthoritativeX = source
    ? source.x
    : interpolate(input.previousPosition.x, input.authoritativePosition.x, input.interpolationAlpha);
  const interpolatedAuthoritativeY = source
    ? source.y
    : interpolate(input.previousPosition.y, input.authoritativePosition.y, input.interpolationAlpha);
  const interpolatedAuthoritativeZ = source
    ? source.z
    : interpolate(input.previousPosition.z, input.authoritativePosition.z, input.interpolationAlpha);
  const heightSource = resolveHeightSource(input);
  const originalTerrainY = input.originalTerrainHeight(
    interpolatedAuthoritativeX,
    interpolatedAuthoritativeZ,
  );
  const modifiedTerrainY = input.modifiedTerrainHeight(
    interpolatedAuthoritativeX,
    interpolatedAuthoritativeZ,
  );
  const sourceTerrainY = heightSource === 'original' ? originalTerrainY : modifiedTerrainY;
  const visualAirborne = !input.dead && interpolatedAuthoritativeY > sourceTerrainY + 0.4;
  const terrainAnchored =
    input.onGround &&
    !input.jumping &&
    !input.hasHoverVisual &&
    !input.swimming &&
    !visualAirborne;
  const parentGroupY = input.plateauEnabled
    ? terrainAnchoredEntityY(
        interpolatedAuthoritativeY,
        originalTerrainY,
        modifiedTerrainY,
        terrainAnchored,
        heightSource,
      )
    : interpolatedAuthoritativeY;

  input.group.position.set(interpolatedAuthoritativeX, parentGroupY, interpolatedAuthoritativeZ);
  return {
    heightSource,
    interpolatedAuthoritativeX,
    interpolatedAuthoritativeY,
    interpolatedAuthoritativeZ,
    modifiedTerrainY,
    originalTerrainY,
    parentGroupY,
    plateauDelta: modifiedTerrainY - originalTerrainY,
    terrainAnchored,
    visualAirborne,
  };
}
