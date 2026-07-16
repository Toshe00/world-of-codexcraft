import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateAssetReplacementRegistry } from '../src/assets/asset_replacement.mjs';
import { formatAssetProvenanceReport, verifyAssetProvenance } from './lib/asset_provenance.mjs';
import { replacementProvenanceDecisions } from './lib/asset_replacement_verifier.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const registryPath = path.join(repoRoot, 'config/asset-replacements.registry.json');
const schemaPath = path.join(repoRoot, 'config/asset-replacements.schema.json');
const provenancePath = path.join(repoRoot, 'docs/assets/provenance.registry.json');
const publicDir = path.join(repoRoot, 'public');

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function walkFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(absolutePath));
    else if (entry.isFile()) files.push(absolutePath);
  }
  return files;
}

function formatReport(result, provenanceOk) {
  const lines = [
    `Asset replacement verification: ${result.ok && provenanceOk ? 'PASS' : 'FAIL'}`,
    `Replacement rules: ${result.ruleCount}`,
    `Enabled replacements: ${result.activeCount}`,
    `Production-enabled replacements: ${result.productionActiveCount}`,
    `Laboratory rules: ${result.laboratoryCount}`,
  ];
  if (result.errors.length > 0) {
    lines.push(`Errors: ${result.errors.length}`);
    for (const error of result.errors) lines.push(`  [${error.code}] ${error.message}`);
  }
  return lines.join('\n');
}

let exitCode = 0;
try {
  if (!existsSync(registryPath) || !existsSync(schemaPath) || !existsSync(provenancePath)) {
    throw new Error('Required replacement, schema, or provenance registry file is missing.');
  }
  const registry = readJson(registryPath);
  const provenanceRegistry = readJson(provenancePath);
  const provenanceResult = verifyAssetProvenance({
    repoRoot,
    registry: provenanceRegistry,
  });
  const assetPaths = walkFiles(publicDir)
    .map((file) => path.relative(publicDir, file).split(path.sep).join('/'))
    .sort();
  const targetPaths = Array.isArray(registry.replacements)
    ? registry.replacements.map((rule) => rule.replacementPath)
    : [];
  const provenance = replacementProvenanceDecisions({
    targetPaths,
    provenanceRegistry,
  });
  const result = validateAssetReplacementRegistry({
    registry,
    assetPaths,
    provenanceByPath: provenance.decisions,
  });
  result.errors.push(...provenance.errors);
  result.ok = result.errors.length === 0;
  if (registry.$schema !== './asset-replacements.schema.json') {
    result.errors.push({
      code: 'invalid-schema-reference',
      message: 'Registry must reference ./asset-replacements.schema.json.',
    });
    result.ok = false;
  }
  console.log(formatReport(result, provenanceResult.ok));
  if (!provenanceResult.ok) {
    console.log(formatAssetProvenanceReport(provenanceResult));
  }
  exitCode = result.ok && provenanceResult.ok ? 0 : 1;
} catch (error) {
  console.error(`Asset replacement verification: FAIL\n${String(error)}`);
  exitCode = 1;
}

process.exitCode = exitCode;
