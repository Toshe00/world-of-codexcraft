import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  createNaturePlacementLab,
  type NaturePlacementLabFactoryDependencies,
} from '../src/render/nature_placement_lab';
import { NaturePlacementController } from '../src/render/nature_placement_lab/placement_controller';
import { NaturePlacementRender } from '../src/render/nature_placement_lab/placement_render';
import { Renderer } from '../src/render/renderer';

const repoRoot = path.resolve(import.meta.dirname, '..');

class ListenerTarget extends EventTarget {
  added = 0;
  removed = 0;
  private readonly listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();

  override addEventListener(...args: Parameters<EventTarget['addEventListener']>): void {
    this.added++;
    const [type, listener] = args;
    if (listener) {
      const listeners = this.listeners.get(type) ?? new Set<EventListenerOrEventListenerObject>();
      listeners.add(listener);
      this.listeners.set(type, listeners);
    }
    super.addEventListener(...args);
  }

  override removeEventListener(...args: Parameters<EventTarget['removeEventListener']>): void {
    const [type, listener] = args;
    if (listener && this.listeners.get(type)?.delete(listener)) this.removed++;
    super.removeEventListener(...args);
  }

  fire(type: string, event: Event): void {
    for (const listener of this.listeners.get(type) ?? []) {
      if (typeof listener === 'function') listener.call(this, event);
      else listener.handleEvent(event);
    }
  }
}

function labEvent(type: string, values: Record<string, unknown> = {}): Event {
  const event = new Event(type, { cancelable: true });
  for (const [key, value] of Object.entries(values)) {
    Object.defineProperty(event, key, { configurable: true, value });
  }
  return event;
}

describe('nature placement laboratory factory', () => {
  it('constructs no editor, UI, listener, or renderer when disabled or in production', () => {
    const createController = vi.fn();
    const dependencies = { createController } as unknown as NaturePlacementLabFactoryDependencies;
    const options = {} as never;

    expect(createNaturePlacementLab(options, { DEV: true }, dependencies)).toBeNull();
    expect(
      createNaturePlacementLab(
        options,
        { DEV: false, VITE_NATURE_PLACEMENT_LAB: '1' },
        dependencies,
      ),
    ).toBeNull();
    expect(createController).not.toHaveBeenCalled();
  });
});

