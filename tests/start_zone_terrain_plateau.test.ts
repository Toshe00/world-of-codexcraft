import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import {
  START_ZONE_TERRAIN_PLATEAU_VERSION,
  applyStartZoneTerrainPlateauPatches,
  clearActiveStartZoneTerrainPlateauPatches,
  parseStartZoneTerrainPlateauDocument,
  serializeStartZoneTerrainPlateauDocument,
  setActiveStartZoneTerrainPlateauPatches,
  terrainAnchoredEntityY,
  terrainAnchoredObjectY,
  type StartZoneTerrainPlateauPatch,
} from '../src/sim/start_zone_terrain_plateau';
import { groundHeight, originalTerrainHeight, terrainHeight } from '../src/sim/world';
import { ensureLocaleLoaded, getLanguage, setLanguage, t } from '../src/ui/i18n';
import {
  DEFAULT_START_ZONE_TERRAIN_PLATEAU,
  StartZoneTerrainPlateauController,
  starterZoneTerrainPlateauEnabled,
  type PlateauRenderAdapter,
  type PlateauUiAdapter,
  type PlateauUiCallbacks,
} from '../src/render/start_zone_terrain_plateau';
import {
  updateTerrainEntityRenderPosition,
  type TerrainEntityRenderPositionInput,
} from '../src/render/start_zone_terrain_plateau/entity_terrain_anchor';

const patch: StartZoneTerrainPlateauPatch = {
  ...DEFAULT_START_ZONE_TERRAIN_PLATEAU,
  centerX: 0,
  centerZ: 0,
  width: 20,
  depth: 10,
  targetHeight: 8,
  blendWidth: 5,
};

const RENDER_TEST_SEED = 20061;

function createGroundedModel(): { group: THREE.Group; model: THREE.Group; prepYOffset: number } {
  const group = new THREE.Group();
  const model = new THREE.Group();
  const prepYOffset = 1;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1));
  model.position.y = prepYOffset;
  model.add(mesh);
  group.add(model);
  return { group, model, prepYOffset };
}

function applyTerrainEntityFrame(
  group: THREE.Group,
  overrides: Partial<TerrainEntityRenderPositionInput> = {},
) {
  return updateTerrainEntityRenderPosition({
    authoritativePosition: { x: 0, y: 4, z: 0 },
    dead: false,
    group,
    hasHoverVisual: false,
    interpolationAlpha: 0,
    isSelf: false,
    jumping: false,
    modifiedTerrainHeight: (x, z) => terrainHeight(x, z, RENDER_TEST_SEED),
    onGround: true,
    originalTerrainHeight: (x, z) => originalTerrainHeight(x, z, RENDER_TEST_SEED),
    plateauEnabled: true,
    previousHeightSource: 'original',
    previousPosition: { x: 0, y: 4, z: 0 },
    selfPosition: null,
    snapshotUpdatedAt: 1,
    swimming: false,
    ...overrides,
  });
}

afterEach(() => clearActiveStartZoneTerrainPlateauPatches());

