export interface LaboratoryBirchPreviewConfig {
  forwardDistance: number;
  lateralOffset: number;
  scale: number;
  rotationY: number;
  shadows: boolean;
}

export interface LaboratoryBirchPreviewEnvironment {
  DEV: boolean;
  VITE_ASSET_REPLACEMENT_LAB?: string;
}

export interface LaboratoryBirchPlayerPose {
  readonly position: {
    readonly x: number;
    readonly z: number;
  };
  readonly facing: number;
}

export interface LaboratoryBirchPlacement {
  x: number;
  y: number;
  z: number;
  scale: number;
  rotationY: number;
  shadows: boolean;
}

export const LABORATORY_BIRCH_PREVIEW_CONFIG: Readonly<LaboratoryBirchPreviewConfig> =
  Object.freeze({
    forwardDistance: 6.5,
    lateralOffset: 2,
    scale: 1,
    rotationY: Math.PI / 8,
    shadows: true,
  });

export function laboratoryBirchPreviewEnabled(
  environment: LaboratoryBirchPreviewEnvironment,
): boolean {
  return environment.DEV && environment.VITE_ASSET_REPLACEMENT_LAB === '1';
}

export function validLaboratoryBirchPreviewConfig(
  config: Readonly<LaboratoryBirchPreviewConfig>,
): boolean {
  return (
    Number.isFinite(config.forwardDistance) &&
    config.forwardDistance >= 5 &&
    config.forwardDistance <= 8 &&
    Number.isFinite(config.lateralOffset) &&
    config.lateralOffset !== 0 &&
    Number.isFinite(config.scale) &&
    config.scale > 0 &&
    Number.isFinite(config.rotationY) &&
    typeof config.shadows === 'boolean'
  );
}

export function laboratoryBirchPlacement(
  player: LaboratoryBirchPlayerPose,
  sampleGround: (x: number, z: number) => number,
  config: Readonly<LaboratoryBirchPreviewConfig> = LABORATORY_BIRCH_PREVIEW_CONFIG,
): LaboratoryBirchPlacement {
  const sinFacing = Math.sin(player.facing);
  const cosFacing = Math.cos(player.facing);
  const x =
    player.position.x + sinFacing * config.forwardDistance + cosFacing * config.lateralOffset;
  const z =
    player.position.z + cosFacing * config.forwardDistance - sinFacing * config.lateralOffset;

  return {
    x,
    y: sampleGround(x, z),
    z,
    scale: config.scale,
    rotationY: config.rotationY,
    shadows: config.shadows,
  };
}
