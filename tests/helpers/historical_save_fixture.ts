import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { CharacterState } from '../../src/sim/sim';
import { Sim } from '../../src/sim/sim';
import type { PlayerClass } from '../../src/sim/types';

export interface HistoricalSaveFixture {
  fixtureSchemaVersion: 1;
  synthetic: true;
  scenario: string;
  sourceFormatVersion: string | null;
  character: {
    id: number;
    accountId: number;
    name: string;
    class: PlayerClass;
    realm: string;
    state: CharacterState & Record<string, unknown>;
  };
  expectedZoneIndex: number;
  protectedStateFields: string[];
  preserveUnknownStateFields?: string[];
}

const FIXTURE_ROOT = fileURLToPath(new URL('../fixtures/historical_saves/', import.meta.url));
const FIXTURE_EXTENSION_PREFIX = 'fixture-extension:';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertStateFieldList(
  value: unknown,
  fieldName: string,
  state: Record<string, unknown>,
  fileName: string,
): asserts value is string[] {
  if (!Array.isArray(value)) throw new Error(`${fileName}: ${fieldName} must be an array`);
  const seen = new Set<string>();
  for (const field of value) {
    if (typeof field !== 'string' || field.length === 0) {
      throw new Error(`${fileName}: ${fieldName} entries must be non-empty strings`);
    }
    if (seen.has(field)) throw new Error(`${fileName}: ${fieldName} contains duplicate ${field}`);
    if (!Object.hasOwn(state, field)) {
      throw new Error(`${fileName}: ${fieldName} references missing state field ${field}`);
    }
    seen.add(field);
  }
}

function assertFixture(value: unknown, fileName: string): asserts value is HistoricalSaveFixture {
  if (!isRecord(value)) throw new Error(`${fileName}: fixture must be an object`);
  if (value.fixtureSchemaVersion !== 1) {
    throw new Error(`${fileName}: unsupported fixtureSchemaVersion`);
  }
  if (value.synthetic !== true) throw new Error(`${fileName}: fixture must be synthetic`);
  if (!isRecord(value.character)) throw new Error(`${fileName}: character row is missing`);
  if (
    !Number.isSafeInteger(value.character.id) ||
    !Number.isSafeInteger(value.character.accountId)
  ) {
    throw new Error(`${fileName}: artificial persistent ids must be safe integers`);
  }
  if (
    typeof value.character.name !== 'string' ||
    typeof value.character.class !== 'string' ||
    typeof value.character.realm !== 'string' ||
    !isRecord(value.character.state)
  ) {
    throw new Error(`${fileName}: character row fields are invalid`);
  }
  assertStateFieldList(
    value.protectedStateFields,
    'protectedStateFields',
    value.character.state,
    fileName,
  );
  if (value.preserveUnknownStateFields !== undefined) {
    assertStateFieldList(
      value.preserveUnknownStateFields,
      'preserveUnknownStateFields',
      value.character.state,
      fileName,
    );
    for (const field of value.preserveUnknownStateFields) {
      if (!field.startsWith(FIXTURE_EXTENSION_PREFIX)) {
        throw new Error(
          `${fileName}: preserved unknown field ${field} must use ${FIXTURE_EXTENSION_PREFIX}`,
        );
      }
      if (!value.protectedStateFields.includes(field)) {
        throw new Error(`${fileName}: preserved unknown field ${field} must also be protected`);
      }
    }
  }
}

export function loadHistoricalSaveFixtures(): HistoricalSaveFixture[] {
  return readdirSync(FIXTURE_ROOT)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => {
      const value: unknown = JSON.parse(readFileSync(`${FIXTURE_ROOT}/${name}`, 'utf8'));
      assertFixture(value, name);
      return value;
    });
}

/**
 * Exercise the real CharacterState load and save path. Only extension fields named by
 * the fixture are copied around the closed CharacterState serializer. This is a read-only
 * compatibility harness, not a production migration or a general unknown-field merge.
 */
export function normalizeHistoricalSaveFixture(
  fixture: HistoricalSaveFixture,
): HistoricalSaveFixture {
  const originalState = fixture.character.state;
  const sim = new Sim({ seed: 20061, playerClass: fixture.character.class, noPlayer: true });
  const pid = sim.addPlayer(fixture.character.class, fixture.character.name, {
    characterId: fixture.character.id,
    state: originalState,
  });
  const serialized = sim.serializeCharacter(pid);
  if (!serialized) throw new Error(`failed to serialize fixture ${fixture.scenario}`);

  for (const field of fixture.preserveUnknownStateFields ?? []) {
    if (Object.hasOwn(serialized, field)) {
      throw new Error(
        `${fixture.scenario}: preserveUnknownStateFields contains canonical field ${field}`,
      );
    }
  }

  const preserved = Object.fromEntries(
    (fixture.preserveUnknownStateFields ?? []).map((field) => [field, originalState[field]]),
  );
  const rewritten: HistoricalSaveFixture = {
    ...fixture,
    character: {
      ...fixture.character,
      state: { ...serialized, ...preserved },
    },
  };
  return JSON.parse(JSON.stringify(rewritten)) as HistoricalSaveFixture;
}
