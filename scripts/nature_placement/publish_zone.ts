import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseNaturePlacementProjectJson } from '../../src/render/nature_placement_lab/placement_project_json';
import {
  compileNaturePlacementZone,
  serializeNatureZonePackage,
} from '../../src/render/nature_placement_lab/placement_zone_publication';

interface PublishArguments {
  force: boolean;
  input: string;
  layerIds: string[] | null;
  name: string;
  output: string;
  zoneId: string;
}

function usage(): string {
  return [
    'Usage:',
    '  npx tsx scripts/nature_placement/publish_zone.ts --input <project.json> --zone-id <zone-id> --name <name> --output <zone.json> [--layers <id,id>] [--force]',
  ].join('\n');
}

function valueAfter(args: readonly string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
  return value;
}

function parseArguments(args: readonly string[]): PublishArguments {
  let input = '';
  let output = '';
  let zoneId = '';
  let name = '';
  let layerIds: string[] | null = null;
  let force = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--force') {
      force = true;
      continue;
    }
    if (arg === '--help') {
      console.log(usage());
      process.exit(0);
    }
    const value = valueAfter(args, index, arg);
    index++;
    if (arg === '--input') input = value;
    else if (arg === '--output') output = value;
    else if (arg === '--zone-id') zoneId = value;
    else if (arg === '--name') name = value;
    else if (arg === '--layers') {
      layerIds = value
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (!input || !output || !zoneId || !name) throw new Error(usage());
  return { force, input, layerIds, name, output, zoneId };
}

function rejectRemotePath(value: string, label: string): void {
  if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(value)) {
    throw new Error(`${label} must be a local filesystem path`);
  }
}

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2));
  rejectRemotePath(args.input, '--input');
  rejectRemotePath(args.output, '--output');
  const inputPath = resolve(args.input);
  const outputPath = resolve(args.output);
  if (inputPath === outputPath) throw new Error('input and output paths must be different');
  const source = await readFile(inputPath, 'utf8');
  const project = parseNaturePlacementProjectJson(source, {
    createProjectId: () => 'source-legacy-project',
    legacyName: 'Imported Placements',
  });
  const includedLayerIds = args.layerIds ?? project.layers.map((layer) => layer.layerId);
  const zonePackage = compileNaturePlacementZone(
    project,
    args.zoneId,
    args.name,
    includedLayerIds,
  );
  await mkdir(dirname(outputPath), { recursive: true });
  try {
    await writeFile(outputPath, serializeNatureZonePackage(zonePackage), {
      encoding: 'utf8',
      flag: args.force ? 'w' : 'wx',
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error(`output already exists, pass --force to replace it: ${outputPath}`);
    }
    throw error;
  }
  console.log(`Published ${zonePackage.zoneId} to ${outputPath}`);
  console.log(`Placements: ${zonePackage.statistics.placementCount}`);
  console.log(`Estimated triangles: ${zonePackage.statistics.estimatedTriangles}`);
  console.log(`Unique media bytes: ${zonePackage.statistics.uniqueMediaBytes}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
