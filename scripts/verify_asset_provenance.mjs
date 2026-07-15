import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatAssetProvenanceReport, verifyAssetProvenance } from './lib/asset_provenance.mjs';

function parseArguments(argv) {
  const options = {
    repoRoot: fileURLToPath(new URL('..', import.meta.url)),
    registryPath: null,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--root') {
      const value = argv[index + 1];
      if (!value) throw new Error('--root requires a path');
      options.repoRoot = path.resolve(value);
      index += 1;
    } else if (argument === '--registry') {
      const value = argv[index + 1];
      if (!value) throw new Error('--registry requires a path');
      options.registryPath = path.resolve(value);
      index += 1;
    } else if (argument === '--json') {
      options.json = true;
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }
  options.registryPath ??= path.join(options.repoRoot, 'docs/assets/provenance.registry.json');
  return options;
}

try {
  const options = parseArguments(process.argv.slice(2));
  const registry = JSON.parse(readFileSync(options.registryPath, 'utf8'));
  const result = verifyAssetProvenance({ repoRoot: options.repoRoot, registry });
  console.log(options.json ? JSON.stringify(result, null, 2) : formatAssetProvenanceReport(result));
  if (!result.ok) process.exitCode = 1;
} catch (error) {
  console.error(
    `Asset provenance verification failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}