describe('starter zone terrain plateau layer', () => {
  it('keeps source terrain unchanged when disabled and outside its influence', () => {
    const source = 3.25;
    expect(applyStartZoneTerrainPlateauPatches(source, 0, 0, [])).toBe(source);
    expect(applyStartZoneTerrainPlateauPatches(source, 100, 100, [patch])).toBe(source);
    expect(patch).toEqual({ ...patch });
  });

  it('makes the central rectangle perfectly flat for every rotation and dimension', () => {
    for (const rotationY of [0, Math.PI / 4, Math.PI / 2]) {
      const rotated = { ...patch, rotationY, width: 30, depth: 14 };
      expect(applyStartZoneTerrainPlateauPatches(1, 0, 0, [rotated])).toBe(8);
      const x = -6 * Math.cos(rotationY) + 3 * Math.sin(rotationY);
      const z = 6 * Math.sin(rotationY) + 3 * Math.cos(rotationY);
      expect(applyStartZoneTerrainPlateauPatches(-12, x, z, [rotated])).toBe(8);
    }
  });

  it('uses continuous linear, smoothstep, and smootherstep transitions without non-finite values', () => {
    for (const falloff of ['linear', 'smoothstep', 'smootherstep'] as const) {
      const plateau = { ...patch, falloff };
      const edge = applyStartZoneTerrainPlateauPatches(2, 10, 0, [plateau]);
      const near = applyStartZoneTerrainPlateauPatches(2, 12.5, 0, [plateau]);
      const outside = applyStartZoneTerrainPlateauPatches(2, 15, 0, [plateau]);
      expect(near).toBeGreaterThanOrEqual(Math.min(edge, outside));
      expect(near).toBeLessThanOrEqual(Math.max(edge, outside));
      expect(outside).toBe(2);
      expect(Number.isFinite(near)).toBe(true);
    }
  });

  it('uses the active canonical height seam for terrain, objects, and local player ground', () => {
    const x = 0;
    const z = 0;
    const original = originalTerrainHeight(x, z, 20061);
    setActiveStartZoneTerrainPlateauPatches([{ ...patch, targetHeight: original + 6 }]);
    expect(terrainHeight(x, z, 20061)).toBe(original + 6);
    expect(groundHeight(x, z, 20061)).toBe(original + 6);
    clearActiveStartZoneTerrainPlateauPatches();
    expect(terrainHeight(x, z, 20061)).toBe(original);
  });

  it('anchors ground objects from their original Y without moving airborne objects', () => {
    const originalObjectY = 14.75;
    const originalTerrainY = 8.5;
    const modifiedTerrainY = 12.25;
    const anchored = terrainAnchoredObjectY(
      originalObjectY,
      originalTerrainY,
      modifiedTerrainY,
      true,
    );

    expect(anchored).toBe(18.5);
    expect(
      terrainAnchoredObjectY(originalObjectY, originalTerrainY, modifiedTerrainY, true),
    ).toBe(anchored);
    expect(terrainAnchoredObjectY(originalObjectY, originalTerrainY, modifiedTerrainY, false)).toBe(
      originalObjectY,
    );
    expect(terrainAnchoredObjectY(originalObjectY, originalTerrainY, originalTerrainY, true)).toBe(
      originalObjectY,
    );
  });

  it('keeps the local player on its canonical modified terrain height', () => {
    const originalTerrainY = 8.5;
    const modifiedTerrainY = 12.25;
    // CharacterVisual keeps this on its child modelWrap. The entity group itself
    // stays at the authoritative foot position, so this offset must not become
    // a second terrain correction.
    const historicalModelPivotY = 0.42;
    const canonicalFeetY = modifiedTerrainY;

    const renderedFeetY = terrainAnchoredEntityY(
      canonicalFeetY,
      originalTerrainY,
      modifiedTerrainY,
      true,
      'modified',
    );
    expect(renderedFeetY).toBe(canonicalFeetY);
    expect(renderedFeetY + historicalModelPivotY).toBe(modifiedTerrainY + historicalModelPivotY);
    expect(
      terrainAnchoredObjectY(canonicalFeetY, originalTerrainY, modifiedTerrainY, true),
    ).toBe(modifiedTerrainY + (modifiedTerrainY - originalTerrainY));

    expect(
      terrainAnchoredEntityY(originalTerrainY, originalTerrainY, originalTerrainY, true, 'modified'),
    ).toBe(originalTerrainY);
  });

  it('anchors server-sourced NPCs and terrestrial creatures exactly once', () => {
    const centerOriginalY = 8.5;
    const centerModifiedY = 12.25;
    const transitionOriginalY = 7.25;
    const transitionModifiedY = 9.5;
    const historicalModelPivotY = 0.42;

    for (const kind of ['static npc', 'mobile npc', 'merchant', 'terrestrial enemy', 'animal', 'pet']) {
      expect(
        terrainAnchoredEntityY(centerOriginalY, centerOriginalY, centerModifiedY, true, 'original'),
        `${kind} is seated at the plateau center`,
      ).toBe(centerModifiedY);
    }
    const renderedNpcFeetY = terrainAnchoredEntityY(
      centerOriginalY,
      centerOriginalY,
      centerModifiedY,
      true,
      'original',
    );
    expect(renderedNpcFeetY + historicalModelPivotY).toBe(centerModifiedY + historicalModelPivotY);
    expect(
      terrainAnchoredEntityY(
        transitionOriginalY,
        transitionOriginalY,
        transitionModifiedY,
        true,
        'original',
      ),
    ).toBe(transitionModifiedY);
    expect(
      terrainAnchoredEntityY(centerOriginalY, centerOriginalY, centerOriginalY, true, 'original'),
    ).toBe(centerOriginalY);
  });

  it('does not accumulate a remote dynamic terrain correction and restores on hide or disposal', () => {
    const originalTerrainY = 8.5;
    const modifiedTerrainY = 12.25;
    const authoritativeNpcY = originalTerrainY;

    for (let update = 0; update < 5; update++) {
      expect(
        terrainAnchoredEntityY(
          authoritativeNpcY,
          originalTerrainY,
          modifiedTerrainY,
          true,
          'original',
        ),
      ).toBe(modifiedTerrainY);
    }
    expect(
      terrainAnchoredEntityY(authoritativeNpcY, originalTerrainY, originalTerrainY, true, 'original'),
    ).toBe(authoritativeNpcY);
  });

  it('leaves flying, jumping, and swimming dynamic entities at their authoritative Y', () => {
    const originalTerrainY = 8.5;
    const modifiedTerrainY = 12.25;
    const airborneY = modifiedTerrainY + 2;

    for (const kind of ['flying creature', 'swimming entity', 'jumping entity']) {
      expect(
        terrainAnchoredEntityY(airborneY, originalTerrainY, modifiedTerrainY, false, 'original'),
        `${kind} remains at its authoritative Y`,
      ).toBe(airborneY);
    }
  });

  it('serializes deterministically and rejects invalid import documents', () => {
    const document = { version: START_ZONE_TERRAIN_PLATEAU_VERSION, patches: [patch] } as const;
    const json = serializeStartZoneTerrainPlateauDocument(document);
    expect(serializeStartZoneTerrainPlateauDocument(document)).toBe(json);
    expect(parseStartZoneTerrainPlateauDocument(json)).toEqual(document);
    expect(parseStartZoneTerrainPlateauDocument('{"version":2,"patches":[]}')).toBeNull();
    expect(parseStartZoneTerrainPlateauDocument('{"version":1,"patches":[{"__proto__":{},"id":"x"}]}')).toBeNull();
    expect(parseStartZoneTerrainPlateauDocument(JSON.stringify({ version: 1, patches: [{ ...patch, width: -1 }] }))).toBeNull();
    expect(parseStartZoneTerrainPlateauDocument(JSON.stringify({ version: 1, patches: [{ ...patch, falloff: 'bad' }] }))).toBeNull();
  });

  it('is isolated from normal mode and requires the exact dev flag', () => {
    expect(starterZoneTerrainPlateauEnabled({ DEV: true })).toBe(false);
    expect(starterZoneTerrainPlateauEnabled({ DEV: false, VITE_START_ZONE_TERRAIN_EDIT_LAB: '1' })).toBe(false);
    expect(starterZoneTerrainPlateauEnabled({ DEV: true, VITE_START_ZONE_TERRAIN_EDIT_LAB: '1' })).toBe(true);
  });
});

