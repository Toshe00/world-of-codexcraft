import { describe, expect, it, vi } from 'vitest';
import {
  NATURE_PLACEMENT_LIMITS,
  type NaturePlacement,
} from '../src/render/nature_placement_lab/placement_core';
import { serializeNaturePlacements } from '../src/render/nature_placement_lab/placement_json';
import {
  createNaturePlacementProject,
  DEFAULT_NATURE_PLACEMENT_LAYERS,
  NATURE_PLACEMENT_PROJECT_LIMITS,
  type NaturePlacementProject,
} from '../src/render/nature_placement_lab/placement_project_core';
import {
  parseNaturePlacementProjectJson,
  serializeNaturePlacementProject,
  validateNaturePlacementProject,
} from '../src/render/nature_placement_lab/placement_project_json';
import {
  NATURE_PLACEMENT_PROJECTS_KEY,
  NaturePlacementProjectStore,
} from '../src/render/nature_placement_lab/placement_project_storage';

const NOW = () => new Date('2026-07-16T12:00:00.000Z');

function legacyPlacement(overrides: Partial<NaturePlacement> = {}): NaturePlacement {
  return {
    id: 'lab-placement-001',
    assetId: 'BirchTree_1',
    position: { x: 1.25, y: 2.5, z: -3.75 },
    rotationY: Math.PI / 3,
    scale: 1.2,
    groundOffsetY: -0.1,
    ...overrides,
  };
}

function project(id = 'project-one'): NaturePlacementProject {
  return createNaturePlacementProject(id, 'Project One', NOW);
}

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
  };
}

describe('nature placement project storage', () => {
  it('creates, saves, loads, renames, deletes, and restores the active project', () => {
    const storage = memoryStorage();
    const store = new NaturePlacementProjectStore(storage);
    const first = project();
    const second = project('project-two');
    second.name = 'Project Two';

    expect(store.save(first)).toBe(true);
    expect(store.save(second)).toBe(true);
    expect(store.setActive(first.projectId)).toBe(true);
    expect(new NaturePlacementProjectStore(storage).loadActive()).toEqual(first);

    const renamed = store.rename(first.projectId, 'Renamed', '2026-07-16T13:00:00.000Z');
    expect(renamed?.name).toBe('Renamed');
    expect(store.get(first.projectId)?.modifiedAt).toBe('2026-07-16T13:00:00.000Z');
    expect(store.delete(first.projectId)).toBe(true);
    expect(store.get(first.projectId)).toBeNull();
    expect(store.activeProjectId).toBe(second.projectId);
    expect(NATURE_PLACEMENT_PROJECTS_KEY.startsWith('woc_')).toBe(false);
    expect(storage.values.has(NATURE_PLACEMENT_PROJECTS_KEY)).toBe(true);
  });

  it('enforces the project limit and rejects duplicate ids in stored data', () => {
    const storage = memoryStorage();
    const store = new NaturePlacementProjectStore(storage);
    for (let index = 0; index < NATURE_PLACEMENT_PROJECT_LIMITS.maxProjects; index++) {
      expect(store.save(project(`project-${index}`))).toBe(true);
    }
    expect(store.save(project('project-over-limit'))).toBe(false);

    const duplicate = project('project-duplicate');
    storage.values.set(
      NATURE_PLACEMENT_PROJECTS_KEY,
      JSON.stringify({
        version: 1,
        activeProjectId: duplicate.projectId,
        projects: [duplicate, duplicate],
      }),
    );
    expect(new NaturePlacementProjectStore(storage).list()).toEqual([]);
  });

  it('keeps its in-memory catalog unchanged when persistence fails', () => {
    const storage = memoryStorage();
    const store = new NaturePlacementProjectStore(storage);
    expect(store.save(project())).toBe(true);
    expect(store.save(project('project-two'))).toBe(true);
    expect(store.setActive('project-one')).toBe(true);
    storage.setItem.mockImplementation(() => {
      throw new Error('storage unavailable');
    });

    expect(store.setActive('project-two')).toBe(false);
    expect(store.activeProjectId).toBe('project-one');
    expect(store.delete('project-one')).toBe(false);
    expect(store.get('project-one')).not.toBeNull();
  });
});