describe('nature placement laboratory controller', () => {
  it('binds placement and transform controls without capturing inactive or editable input', () => {
    const canvas = new ListenerTarget();
    const eventWindow = new ListenerTarget();
    const render = {
      clearGhost: vi.fn(),
      dispose: vi.fn(),
      pickPlacement: vi.fn(() => 'lab-placement-001'),
      sync: vi.fn(),
      syncGrid: vi.fn(),
      updateGhost: vi.fn(),
    };
    const controller = new NaturePlacementController({
      canvas: canvas as unknown as HTMLCanvasElement,
      eventWindow: eventWindow as unknown as Window,
      initialWorkCenter: { x: 0, y: 0, z: 0 },
      preferenceStorage: null,
      projectTerrain: () => ({ x: 3, y: 4, z: 5 }),
      render,
      sampleGroundY: () => 4,
      createUi: () => ({ dispose: vi.fn(), update: vi.fn() }),
    });
    controller.selectAsset('BirchTree_1');

    const inactiveWheel = labEvent('wheel', { deltaY: -1, shiftKey: false });
    canvas.fire('wheel', inactiveWheel);
    expect(inactiveWheel.defaultPrevented).toBe(false);
    expect(controller.state.activeTransform?.scale).toBe(1);

    controller.startPlacement();
    const initialRotation = controller.state.activeTransform?.rotationY ?? 0;
    const initialGroundOffset = controller.state.activeTransform?.groundOffsetY ?? 0;
    eventWindow.fire('mousemove', labEvent('mousemove', { clientX: 10, clientY: 20 }));
    canvas.fire('wheel', labEvent('wheel', { deltaY: -1, shiftKey: false }));
    eventWindow.fire('keydown', labEvent('keydown', { code: 'Equal', shiftKey: true }));
    eventWindow.fire('keydown', labEvent('keydown', { code: 'Minus', shiftKey: true }));
    eventWindow.fire('keydown', labEvent('keydown', { code: 'NumpadAdd', shiftKey: false }));
    eventWindow.fire('keydown', labEvent('keydown', { code: 'NumpadSubtract', shiftKey: false }));
    eventWindow.fire('keydown', labEvent('keydown', { code: 'PageUp', shiftKey: false }));
    eventWindow.fire('keydown', labEvent('keydown', { code: 'PageDown', shiftKey: true }));
    eventWindow.fire('keydown', labEvent('keydown', { code: 'KeyR', shiftKey: false }));
    expect(render.updateGhost).toHaveBeenCalled();
    expect(controller.state.activeTransform?.scale).toBe(1.1);
    expect(controller.state.activeTransform?.groundOffsetY).toBeCloseTo(initialGroundOffset + 0.04);
    expect(controller.state.activeTransform?.rotationY).toBeCloseTo(initialRotation + Math.PI / 12);

    eventWindow.fire(
      'keydown',
      labEvent('keydown', { code: 'Escape', target: { closest: () => ({}) } }),
    );
    expect(controller.state.placementActive).toBe(true);

    canvas.fire('mousedown', labEvent('mousedown', { button: 0, clientX: 10, clientY: 20 }));
    canvas.fire('contextmenu', labEvent('contextmenu'));
    expect(controller.state.placementActive).toBe(false);

    canvas.fire('mousedown', labEvent('mousedown', { button: 0, clientX: 10, clientY: 20 }));
    let editableSelector = '';
    const editableDelete = labEvent('keydown', {
      code: 'Delete',
      target: {
        closest: (selector: string) => {
          editableSelector = selector;
          return {};
        },
      },
    });
    eventWindow.fire('keydown', editableDelete);
    expect(editableSelector).toContain('[contenteditable]');
    expect(controller.state.placements).toHaveLength(1);

    eventWindow.fire('keydown', labEvent('keydown', { code: 'Delete' }));
    expect(controller.state.placements).toEqual([]);
    eventWindow.fire('keydown', labEvent('keydown', { code: 'KeyZ', ctrlKey: true, key: 'z' }));
    expect(controller.state.placements).toHaveLength(1);
    eventWindow.fire('keydown', labEvent('keydown', { code: 'KeyD', ctrlKey: true, key: 'd' }));
    expect(controller.state.placements).toHaveLength(2);
    eventWindow.fire('keydown', labEvent('keydown', { code: 'KeyZ', ctrlKey: true, key: 'z' }));
    expect(controller.state.placements).toHaveLength(1);
    eventWindow.fire('keydown', labEvent('keydown', { code: 'KeyY', ctrlKey: true, key: 'y' }));
    expect(controller.state.placements).toHaveLength(2);
    eventWindow.fire('keydown', labEvent('keydown', { code: 'KeyZ', ctrlKey: true, key: 'z' }));
    eventWindow.fire(
      'keydown',
      labEvent('keydown', { code: 'KeyZ', ctrlKey: true, key: 'z', shiftKey: true }),
    );
    expect(controller.state.placements).toHaveLength(2);
    controller.dispose();
  });

  it('does not place on a left click without a strict terrain hit', () => {
    const controller = new NaturePlacementController({
      canvas: new ListenerTarget() as unknown as HTMLCanvasElement,
      eventWindow: new ListenerTarget() as unknown as Window,
      initialWorkCenter: { x: 0, y: 0, z: 0 },
      preferenceStorage: null,
      projectTerrain: () => null,
      render: {
        clearGhost: vi.fn(),
        dispose: vi.fn(),
        pickPlacement: vi.fn(() => null),
        sync: vi.fn(),
        syncGrid: vi.fn(),
        updateGhost: vi.fn(),
      },
      sampleGroundY: () => 0,
      createUi: () => ({ dispose: vi.fn(), update: vi.fn() }),
    });
    controller.selectAsset('Grass_Large');
    controller.startPlacement();

    expect(controller.primaryDown(10, 20)).toBe(true);
    expect(controller.state.placements).toEqual([]);
    controller.dispose();
  });

  it('selects and drags a placed object through valid terrain projections', () => {
    const canvas = new ListenerTarget();
    const eventWindow = new ListenerTarget();
    const render = {
      clearGhost: vi.fn(),
      dispose: vi.fn(),
      pickPlacement: vi.fn(() => 'lab-placement-001'),
      sync: vi.fn(),
      syncGrid: vi.fn(),
      updateGhost: vi.fn(),
    };
    const ui = { dispose: vi.fn(), update: vi.fn() };
    const controller = new NaturePlacementController({
      canvas: canvas as unknown as HTMLCanvasElement,
      eventWindow: eventWindow as unknown as Window,
      initialWorkCenter: { x: 0, y: 0, z: 0 },
      preferenceStorage: null,
      projectTerrain: vi
        .fn()
        .mockReturnValueOnce({ x: 1, y: 2, z: 3 })
        .mockReturnValueOnce({ x: 2, y: 3, z: 4 })
        .mockReturnValue({ x: 8, y: 4, z: 9 }),
      render,
      sampleGroundY: () => 0,
      createUi: () => ui,
    });
    controller.selectAsset('BirchTree_1');
    controller.startPlacement();
    controller.pointerMove(10, 20);
    controller.primaryDown(10, 20);
    controller.cancelPlacement();
    expect(controller.state.placements[0].position).toEqual({ x: 2, y: 3, z: 4 });

    controller.primaryDown(10, 20);
    controller.pointerMove(30, 40);
    controller.pointerUp();

    expect(controller.state.selectedPlacement?.id).toBe('lab-placement-001');
    expect(controller.state.selectedPlacement?.position).toEqual({ x: 8, y: 4, z: 9 });
  });

  it('cleans up every owned listener, UI, ghost, render object, and reference', () => {
    const canvas = new ListenerTarget();
    const eventWindow = new ListenerTarget();
    const render = {
      clearGhost: vi.fn(),
      dispose: vi.fn(),
      pickPlacement: vi.fn(() => null),
      sync: vi.fn(),
      syncGrid: vi.fn(),
      updateGhost: vi.fn(),
    };
    const ui = { dispose: vi.fn(), update: vi.fn() };
    const controller = new NaturePlacementController({
      canvas: canvas as unknown as HTMLCanvasElement,
      eventWindow: eventWindow as unknown as Window,
      initialWorkCenter: { x: 0, y: 0, z: 0 },
      preferenceStorage: null,
      projectTerrain: () => null,
      render,
      sampleGroundY: () => 0,
      createUi: () => ui,
    });

    controller.dispose();
    controller.dispose();

    const pickCalls = render.pickPlacement.mock.calls.length;
    canvas.fire('mousedown', labEvent('mousedown', { button: 0, clientX: 10, clientY: 20 }));

    expect(canvas.added + eventWindow.added).toBeGreaterThan(0);
    expect(canvas.removed + eventWindow.removed).toBe(canvas.added + eventWindow.added);
    expect(render.clearGhost).toHaveBeenCalled();
    expect(render.dispose).toHaveBeenCalledOnce();
    expect(ui.dispose).toHaveBeenCalledOnce();
    expect(render.pickPlacement).toHaveBeenCalledTimes(pickCalls);
  });
});

