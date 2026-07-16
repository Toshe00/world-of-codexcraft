export interface EditHistoryEntry<T> {
  readonly before: T;
  readonly after: T;
  readonly mergeKey: string | null;
}

export class EditHistory<T> {
  private readonly undoEntries: EditHistoryEntry<T>[] = [];
  private readonly redoEntries: EditHistoryEntry<T>[] = [];

  constructor(
    private readonly clone: (value: T) => T,
    private readonly equals: (left: T, right: T) => boolean,
    private readonly limit = 100,
  ) {
    if (!Number.isInteger(limit) || limit < 1) throw new Error('history limit must be positive');
  }

  get canUndo(): boolean {
    return this.undoEntries.length > 0;
  }

  get canRedo(): boolean {
    return this.redoEntries.length > 0;
  }

  get undoCount(): number {
    return this.undoEntries.length;
  }

  get redoCount(): number {
    return this.redoEntries.length;
  }

  record(before: T, after: T, mergeKey: string | null = null): boolean {
    if (this.equals(before, after)) return false;
    const previous = this.undoEntries.at(-1);
    if (mergeKey !== null && previous?.mergeKey === mergeKey && this.redoEntries.length === 0) {
      const merged: EditHistoryEntry<T> = {
        before: this.clone(previous.before),
        after: this.clone(after),
        mergeKey,
      };
      if (this.equals(merged.before, merged.after)) this.undoEntries.pop();
      else this.undoEntries[this.undoEntries.length - 1] = merged;
      return true;
    }
    this.undoEntries.push({
      before: this.clone(before),
      after: this.clone(after),
      mergeKey,
    });
    if (this.undoEntries.length > this.limit) this.undoEntries.shift();
    this.redoEntries.length = 0;
    return true;
  }

  undo(): T | null {
    const entry = this.undoEntries.pop();
    if (!entry) return null;
    this.redoEntries.push(this.copyEntry(entry));
    return this.clone(entry.before);
  }

  redo(): T | null {
    const entry = this.redoEntries.pop();
    if (!entry) return null;
    this.undoEntries.push(this.copyEntry(entry));
    return this.clone(entry.after);
  }

  clear(): void {
    this.undoEntries.length = 0;
    this.redoEntries.length = 0;
  }

  private copyEntry(entry: EditHistoryEntry<T>): EditHistoryEntry<T> {
    return {
      before: this.clone(entry.before),
      after: this.clone(entry.after),
      mergeKey: entry.mergeKey,
    };
  }
}
