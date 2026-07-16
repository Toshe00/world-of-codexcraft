import { describe, expect, it } from 'vitest';
import { shouldPreserveInspectorDraft } from '../src/render/nature_placement_lab/placement_inspector';

describe('nature placement numeric inspector', () => {
  it('preserves a draft only while a numeric field for the current placement is active', () => {
    expect(shouldPreserveInspectorDraft('lab-placement-001', 'lab-placement-001', true)).toBe(true);
    expect(shouldPreserveInspectorDraft('lab-placement-001', 'lab-placement-001', false)).toBe(
      false,
    );
    expect(shouldPreserveInspectorDraft('lab-placement-001', 'lab-placement-002', true)).toBe(
      false,
    );
  });
});