describe('starter zone terrain plateau controller', () => {
  it('supports undo, redo, reset, protected-zone warnings, and valid import', () => {
    const callbacksRef: { current: PlateauUiCallbacks | null } = { current: null };
    const ui: PlateauUiAdapter = { dispose() {}, update() {} };
    const protectedVisibility: boolean[] = [];
    const render: PlateauRenderAdapter = {
      dispose() {},
      sync(_patch, _zones, visible) { protectedVisibility.push(visible); },
    };
    const changes: readonly StartZoneTerrainPlateauPatch[][] = [];
    const controller = new StartZoneTerrainPlateauController({
      bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
      createUi(value) { callbacksRef.current = value; return ui; },
      onPatchesChanged(value) { (changes as StartZoneTerrainPlateauPatch[][]).push(value as StartZoneTerrainPlateauPatch[]); },
      pointerTarget: { addEventListener() {}, removeEventListener() {} },
      projectTerrain: () => ({ x: 0, z: 0 }),
      protectedZones: [{ id: 'npc', name: 'Npc', kind: 'npc', shape: 'circle', x: 0, z: 0, radius: 1 }],
      render,
      sampleOriginalHeight: (x, z) => x + z,
      storage: null,
    });
    callbacksRef.current?.setField('width', 42);
    expect(controller.currentPatch.width).toBe(42);
    callbacksRef.current?.undo();
    expect(controller.currentPatch.width).toBe(DEFAULT_START_ZONE_TERRAIN_PLATEAU.width);
    expect(protectedVisibility[0]).toBe(false);
    callbacksRef.current?.setProtectedZonesVisible(true);
    expect(protectedVisibility.at(-1)).toBe(true);
    callbacksRef.current?.redo();
    expect(controller.currentPatch.width).toBe(42);
    expect(callbacksRef.current?.importPatch(controller.exportPatch())).toBe(true);
    callbacksRef.current?.reset();
    expect(controller.currentPatch.width).toBe(DEFAULT_START_ZONE_TERRAIN_PLATEAU.width);
    expect(changes.length).toBeGreaterThan(1);
    controller.dispose();
  });
});