describe('nature placement project JSON', () => {
  it('migrates phase 4D and 4E placement JSON without changing transforms', () => {
    const legacy = [
      legacyPlacement(),
      legacyPlacement({ id: 'lab-placement-002', assetId: 'DeadTree_2' }),
    ];
    const migrated = parseNaturePlacementProjectJson(serializeNaturePlacements(legacy), {
      createProjectId: () => 'project-migrated',
      legacyName: 'Migrated',
      now: NOW,
    });

    expect(migrated).toMatchObject({
      version: 2,
      projectId: 'project-migrated',
      name: 'Migrated',
      layers: DEFAULT_NATURE_PLACEMENT_LAYERS,
      groups: [],
    });
    expect(migrated.placements).toEqual([
      { ...legacy[0], layerId: 'layer-trees' },
      { ...legacy[1], layerId: 'layer-dead-nature' },
    ]);
  });

  it('exports deterministically with sorted placements, layers, groups, and references', () => {
    const value = project();
    value.placements = [
      { ...legacyPlacement({ id: 'lab-placement-002' }), layerId: 'layer-trees' },
      { ...legacyPlacement(), layerId: 'layer-trees' },
    ];
    value.groups = [
      {
        groupId: 'group-one',
        name: 'Group',
        placementIds: ['lab-placement-002', 'lab-placement-001'],
      },
    ];
    value.layers.reverse();
    const first = serializeNaturePlacementProject(value);
    const second = serializeNaturePlacementProject(JSON.parse(first));
    expect(second).toBe(first);
    expect(first.indexOf('lab-placement-001')).toBeLessThan(first.indexOf('lab-placement-002'));
    expect(first).not.toContain('selectedPlacementIds');
    expect(first).not.toContain('history');
  });

  it('rejects unknown layers, invalid group references, duplicate ownership, dangerous keys, versions, and duplicate project ids', () => {
    const base = project();
    base.placements = [{ ...legacyPlacement(), layerId: 'missing-layer' }];
    expect(() => validateNaturePlacementProject(base)).toThrow(/unknown layerId/);

    const duplicatePlacements = project();
    duplicatePlacements.placements = [
      { ...legacyPlacement(), layerId: 'layer-trees' },
      { ...legacyPlacement(), layerId: 'layer-trees' },
    ];
    expect(() => validateNaturePlacementProject(duplicatePlacements)).toThrow(
      /duplicate placement id/,
    );

    const duplicateLayers = project();
    duplicateLayers.layers.push({ ...duplicateLayers.layers[0] });
    expect(() => validateNaturePlacementProject(duplicateLayers)).toThrow(/duplicate layerId/);

    const hiddenLocked = project();
    hiddenLocked.layers[0] = { ...hiddenLocked.layers[0], visible: false, locked: true };
    expect(() => validateNaturePlacementProject(hiddenLocked)).toThrow(/locked and hidden/);

    const grouped = project();
    grouped.placements = [{ ...legacyPlacement(), layerId: 'layer-trees' }];
    grouped.groups = [{ groupId: 'group-one', name: 'One', placementIds: ['lab-placement-999'] }];
    expect(() => validateNaturePlacementProject(grouped)).toThrow(/missing placement/);
    grouped.groups = [
      { groupId: 'group-one', name: 'One', placementIds: ['lab-placement-001'] },
      { groupId: 'group-two', name: 'Two', placementIds: ['lab-placement-001'] },
    ];
    expect(() => validateNaturePlacementProject(grouped)).toThrow(/multiple groups/);
    grouped.groups = [
      { groupId: 'group-one', name: 'One', placementIds: [] },
      { groupId: 'group-one', name: 'Two', placementIds: [] },
    ];
    expect(() => validateNaturePlacementProject(grouped)).toThrow(/duplicate groupId/);
    expect(() => validateNaturePlacementProject(project(), new Set(['project-one']))).toThrow(
      /duplicate projectId/,
    );
    expect(() =>
      parseNaturePlacementProjectJson('{"version":2,"__proto__":{},"projectId":"x"}', {
        createProjectId: () => 'project-x',
        legacyName: 'Imported',
      }),
    ).toThrow(/dangerous/);
    expect(() =>
      parseNaturePlacementProjectJson('{"version":99}', {
        createProjectId: () => 'project-x',
        legacyName: 'Imported',
      }),
    ).toThrow(/unsupported/);
  });

  it('enforces placement, layer, and group limits and finite values', () => {
    const value = project();
    value.layers = Array.from(
      { length: NATURE_PLACEMENT_PROJECT_LIMITS.maxLayers + 1 },
      (_, index) => ({
        layerId: `layer-${index}`,
        name: `Layer ${index}`,
        visible: true,
        locked: false,
      }),
    );
    expect(() => validateNaturePlacementProject(value)).toThrow(/layer count/);

    value.layers = DEFAULT_NATURE_PLACEMENT_LAYERS.map((layer) => ({ ...layer }));
    value.groups = Array.from(
      { length: NATURE_PLACEMENT_PROJECT_LIMITS.maxGroups + 1 },
      (_, index) => ({ groupId: `group-${index}`, name: `Group ${index}`, placementIds: [] }),
    );
    expect(() => validateNaturePlacementProject(value)).toThrow(/group count/);

    value.groups = [];
    value.placements = Array.from(
      { length: NATURE_PLACEMENT_LIMITS.maxPlacements + 1 },
      (_, index) => ({
        ...legacyPlacement({ id: `lab-placement-${index}` }),
        layerId: 'layer-trees',
      }),
    );
    expect(() => validateNaturePlacementProject(value)).toThrow(/placement count/);
    value.placements = [{ ...legacyPlacement(), layerId: 'layer-trees', scale: Number.NaN }];
    expect(() => validateNaturePlacementProject(value)).toThrow(/finite/);
  });
});
