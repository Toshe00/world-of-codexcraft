export interface LaboratoryNatureAssetConfig {
  assetPath: string;
  label: string;
  loadPath: string;
  angleOffset: number;
  groundOffsetY?: number;
  radius: number;
  scale: number;
  rotationY: number;
  shadows: boolean;
}

export interface LaboratoryNaturePaletteEnvironment {
  DEV: boolean;
  VITE_ASSET_REPLACEMENT_LAB?: string;
}

export interface LaboratoryNaturePlayerPose {
  readonly position: {
    readonly x: number;
    readonly z: number;
  };
  readonly facing: number;
}

export interface LaboratoryNaturePlacement {
  assetPath: string;
  label: string;
  loadPath: string;
  x: number;
  y: number;
  z: number;
  scale: number;
  rotationY: number;
  shadows: boolean;
}

const LABORATORY_ASSET_ROOT = 'models/environment/laboratory';

export const LABORATORY_NATURE_PALETTE_CONFIG: readonly LaboratoryNatureAssetConfig[] =
  Object.freeze([
    {
      assetPath: `${LABORATORY_ASSET_ROOT}/birch_tree_1.glb`,
      label: 'BirchTree_1',
      loadPath: 'models/foliage/pine_3.glb',
      angleOffset: -Math.PI * (5 / 12),
      radius: 8.5,
      scale: 1,
      rotationY: Math.PI / 8,
      shadows: true,
    },
    {
      assetPath: `${LABORATORY_ASSET_ROOT}/nature_palette_01/birch_tree_2.glb`,
      label: 'BirchTree_2',
      loadPath: `${LABORATORY_ASSET_ROOT}/nature_palette_01/birch_tree_2.glb`,
      angleOffset: -Math.PI / 4,
      radius: 8.5,
      scale: 0.8,
      rotationY: -Math.PI / 10,
      shadows: true,
    },
    {
      assetPath: `${LABORATORY_ASSET_ROOT}/nature_palette_01/bush_flowers.glb`,
      label: 'Bush_Flowers',
      loadPath: `${LABORATORY_ASSET_ROOT}/nature_palette_01/bush_flowers.glb`,
      angleOffset: -Math.PI / 12,
      groundOffsetY: -0.08,
      radius: 8.5,
      scale: 1,
      rotationY: Math.PI / 7,
      shadows: true,
    },
    {
      assetPath: `${LABORATORY_ASSET_ROOT}/nature_palette_01/flower_1_clump.glb`,
      label: 'Flower_1_Clump',
      loadPath: `${LABORATORY_ASSET_ROOT}/nature_palette_01/flower_1_clump.glb`,
      angleOffset: Math.PI / 12,
      radius: 8.5,
      scale: 1.25,
      rotationY: -Math.PI / 9,
      shadows: true,
    },
    {
      assetPath: `${LABORATORY_ASSET_ROOT}/nature_palette_01/grass_large.glb`,
      label: 'Grass_Large',
      loadPath: `${LABORATORY_ASSET_ROOT}/nature_palette_01/grass_large.glb`,
      angleOffset: Math.PI / 4,
      radius: 8.5,
      scale: 1.4,
      rotationY: Math.PI / 6,
      shadows: true,
    },
    {
      assetPath: `${LABORATORY_ASSET_ROOT}/nature_palette_01/dead_tree_2.glb`,
      label: 'DeadTree_2',
      loadPath: `${LABORATORY_ASSET_ROOT}/nature_palette_01/dead_tree_2.glb`,
      angleOffset: Math.PI * (5 / 12),
      radius: 8.5,
      scale: 0.9,
      rotationY: -Math.PI / 8,
      shadows: true,
    },
  ] satisfies LaboratoryNatureAssetConfig[]);

export function laboratoryNaturePaletteEnabled(
  environment: LaboratoryNaturePaletteEnvironment,
): boolean {
  return environment.DEV && environment.VITE_ASSET_REPLACEMENT_LAB === '1';
}

export function validLaboratoryNaturePaletteConfig(
  config: readonly LaboratoryNatureAssetConfig[],
): boolean {
  if (config.length !== 6) return false;
  const labels = new Set<string>();
  const assetPaths = new Set<string>();
  const loadPaths = new Set<string>();
  for (const asset of config) {
    if (!asset.label || labels.has(asset.label)) return false;
    if (!asset.assetPath || assetPaths.has(asset.assetPath)) return false;
    if (
      !asset.loadPath ||
      loadPaths.has(asset.loadPath) ||
      !asset.assetPath.endsWith('.glb') ||
      !asset.loadPath.endsWith('.glb')
    ) {
      return false;
    }
    if (
      !Number.isFinite(asset.angleOffset) ||
      asset.angleOffset < -Math.PI / 2 ||
      asset.angleOffset > Math.PI / 2 ||
      !Number.isFinite(asset.radius) ||
      asset.radius < 7 ||
      (asset.groundOffsetY !== undefined && !Number.isFinite(asset.groundOffsetY)) ||
      !Number.isFinite(asset.scale) ||
      asset.scale <= 0 ||
      !Number.isFinite(asset.rotationY) ||
      typeof asset.shadows !== 'boolean'
    ) {
      return false;
    }
    labels.add(asset.label);
    assetPaths.add(asset.assetPath);
    loadPaths.add(asset.loadPath);
  }
  return true;
}

export function laboratoryNaturePlacements(
  player: LaboratoryNaturePlayerPose,
  sampleGround: (x: number, z: number) => number,
  config: readonly LaboratoryNatureAssetConfig[] = LABORATORY_NATURE_PALETTE_CONFIG,
): LaboratoryNaturePlacement[] {
  return config.map((asset) => {
    const angle = player.facing + asset.angleOffset;
    const x = player.position.x + Math.sin(angle) * asset.radius;
    const z = player.position.z + Math.cos(angle) * asset.radius;
    return {
      assetPath: asset.assetPath,
      label: asset.label,
      loadPath: asset.loadPath,
      x,
      y: sampleGround(x, z) + (asset.groundOffsetY ?? 0),
      z,
      scale: asset.scale,
      rotationY: asset.rotationY,
      shadows: asset.shadows,
    };
  });
}
