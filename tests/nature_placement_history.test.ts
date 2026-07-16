import { describe, expect, it } from 'vitest';
import { EditHistory } from '../src/render/nature_placement_lab/placement_history';

interface Snapshot {
  placements: Array<{ id: string; position: { x: number; y: number; z: number } }>;
}

const clone = (snapshot: Snapshot): Snapshot => ({
  placements: snapshot.placements.map((placement) => ({
    ...placement,
    position: { ...placement.position },
  })),
});
const equals = (left: Snapshot, right: Snapshot): boolean =>
  JSON.stringify(left) === JSON.stringify(right);
const empty = (): Snapshot => ({ placements: [] });
const placed = (id: string, x = 0): Snapshot => ({
  placements: [{ id, position: { x, y: 2, z: 3 } }],
});

describe('nature placement edit history', () => {
  it('undoes and redoes a placement', () => {
    const history = new EditHistory(clone, equals);
    history.record(empty(), placed('one'));

    expect(history.undo()).toEqual(empty());
    expect(history.canRedo).toBe(true);
    expect(history.redo()).toEqual(placed('one'));
  });

  it('keeps no more than 100 undo steps', () => {
    const history = new EditHistory(clone, equals);
    for (let index = 0; index < 105; index++) {
      history.record(placed('one', index), placed('one', index + 1));
    }

    expect(history.undoCount).toBe(100);
    for (let index = 0; index < 100; index++) expect(history.undo()).not.toBeNull();
    expect(history.undo()).toBeNull();
  });

  it('clears redo when a new action follows undo', () => {
    const history = new EditHistory(clone, equals);
    history.record(empty(), placed('one'));
    history.undo();
    expect(history.canRedo).toBe(true);

    history.record(empty(), placed('two'));
    expect(history.canRedo).toBe(false);
  });

  it('never exposes or mutates stored snapshots', () => {
    const history = new EditHistory(clone, equals);
    const before = empty();
    const after = placed('one');
    history.record(before, after);
    after.placements[0].position.x = 99;

    const undone = history.undo();
    undone?.placements.push({ id: 'mutated', position: { x: 0, y: 0, z: 0 } });
    const redone = history.redo();
    if (redone) redone.placements[0].position.x = 77;

    expect(history.undo()).toEqual(empty());
    expect(history.redo()).toEqual(placed('one'));
  });

  it('coalesces a complete drag or repeated field edit into one action', () => {
    const history = new EditHistory(clone, equals);
    history.record(placed('one', 0), placed('one', 1), 'drag:one');
    history.record(placed('one', 1), placed('one', 2), 'drag:one');
    history.record(placed('one', 2), placed('one', 3), 'drag:one');

    expect(history.undoCount).toBe(1);
    expect(history.undo()).toEqual(placed('one', 0));
    expect(history.redo()).toEqual(placed('one', 3));
  });
});