describe('nature placement laboratory render ownership', () => {
  it('keeps the grid while updating a ghost and disposes it with the render layer', async () => {
    const scene = new THREE.Scene();
    const source = new THREE.Group();
    source.add(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial()));
    const render = new NaturePlacementRender(
      scene,
      vi.fn(async () => ({ scene: source })),
    );

    render.syncGrid(true, 1, { x: 0, y: 0, z: 0 });
    const grid = render.group.children.find((child) => child instanceof THREE.GridHelper) as
      | THREE.GridHelper
      | undefined;
    expect(grid).toBeDefined();
    if (!grid) throw new Error('Expected the development grid to be rendered');
    const geometryDispose = vi.spyOn(grid.geometry, 'dispose');
    const materialDispose = vi.spyOn(grid.material as THREE.Material, 'dispose');

    render.updateGhost(
      'BirchTree_1',
      { x: 4, y: 3, z: 2 },
      { assetId: 'BirchTree_1', rotationY: 0, scale: 1, groundOffsetY: 0 },
    );
    await render.settled();

    expect(render.group.children).toContain(grid);
    expect(geometryDispose).not.toHaveBeenCalled();
    expect(materialDispose).not.toHaveBeenCalled();

    render.dispose();
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
  });

  it('renders and cleans a translucent ghost without mutating cached GLB materials', async () => {
    const scene = new THREE.Scene();
    const sourceMaterial = new THREE.MeshStandardMaterial({ opacity: 1, transparent: false });
    const source = new THREE.Group();
    source.add(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), sourceMaterial));
    const render = new NaturePlacementRender(
      scene,
      vi.fn(async () => ({ scene: source })),
    );

    render.updateGhost(
      'BirchTree_1',
      { x: 4, y: 3, z: 2 },
      { assetId: 'BirchTree_1', rotationY: 0, scale: 1, groundOffsetY: 0 },
    );
    await render.settled();

    const ghost = render.group.children.find((child) => child.name.includes('ghost'));
    const ghostMesh = ghost?.getObjectByProperty('type', 'Mesh') as THREE.Mesh | undefined;
    const ghostMaterial = ghostMesh?.material as THREE.Material | undefined;
    expect(ghost).toBeDefined();
    expect(ghost?.position).toMatchObject({ x: 4, y: 3, z: 2 });
    expect(ghostMaterial).not.toBe(sourceMaterial);
    expect(ghostMaterial?.transparent).toBe(true);
    expect(ghostMaterial?.opacity).toBeLessThan(1);
    expect(sourceMaterial.transparent).toBe(false);
    expect(sourceMaterial.opacity).toBe(1);

    render.clearGhost();
    expect(render.group.children.some((child) => child.name.includes('ghost'))).toBe(false);
    render.dispose();
  });

  it('raycasts a real rendered placement without joining gameplay pick targets', async () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.set(0, 2, 5);
    camera.lookAt(0, 1, 0);
    camera.updateMatrixWorld(true);
    const canvas = {
      getBoundingClientRect: () => ({ height: 100, left: 0, top: 0, width: 100 }),
    } as HTMLCanvasElement;
    const source = new THREE.Group();
    source.add(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial()));
    const render = new NaturePlacementRender(
      scene,
      vi.fn(async () => ({ scene: source })),
      camera,
      canvas,
    );
    render.sync(
      [
        {
          id: 'lab-placement-001',
          assetId: 'BirchTree_1',
          position: { x: 0, y: 0, z: 0 },
          rotationY: 0,
          scale: 1,
          groundOffsetY: 0,
        },
      ],
      null,
    );
    await render.settled();

    expect(render.pickPlacement(50, 50)).toBe('lab-placement-001');
    expect(render.pickPlacement(0, 0)).toBeNull();
    render.dispose();
  });

  it('removes laboratory objects without disposing shared GLB geometry or materials', async () => {
    const scene = new THREE.Scene();
    const sourceMaterial = new THREE.MeshStandardMaterial();
    const sourceGeometry = new THREE.BoxGeometry(1, 2, 1);
    const source = new THREE.Group();
    source.add(new THREE.Mesh(sourceGeometry, sourceMaterial));
    const geometryDispose = vi.spyOn(sourceGeometry, 'dispose');
    const materialDispose = vi.spyOn(sourceMaterial, 'dispose');
    const render = new NaturePlacementRender(
      scene,
      vi.fn(async () => ({ scene: source })),
    );

    render.sync(
      [
        {
          id: 'lab-placement-001',
          assetId: 'BirchTree_1',
          position: { x: 1, y: 2, z: 3 },
          rotationY: 0,
          scale: 1,
          groundOffsetY: 0,
        },
      ],
      'lab-placement-001',
    );
    await render.settled();
    expect(scene.children).toHaveLength(1);

    render.sync([], null);
    expect(render.group.children).toHaveLength(0);

    render.dispose();

    expect(scene.children).toHaveLength(0);
    expect(geometryDispose).not.toHaveBeenCalled();
    expect(materialDispose).not.toHaveBeenCalled();
  });
});

