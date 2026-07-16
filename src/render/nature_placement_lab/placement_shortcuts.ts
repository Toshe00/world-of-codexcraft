export type NaturePlacementShortcut =
  | 'undo'
  | 'redo'
  | 'duplicate'
  | 'toggleGrid'
  | 'toggleSnapPosition'
  | 'placeOnGround'
  | 'delete'
  | 'cancel'
  | 'rotate'
  | 'scaleUp'
  | 'scaleDown'
  | 'heightUp'
  | 'heightDown';

export interface NaturePlacementShortcutContext {
  activeTransform: boolean;
  placementActive: boolean;
  selectedPlacement: boolean;
}

export interface KeyboardEventLike {
  altKey: boolean;
  code: string;
  ctrlKey: boolean;
  key?: string;
  metaKey: boolean;
  shiftKey: boolean;
  target: unknown;
}

export function isNaturePlacementEditableTarget(target: unknown): boolean {
  const candidate = target as { closest?: (selector: string) => unknown } | null;
  return (
    typeof candidate?.closest === 'function' &&
    candidate.closest('input, textarea, select, [contenteditable]') !== null
  );
}

export function resolveNaturePlacementShortcut(
  event: KeyboardEventLike,
  context: NaturePlacementShortcutContext,
): NaturePlacementShortcut | null {
  if (isNaturePlacementEditableTarget(event.target) || event.altKey || event.metaKey) return null;
  if (event.ctrlKey) {
    const key = event.key?.toLowerCase() ?? event.code.replace(/^Key/, '').toLowerCase();
    if (key === 'z') return event.shiftKey ? 'redo' : 'undo';
    if (key === 'y' && !event.shiftKey) return 'redo';
    if (key === 'd' && !event.shiftKey && context.selectedPlacement) return 'duplicate';
    return null;
  }
  if (event.shiftKey && event.code !== 'Escape') {
    const fineCodes = new Set([
      'Equal',
      'Minus',
      'NumpadAdd',
      'NumpadSubtract',
      'PageUp',
      'PageDown',
    ]);
    if (!fineCodes.has(event.code)) return null;
  }
  if (event.code === 'KeyG') return 'toggleGrid';
  if (event.code === 'KeyX') return 'toggleSnapPosition';
  if (event.code === 'KeyT' && context.selectedPlacement) return 'placeOnGround';
  if (event.code === 'Delete' && context.selectedPlacement) return 'delete';
  if (event.code === 'Escape' && context.placementActive) return 'cancel';
  if (!context.activeTransform) return null;
  if (event.code === 'KeyR') return 'rotate';
  if (event.code === 'Equal' || event.code === 'NumpadAdd') return 'scaleUp';
  if (event.code === 'Minus' || event.code === 'NumpadSubtract') return 'scaleDown';
  if (event.code === 'PageUp') return 'heightUp';
  if (event.code === 'PageDown') return 'heightDown';
  return null;
}