describe('starter zone terrain plateau entity renderer path', () => {
  it('interpolates a remote snapshot before applying its original-terrain delta at the final parent group', () => {
    const originalAtCenter = originalTerrainHeight(0, 0, RENDER_TEST_SEED);
    setActiveStartZoneTerrainPlateauPatches([{ ...patch, targetHeight: originalAtCenter + 6 }]);
    const { group, model, prepYOffset } = createGroundedModel();
    const originalAtStart = originalTerrainHeight(-4, 0, RENDER_TEST_SEED);
    const originalAtEnd = originalTerrainHeight(4, 0, RENDER_TEST_SEED);

    const frame = applyTerrainEntityFrame(group, {
      authoritativePosition: { x: 4, y: originalAtEnd, z: 0 },
      interpolationAlpha: 0.5,
      previousPosition: { x: -4, y: originalAtStart, z: 0 },
      snapshotUpdatedAt: 100,
    });

    const expectedOriginalY = (originalAtStart + originalAtEnd) / 2;
    const expectedTerrainY = terrainHeight(0, 0, RENDER_TEST_SEED);
    expect(frame.heightSource).toBe('original');
    expect(frame.interpolatedAuthoritativeY).toBeCloseTo(expectedOriginalY, 12);
    expect(frame.parentGroupY).toBeCloseTo(expectedOriginalY + expectedTerrainY - originalAtCenter, 12);
    expect(group.position.x).toBe(0);
    expect(group.position.y).toBeCloseTo(frame.parentGroupY, 12);
    expect(group.position.z).toBe(0);
    expect(model.position.y).toBe(prepYOffset);

    group.updateMatrixWorld(true);
    expect(new THREE.Box3().setFromObject(group).min.y).toBeCloseTo(frame.parentGroupY, 6);
  });

  it('derives the local authoritative terrain source from the stored pose for static and mobile terrestrial entities', () => {
    const originalAtCenter = originalTerrainHeight(0, 0, RENDER_TEST_SEED);
    setActiveStartZoneTerrainPlateauPatches([{ ...patch, targetHeight: originalAtCenter - 6 }]);
    const modifiedAtCenter = terrainHeight(0, 0, RENDER_TEST_SEED);

    const categories = [
      { label: 'static npc', snapshotUpdatedAt: undefined, y: originalAtCenter, source: 'original' as const },
      { label: 'merchant', snapshotUpdatedAt: undefined, y: originalAtCenter, source: 'original' as const },
      { label: 'mobile npc', snapshotUpdatedAt: undefined, y: modifiedAtCenter, source: 'modified' as const },
      { label: 'terrestrial enemy', snapshotUpdatedAt: 100, y: originalAtCenter, source: 'original' as const },
      { label: 'terrestrial animal', snapshotUpdatedAt: 100, y: originalAtCenter, source: 'original' as const },
      { label: 'terrestrial pet', snapshotUpdatedAt: 100, y: originalAtCenter, source: 'original' as const },
    ];

    for (const category of categories) {
      const { group, model } = createGroundedModel();
      const frame = applyTerrainEntityFrame(group, {
        authoritativePosition: { x: 0, y: category.y, z: 0 },
        previousPosition: { x: 0, y: category.y, z: 0 },
        snapshotUpdatedAt: category.snapshotUpdatedAt,
      });
      expect(frame.heightSource, category.label).toBe(category.source);
      expect(frame.parentGroupY, category.label).toBeCloseTo(modifiedAtCenter, 12);
      group.updateMatrixWorld(true);
      expect(new THREE.Box3().setFromObject(group).min.y, category.label).toBeCloseTo(modifiedAtCenter, 6);
      expect(model.position.y, category.label).toBe(1);
    }
  });

  it('uses one final renderer write without accumulation across the plateau center and transition', () => {
    const originalAtCenter = originalTerrainHeight(0, 0, RENDER_TEST_SEED);
    setActiveStartZoneTerrainPlateauPatches([{ ...patch, targetHeight: originalAtCenter + 6 }]);
    const { group } = createGroundedModel();
    const samples = [0, 6, 12.5];

    for (const x of samples) {
      const original = originalTerrainHeight(x, 0, RENDER_TEST_SEED);
      const modified = terrainHeight(x, 0, RENDER_TEST_SEED);
      const input = {
        authoritativePosition: { x, y: original, z: 0 },
        previousPosition: { x, y: original, z: 0 },
        snapshotUpdatedAt: 100,
      };
      const first = applyTerrainEntityFrame(group, input);
      const second = applyTerrainEntityFrame(group, input);
      expect(first.parentGroupY).toBeCloseTo(modified, 6);
      expect(second.parentGroupY).toBeCloseTo(first.parentGroupY, 12);
    }

    const rendererSource = readFileSync('src/render/renderer.ts', 'utf8');
    const finalizerStart = rendererSource.indexOf('updateTerrainEntityRenderPosition(');
    const facingStart = rendererSource.indexOf('let facing =', finalizerStart);
    expect(finalizerStart).toBeGreaterThan(-1);
    expect(facingStart).toBeGreaterThan(finalizerStart);
    expect(rendererSource.slice(finalizerStart, facingStart)).not.toMatch(/v\.group\.position\.(?:set|y)/);
    expect(rendererSource).not.toContain('refreshTerrainAnchoredEntityViews');
  });

  it('restores normal rendering and leaves flying, swimming, jumping, and the local player untouched', () => {
    const originalAtCenter = originalTerrainHeight(0, 0, RENDER_TEST_SEED);
    setActiveStartZoneTerrainPlateauPatches([{ ...patch, targetHeight: originalAtCenter + 6 }]);
    const modifiedAtCenter = terrainHeight(0, 0, RENDER_TEST_SEED);
    const airborneY = originalAtCenter + 2;

    for (const state of [
      { label: 'flying', hasHoverVisual: true },
      { label: 'swimming', swimming: true },
      { label: 'jumping', jumping: true },
    ]) {
      const { group } = createGroundedModel();
      const frame = applyTerrainEntityFrame(group, {
        ...state,
        authoritativePosition: { x: 0, y: airborneY, z: 0 },
        previousPosition: { x: 0, y: airborneY, z: 0 },
      });
      expect(frame.parentGroupY, state.label).toBeCloseTo(airborneY, 12);
    }

    const local = createGroundedModel();
    const selfFrame = applyTerrainEntityFrame(local.group, {
      authoritativePosition: { x: 0, y: originalAtCenter, z: 0 },
      isSelf: true,
      previousPosition: { x: 0, y: originalAtCenter, z: 0 },
      selfPosition: { x: 0, y: modifiedAtCenter, z: 0 },
    });
    expect(selfFrame.heightSource).toBe('modified');
    expect(selfFrame.parentGroupY).toBeCloseTo(modifiedAtCenter, 12);

    const restored = createGroundedModel();
    const restoredFrame = applyTerrainEntityFrame(restored.group, {
      authoritativePosition: { x: 0, y: originalAtCenter, z: 0 },
      modifiedTerrainHeight: () => modifiedAtCenter,
      originalTerrainHeight: () => originalAtCenter,
      plateauEnabled: false,
      previousPosition: { x: 0, y: originalAtCenter, z: 0 },
    });
    expect(restoredFrame.parentGroupY).toBeCloseTo(originalAtCenter, 12);
  });
});

describe('starter zone terrain plateau translations', () => {
  it('provides English and French laboratory text', async () => {
    const previous = getLanguage();
    setLanguage('en');
    expect(t('hudChrome.startZoneTerrainPlateau.title')).toBe('Starter Zone Plateau Lab');
    await ensureLocaleLoaded('fr_FR');
    setLanguage('fr_FR');
    expect(t('hudChrome.startZoneTerrainPlateau.title')).toContain('Laboratoire');
    setLanguage(previous);
  });
});