describe('nature placement laboratory terrain projection', () => {
  it('returns an actual terrain hit and never falls back to a horizontal plane', () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.set(0, 10, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const terrain = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshBasicMaterial());
    terrain.rotation.x = -Math.PI / 2;
    terrain.position.y = 2;
    terrain.updateMatrixWorld(true);
    const renderer = Object.create(Renderer.prototype) as Renderer;
    Object.assign(renderer as object, {
      camera,
      raycaster: new THREE.Raycaster(),
      terrainView: { group: { children: [terrain] } },
      viewport: { height: 100, width: 100 },
    });

    expect(renderer.terrainSurfacePoint(50, 50)?.y).toBeCloseTo(2);
    expect(renderer.terrainSurfacePoint(0, 0)).toBeNull();
  });
});

describe('nature placement laboratory boundaries', () => {
  it('creates no gameplay, collision, placement persistence, or network surface', () => {
    const directory = path.join(repoRoot, 'src/render/nature_placement_lab');
    const files = readdirSync(directory).filter((file) => file.endsWith('.ts'));
    const sources = new Map(
      files.map((file) => [file, readFileSync(path.join(directory, file), 'utf8')]),
    );
    const source = [...sources.values()].join('\n');

    expect(source).not.toMatch(/from ['"][^'"]*(?:sim|net|server)[/']/);
    expect(source).not.toMatch(/\b(?:Collider|Hitbox|WebSocket|sessionStorage)\b/);
    expect(source).not.toMatch(/(?:\.send\s*\(|fetch\s*\()/);
    expect(source).not.toContain('clickTargets.push');
    expect(source).toContain("import { loadGltf } from '../assets/loader';");
    for (const [file, fileSource] of sources) {
      if (file === 'index.ts') continue;
      expect(fileSource).not.toMatch(/\blocalStorage\b/);
    }
    expect(sources.get('placement_preferences.ts')).not.toMatch(/\bplacements\b|\bhistory\b/);
  });

  it('wires strict terrain projection and cleanup into Renderer', () => {
    const renderer = readFileSync(path.join(repoRoot, 'src/render/renderer.ts'), 'utf8');
    expect(renderer).toContain('this.naturePlacementLab = createNaturePlacementLab');
    expect(renderer).toContain('this.naturePlacementLab?.dispose();');
    expect(renderer).toContain('terrainSurfacePoint(clientX: number, clientY: number)');
  });
});
