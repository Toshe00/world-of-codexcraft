import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMock = vi.hoisted(() => ({ connect: vi.fn() }));
vi.hoisted(() => {
  process.env.DATABASE_URL = 'postgres://fixture/fixture';
});
vi.mock('pg', () => ({
  Pool: function Pool() {
    return { query: vi.fn(), connect: dbMock.connect };
  },
}));

import { saveCharacterState } from '../server/db';
import { ZONES, zoneAt } from '../src/sim/data';
import {
  loadHistoricalSaveFixtures,
  normalizeHistoricalSaveFixture,
} from './helpers/historical_save_fixture';

const fixtures = loadHistoricalSaveFixtures();

describe('artificial historical character save fixtures', () => {
  beforeEach(() => dbMock.connect.mockReset());

  it('covers every required historical scenario with synthetic data', () => {
    expect(fixtures.map((fixture) => fixture.scenario)).toEqual([
      'new-character-simple',
      'advanced-inventory-and-quests',
      'bank-and-professions',
      'talents-equipment-and-skins',
      'position-near-zone-boundary',
      'position-potentially-invalid-on-future-map',
      'legacy-missing-optional-fields',
    ]);
    expect(fixtures.every((fixture) => fixture.synthetic)).toBe(true);
  });

  it('places the boundary fixture on opposite sides of a current zone transition', () => {
    const fixture = fixtures.find((entry) => entry.scenario === 'position-near-zone-boundary');
    if (!fixture) throw new Error('missing boundary fixture');
    const z = fixture.character.state.pos.z;
    expect(zoneAt(z)).not.toBe(zoneAt(z + 0.002));
  });

  for (const fixture of fixtures) {
    it(`loads, normalizes, and rewrites ${fixture.scenario}`, () => {
      const inputSnapshot = JSON.parse(JSON.stringify(fixture));
      const normalized = normalizeHistoricalSaveFixture(fixture);
      const rewritten = JSON.parse(JSON.stringify(normalized));

      expect(fixture).toEqual(inputSnapshot);
      expect(rewritten.character.id).toBe(fixture.character.id);
      expect(rewritten.character.accountId).toBe(fixture.character.accountId);
      expect(rewritten.character.name).toBe(fixture.character.name);
      expect(rewritten.character.class).toBe(fixture.character.class);
      expect(rewritten.character.realm).toBe(fixture.character.realm);
      expect(ZONES.indexOf(zoneAt(rewritten.character.state.pos.z))).toBe(
        fixture.expectedZoneIndex,
      );

      for (const field of fixture.protectedStateFields) {
        expect(rewritten.character.state[field], field).toEqual(fixture.character.state[field]);
      }

      expect(normalizeHistoricalSaveFixture(normalized)).toEqual(normalized);
    });
  }

  it('keeps economic, inventory, quest, talent, profession, and skin fields populated', () => {
    const rich = fixtures.map(normalizeHistoricalSaveFixture);
    expect(
      rich.find((entry) => entry.scenario === 'advanced-inventory-and-quests')?.character.state,
    ).toMatchObject({
      copper: 9876,
      inventory: expect.arrayContaining([{ itemId: 'wolf_fang', count: 5 }]),
      questLog: expect.arrayContaining([{ questId: 'q_wolves', counts: [5], state: 'active' }]),
    });
    expect(
      rich.find((entry) => entry.scenario === 'bank-and-professions')?.character.state,
    ).toMatchObject({
      copper: 54321,
      bank: { purchasedSlots: 12, bonusSlots: 2 },
      professions: { mining: 42, logging: 17, herbalism: 9 },
      gatheringProficiency: { mining: 42, logging: 17, herbalism: 9 },
      craftSkills: { weaponcrafting: 35, engineering: 21 },
      knownRecipes: ['recipe_minor_healing_potion', 'recipe_tanned_leather_jerkin'],
    });
    expect(
      rich.find((entry) => entry.scenario === 'talents-equipment-and-skins')?.character.state,
    ).toMatchObject({
      equipment: { mainhand: 'redbrook_blade', helmet: 'cryptbone_helm' },
      talents: { spec: 'arms', ranks: { war_cruelty: 2, arms_imp_overpower: 2 } },
      skin: 3,
    });
  });

  it('serializes a normalized fixture through the mocked PostgreSQL JSONB write path', async () => {
    const fixture = fixtures.find((entry) => entry.scenario === 'legacy-missing-optional-fields');
    if (!fixture) throw new Error('missing legacy fixture');
    const normalized = normalizeHistoricalSaveFixture(fixture);
    const query = vi.fn(async (_sql: string, _values?: unknown[]) => ({
      rows: [],
      rowCount: 1,
    }));
    const release = vi.fn();
    dbMock.connect.mockResolvedValueOnce({ query, release });

    await saveCharacterState(
      normalized.character.id,
      normalized.character.state.level,
      normalized.character.state,
    );

    const update = query.mock.calls.find((call) => /UPDATE characters/.test(String(call[0])));
    expect(update).toBeDefined();
    expect(update?.[1]?.[0]).toBe(normalized.character.id);
    expect(JSON.parse(String(update?.[1]?.[2]))).toEqual(normalized.character.state);
    expect(release).toHaveBeenCalledOnce();
  });
});
