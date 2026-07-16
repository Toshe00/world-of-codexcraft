import { describe, expect, it, vi } from 'vitest';
import {
  loadNaturePlacementPreferences,
  NATURE_PLACEMENT_PREFERENCES_KEY,
  saveNaturePlacementPreferences,
} from '../src/render/nature_placement_lab/placement_preferences';
import { resolveNaturePlacementShortcut } from '../src/render/nature_placement_lab/placement_shortcuts';

describe('nature placement editor preferences', () => {
  it('uses a dedicated development key and persists only normalized editor options', () => {
    expect(NATURE_PLACEMENT_PREFERENCES_KEY.startsWith('woc_')).toBe(false);
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    };
    const preferences = {
      gridVisible: false,
      gridSize: 0.5 as const,
      snapPosition: true,
      snapRotation: true,
      snapScale: false,
      snapToGround: true,
      rotationStep: 45 as const,
      scaleStep: 0.05 as const,
    };

    expect(saveNaturePlacementPreferences(storage, preferences)).toBe(true);
    expect(storage.setItem).toHaveBeenCalledWith(
      NATURE_PLACEMENT_PREFERENCES_KEY,
      JSON.stringify(preferences),
    );
    expect(loadNaturePlacementPreferences(storage)).toEqual(preferences);
    expect(values.get(NATURE_PLACEMENT_PREFERENCES_KEY)).not.toContain('history');
    expect(values.get(NATURE_PLACEMENT_PREFERENCES_KEY)).not.toContain('placements');
  });

  it('falls back safely for corrupt or unsupported stored values', () => {
    const storage = {
      getItem: () => '{bad',
      setItem: () => undefined,
    };
    expect(loadNaturePlacementPreferences(storage)).toMatchObject({
      gridVisible: true,
      gridSize: 1,
      rotationStep: 15,
      scaleStep: 0.1,
    });
  });
});

describe('nature placement keyboard shortcuts', () => {
  const context = { activeTransform: true, placementActive: true, selectedPlacement: true };
  const event = (code: string, overrides: Record<string, unknown> = {}) => ({
    altKey: false,
    code,
    ctrlKey: false,
    key: code.replace(/^Key/, ''),
    metaKey: false,
    shiftKey: false,
    target: null,
    ...overrides,
  });

  it('maps undo, redo, duplicate, grid, position snap, ground, delete, and cancel', () => {
    expect(resolveNaturePlacementShortcut(event('KeyZ', { ctrlKey: true }), context)).toBe('undo');
    expect(resolveNaturePlacementShortcut(event('KeyY', { ctrlKey: true }), context)).toBe('redo');
    expect(
      resolveNaturePlacementShortcut(event('KeyZ', { ctrlKey: true, shiftKey: true }), context),
    ).toBe('redo');
    expect(resolveNaturePlacementShortcut(event('KeyD', { ctrlKey: true }), context)).toBe(
      'duplicate',
    );
    expect(resolveNaturePlacementShortcut(event('KeyG'), context)).toBe('toggleGrid');
    expect(resolveNaturePlacementShortcut(event('KeyX'), context)).toBe('toggleSnapPosition');
    expect(resolveNaturePlacementShortcut(event('KeyT'), context)).toBe('placeOnGround');
    expect(resolveNaturePlacementShortcut(event('Delete'), context)).toBe('delete');
    expect(resolveNaturePlacementShortcut(event('Escape'), context)).toBe('cancel');
  });

  it('uses the typed key for conventional Ctrl shortcuts on non-QWERTY layouts', () => {
    expect(
      resolveNaturePlacementShortcut(event('KeyW', { ctrlKey: true, key: 'z' }), context),
    ).toBe('undo');
    expect(
      resolveNaturePlacementShortcut(
        event('KeyY', { ctrlKey: true, key: 'z', shiftKey: true }),
        context,
      ),
    ).toBe('redo');
    expect(
      resolveNaturePlacementShortcut(event('KeyZ', { ctrlKey: true, key: 'y' }), context),
    ).toBe('redo');
    expect(
      resolveNaturePlacementShortcut(event('KeyE', { ctrlKey: true, key: 'd' }), context),
    ).toBe('duplicate');
  });

  it.each(['input', 'textarea', 'select'])('returns no action while typing in %s', (tag) => {
    const target = { closest: (selector: string) => (selector.includes(tag) ? {} : null) };
    expect(
      resolveNaturePlacementShortcut(event('KeyZ', { ctrlKey: true, target }), context),
    ).toBeNull();
    expect(resolveNaturePlacementShortcut(event('Escape', { target }), context)).toBeNull();
  });
});
