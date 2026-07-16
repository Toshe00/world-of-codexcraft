import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { NaturePlacementGrid } from '../src/render/nature_placement_lab/placement_grid';

describe('nature placement development grid', () => {
  it('stays bounded, horizontal, discreet, and follows the snapped work area', () => {
    const parent = new THREE.Group();
    const grid = new NaturePlacementGrid(parent);
    grid.update(true, 0.5, { x: 3.24, y: 7, z: -2.74 });

    const helper = parent.children[0] as THREE.GridHelper;
    expect(helper).toBeInstanceOf(THREE.GridHelper);
    expect(helper.position.toArray()).toEqual([3, 7.02, -2.5]);
    expect(helper.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
    expect(helper.geometry.getAttribute('position').count).toBeLessThan(1_000);
    expect((helper.material as THREE.Material).depthWrite).toBe(false);
  });

  it('can be hidden and disposes all owned Three.js resources', () => {
    const parent = new THREE.Group();
    const grid = new NaturePlacementGrid(parent);
    grid.update(true, 1, { x: 0, y: 0, z: 0 });
    const helper = parent.children[0] as THREE.GridHelper;
    const geometryDispose = vi.spyOn(helper.geometry, 'dispose');
    const materialDispose = vi.spyOn(helper.material as THREE.Material, 'dispose');

    grid.update(false, 1, { x: 0, y: 0, z: 0 });
    expect(helper.visible).toBe(false);
    grid.dispose();

    expect(parent.children).toHaveLength(0);
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
  });
});
