import {
  cloneNaturePlacement,
  NATURE_PLACEMENT_LIMITS,
  type NaturePlacementAssetId,
  type NaturePlacementPoint,
  type NaturePlacementTransform,
  naturePlacementAsset,
  normalizePlacementRotation,
  validNaturePlacementPoint,
} from './placement_core';
import {
  type NaturePlacementGroupSnapOptions,
  type NaturePlacementGroupTransform,
  transformNaturePlacementGroup,
} from './placement_group_transform_core';
import {
  cloneNaturePlacementProject,
  cloneNaturePlacementProjectSnapshot,
  defaultLayerIdForAsset,
  NATURE_PLACEMENT_PROJECT_LIMITS,
  type NaturePlacementGroup,
  type NaturePlacementLayer,
  type NaturePlacementProject,
  type NaturePlacementProjectSnapshot,
  type NatureProjectPlacement,
  selectionCenter,
} from './placement_project_core';

export type NaturePlacementSelectionMode = 'replace' | 'add' | 'toggle';

function normalizedName(name: string): string | null {
  const value = name.trim();
  return value.length > 0 && value.length <= 100 ? value : null;
}

function round(value: number): number {
  const rounded = Math.round(value * 1_000_000) / 1_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export class NaturePlacementWorkspace {
  private project: NaturePlacementProject;
  private readonly selectedIds = new Set<string>();
  private selectedAsset: NaturePlacementAssetId | null = null;
  private placing = false;
  private draft: NaturePlacementTransform | null = null;
  private nextPlacementId = 1;
  private nextLayerId = 1;
  private nextGroupId = 1;

  constructor(
    project: NaturePlacementProject,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.project = cloneNaturePlacementProject(project);
    this.resetIdCounters();
  }

  get projectData(): NaturePlacementProject {
    return cloneNaturePlacementProject(this.project);
  }

  get placements(): NatureProjectPlacement[] {
    return this.project.placements.map((placement) => ({
      ...cloneNaturePlacement(placement),
      layerId: placement.layerId,
    }));
  }

  get visiblePlacements(): NatureProjectPlacement[] {
    const visible = new Set(
      this.project.layers.filter((layer) => layer.visible).map((layer) => layer.layerId),
    );
    return this.placements.filter((placement) => visible.has(placement.layerId));
  }

  get layers(): NaturePlacementLayer[] {
    return this.project.layers.map((layer) => ({ ...layer }));
  }

  get groups(): NaturePlacementGroup[] {
    return this.project.groups.map((group) => ({
      ...group,
      placementIds: [...group.placementIds],
    }));
  }

  get selectedAssetId(): NaturePlacementAssetId | null {
    return this.selectedAsset;
  }

  get selectedPlacementIds(): string[] {
    return this.project.placements
      .filter((placement) => this.selectedIds.has(placement.id))
      .map((placement) => placement.id);
  }

  get selectedPlacementId(): string | null {
    return this.selectedPlacementIds.at(-1) ?? null;
  }

  get selectedPlacements(): NatureProjectPlacement[] {
    return this.placements.filter((placement) => this.selectedIds.has(placement.id));
  }

  get selectedPlacement(): NatureProjectPlacement | null {
    return this.selectedPlacements.length === 1 ? this.selectedPlacements[0] : null;
  }

  get selectionCenter(): NaturePlacementPoint | null {
    return selectionCenter(this.selectedPlacements);
  }

  get placementActive(): boolean {
    return this.placing;
  }

  get editSnapshot(): NaturePlacementProjectSnapshot {
    return {
      project: this.projectData,
      selectedPlacementIds: this.selectedPlacementIds,
    };
  }

  get activeTransform(): NaturePlacementTransform | null {
    const selected = this.selectedPlacement;
    if (selected) {
      return {
        assetId: selected.assetId,
        rotationY: selected.rotationY,
        scale: selected.scale,
        groundOffsetY: selected.groundOffsetY,
      };
    }
    return this.draft ? { ...this.draft } : null;
  }

  replaceProject(project: NaturePlacementProject): void {
    this.project = cloneNaturePlacementProject(project);
    this.selectedIds.clear();
    this.placing = false;
    this.resetIdCounters();
  }

  restoreEditSnapshot(snapshot: NaturePlacementProjectSnapshot): void {
    const restored = cloneNaturePlacementProjectSnapshot(snapshot);
    this.project = restored.project;
    this.selectedIds.clear();
    for (const id of restored.selectedPlacementIds) {
      if (this.isSelectable(id)) this.selectedIds.add(id);
    }
    this.placing = false;
    this.resetIdCounters();
  }

  selectAsset(assetId: NaturePlacementAssetId): void {
    const asset = naturePlacementAsset(assetId);
    this.selectedAsset = assetId;
    this.selectedIds.clear();
    this.placing = false;
    this.draft = {
      assetId,
      rotationY: asset.defaultRotationY,
      scale: 1,
      groundOffsetY: asset.defaultGroundOffsetY,
    };
  }

  startPlacement(): boolean {
    if (!this.draft) return false;
    this.selectedIds.clear();
    this.placing = true;
    return true;
  }

  cancelPlacement(): void {
    this.placing = false;
  }

  place(point: NaturePlacementPoint | null): NatureProjectPlacement | null {
    if (!this.placing || !this.draft || !validNaturePlacementPoint(point)) return null;
    if (this.project.placements.length >= NATURE_PLACEMENT_LIMITS.maxPlacements) return null;
    const layerId = defaultLayerIdForAsset(this.draft.assetId);
    const layer = this.layer(layerId);
    if (!layer || layer.locked) return null;
    const placement: NatureProjectPlacement = {
      id: this.allocatePlacementId(),
      assetId: this.draft.assetId,
      layerId,
      position: { ...point },
      rotationY: this.draft.rotationY,
      scale: this.draft.scale,
      groundOffsetY: this.draft.groundOffsetY,
    };
    this.project.placements.push(placement);
    this.touch();
    return { ...placement, position: { ...placement.position } };
  }

  selectPlacement(id: string | null, mode: NaturePlacementSelectionMode = 'replace'): boolean {
    this.placing = false;
    if (id === null) {
      if (mode === 'replace') this.selectedIds.clear();
      return true;
    }
    if (!this.isSelectable(id)) return false;
    if (mode === 'replace') {
      this.selectedIds.clear();
      this.selectedIds.add(id);
    } else if (mode === 'add') {
      this.selectedIds.add(id);
    } else if (this.selectedIds.has(id)) {
      this.selectedIds.delete(id);
    } else {
      this.selectedIds.add(id);
    }
    return true;
  }

  selectIds(ids: readonly string[], mode: NaturePlacementSelectionMode = 'replace'): void {
    if (mode === 'replace') this.selectedIds.clear();
    for (const id of ids) this.selectPlacement(id, mode === 'toggle' ? 'toggle' : 'add');
  }

  selectAll(): void {
    this.selectedIds.clear();
    for (const placement of this.project.placements) {
      if (this.isSelectable(placement.id)) this.selectedIds.add(placement.id);
    }
  }

  deselectAll(): void {
    this.selectedIds.clear();
  }

  invertSelection(): void {
    for (const placement of this.project.placements) {
      if (!this.isSelectable(placement.id)) continue;
      if (this.selectedIds.has(placement.id)) this.selectedIds.delete(placement.id);
      else this.selectedIds.add(placement.id);
    }
  }

  selectByAsset(
    assetId: NaturePlacementAssetId,
    mode: NaturePlacementSelectionMode = 'replace',
  ): void {
    this.selectIds(
      this.project.placements
        .filter((placement) => placement.assetId === assetId)
        .map((placement) => placement.id),
      mode,
    );
  }

  selectByLayer(layerId: string, mode: NaturePlacementSelectionMode = 'replace'): void {
    this.selectIds(
      this.project.placements
        .filter((placement) => placement.layerId === layerId)
        .map((placement) => placement.id),
      mode,
    );
  }

  selectInRectangle(
    start: NaturePlacementPoint,
    end: NaturePlacementPoint,
    mode: NaturePlacementSelectionMode = 'replace',
  ): void {
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    const minZ = Math.min(start.z, end.z);
    const maxZ = Math.max(start.z, end.z);
    this.selectIds(
      this.project.placements
        .filter(
          (placement) =>
            placement.position.x >= minX &&
            placement.position.x <= maxX &&
            placement.position.z >= minZ &&
            placement.position.z <= maxZ,
        )
        .map((placement) => placement.id),
      mode,
    );
  }

  applySelectionTransform(
    transform: NaturePlacementGroupTransform,
    snapping: NaturePlacementGroupSnapOptions,
    sampleGroundY: (x: number, z: number) => number,
  ): boolean {
    const selected = this.selectedPlacements;
    if (selected.length === 0 || !this.canModify(selected.map((placement) => placement.id)))
      return false;
    const transformed = transformNaturePlacementGroup(selected, transform, snapping, sampleGroundY);
    if (!transformed) return false;
    const byId = new Map(transformed.map((placement) => [placement.id, placement]));
    this.project.placements = this.project.placements.map(
      (placement) => byId.get(placement.id) ?? placement,
    );
    this.touch();
    return true;
  }

  updateSelectedTransform(transform: {
    position: NaturePlacementPoint;
    rotationY: number;
    scale: number;
    groundOffsetY: number;
  }): boolean {
    const selected = this.selectedPlacement;
    if (
      !selected ||
      !this.canModify([selected.id]) ||
      !validNaturePlacementPoint(transform.position)
    ) {
      return false;
    }
    if (
      !Number.isFinite(transform.rotationY) ||
      !Number.isFinite(transform.scale) ||
      !Number.isFinite(transform.groundOffsetY) ||
      transform.scale < NATURE_PLACEMENT_LIMITS.scaleMin ||
      transform.scale > NATURE_PLACEMENT_LIMITS.scaleMax ||
      transform.groundOffsetY < NATURE_PLACEMENT_LIMITS.groundOffsetMin ||
      transform.groundOffsetY > NATURE_PLACEMENT_LIMITS.groundOffsetMax
    ) {
      return false;
    }
    const target = this.project.placements.find((placement) => placement.id === selected.id);
    if (!target) return false;
    target.position = { ...transform.position };
    target.rotationY = normalizePlacementRotation(transform.rotationY);
    target.scale = round(transform.scale);
    target.groundOffsetY = round(transform.groundOffsetY);
    this.touch();
    return true;
  }

  setActiveTransform(transform: NaturePlacementTransform): boolean {
    if (
      !Number.isFinite(transform.rotationY) ||
      !Number.isFinite(transform.scale) ||
      !Number.isFinite(transform.groundOffsetY) ||
      transform.scale < NATURE_PLACEMENT_LIMITS.scaleMin ||
      transform.scale > NATURE_PLACEMENT_LIMITS.scaleMax ||
      transform.groundOffsetY < NATURE_PLACEMENT_LIMITS.groundOffsetMin ||
      transform.groundOffsetY > NATURE_PLACEMENT_LIMITS.groundOffsetMax
    ) {
      return false;
    }
    const selected = this.selectedPlacement;
    if (selected) {
      return this.updateSelectedTransform({
        position: selected.position,
        rotationY: transform.rotationY,
        scale: transform.scale,
        groundOffsetY: transform.groundOffsetY,
      });
    }
    if (!this.draft) return false;
    this.draft.rotationY = normalizePlacementRotation(transform.rotationY);
    this.draft.scale = round(transform.scale);
    this.draft.groundOffsetY = round(transform.groundOffsetY);
    return true;
  }

  rotateActive(direction: number): boolean {
    const active = this.activeTransform;
    if (!active || !Number.isFinite(direction) || direction === 0) return false;
    return this.setActiveTransform({
      ...active,
      rotationY: active.rotationY + Math.sign(direction) * NATURE_PLACEMENT_LIMITS.rotationStep,
    });
  }

  adjustScale(direction: number, fine: boolean): boolean {
    const active = this.activeTransform;
    if (!active || !Number.isFinite(direction) || direction === 0) return false;
    const step = fine ? NATURE_PLACEMENT_LIMITS.scaleStepFine : NATURE_PLACEMENT_LIMITS.scaleStep;
    return this.setActiveTransform({
      ...active,
      scale: Math.min(
        NATURE_PLACEMENT_LIMITS.scaleMax,
        Math.max(NATURE_PLACEMENT_LIMITS.scaleMin, active.scale + Math.sign(direction) * step),
      ),
    });
  }

  adjustGroundOffset(direction: number, fine: boolean): boolean {
    const active = this.activeTransform;
    if (!active || !Number.isFinite(direction) || direction === 0) return false;
    const step = fine
      ? NATURE_PLACEMENT_LIMITS.groundOffsetStepFine
      : NATURE_PLACEMENT_LIMITS.groundOffsetStep;
    return this.setActiveTransform({
      ...active,
      groundOffsetY: Math.min(
        NATURE_PLACEMENT_LIMITS.groundOffsetMax,
        Math.max(
          NATURE_PLACEMENT_LIMITS.groundOffsetMin,
          active.groundOffsetY + Math.sign(direction) * step,
        ),
      ),
    });
  }

  resetSelectedTransform(): boolean {
    const selected = this.selectedPlacements;
    if (selected.length === 0 || !this.canModify(selected.map((placement) => placement.id)))
      return false;
    const ids = new Set(selected.map((placement) => placement.id));
    for (const placement of this.project.placements) {
      if (!ids.has(placement.id)) continue;
      const asset = naturePlacementAsset(placement.assetId);
      placement.rotationY = asset.defaultRotationY;
      placement.scale = 1;
      placement.groundOffsetY = asset.defaultGroundOffsetY;
    }
    this.touch();
    return true;
  }

  duplicateSelected(offset: NaturePlacementPoint): NatureProjectPlacement[] | null {
    const selected = this.selectedPlacements;
    if (
      selected.length === 0 ||
      !this.canModify(selected.map((placement) => placement.id)) ||
      this.project.placements.length + selected.length > NATURE_PLACEMENT_LIMITS.maxPlacements
    ) {
      return null;
    }
    const duplicates: NatureProjectPlacement[] = [];
    for (const source of selected) {
      const position = {
        x: source.position.x + offset.x,
        y: source.position.y + offset.y,
        z: source.position.z + offset.z,
      };
      if (!validNaturePlacementPoint(position)) return null;
      duplicates.push({
        ...source,
        id: this.allocatePlacementId(),
        position,
      });
    }
    this.project.placements.push(...duplicates);
    this.selectedIds.clear();
    for (const duplicate of duplicates) this.selectedIds.add(duplicate.id);
    this.touch();
    return duplicates.map((placement) => ({ ...placement, position: { ...placement.position } }));
  }

  deleteSelected(): boolean {
    const ids = this.selectedPlacementIds;
    if (ids.length === 0 || !this.canModify(ids)) return false;
    this.removePlacements(new Set(ids));
    this.touch();
    return true;
  }

  clear(): boolean {
    if (this.project.placements.some((placement) => this.layer(placement.layerId)?.locked))
      return false;
    this.project.placements = [];
    this.project.groups = [];
    this.selectedIds.clear();
    this.placing = false;
    this.touch();
    return true;
  }

  createLayer(name: string): NaturePlacementLayer | null {
    const normalized = normalizedName(name);
    if (!normalized || this.project.layers.length >= NATURE_PLACEMENT_PROJECT_LIMITS.maxLayers)
      return null;
    const layer: NaturePlacementLayer = {
      layerId: this.allocateLayerId(),
      name: normalized,
      visible: true,
      locked: false,
    };
    this.project.layers.push(layer);
    this.touch();
    return { ...layer };
  }

  renameLayer(layerId: string, name: string): boolean {
    const layer = this.layer(layerId);
    const normalized = normalizedName(name);
    if (!layer || !normalized) return false;
    layer.name = normalized;
    this.touch();
    return true;
  }

  deleteEmptyLayer(layerId: string): boolean {
    const index = this.project.layers.findIndex((layer) => layer.layerId === layerId);
    if (
      index < 0 ||
      this.project.layers.length <= 1 ||
      this.project.placements.some((placement) => placement.layerId === layerId)
    ) {
      return false;
    }
    this.project.layers.splice(index, 1);
    this.touch();
    return true;
  }

  setLayerVisible(layerId: string, visible: boolean): boolean {
    const layer = this.layer(layerId);
    if (!layer || typeof visible !== 'boolean' || (layer.locked && !visible)) return false;
    layer.visible = visible;
    if (!visible) {
      for (const placement of this.project.placements) {
        if (placement.layerId === layerId) this.selectedIds.delete(placement.id);
      }
    }
    this.touch();
    return true;
  }

  setLayerLocked(layerId: string, locked: boolean): boolean {
    const layer = this.layer(layerId);
    if (!layer || typeof locked !== 'boolean') return false;
    layer.locked = locked;
    if (locked) layer.visible = true;
    if (locked) {
      for (const placement of this.project.placements) {
        if (placement.layerId === layerId) this.selectedIds.delete(placement.id);
      }
    }
    this.touch();
    return true;
  }

  moveSelectionToLayer(layerId: string): boolean {
    const target = this.layer(layerId);
    const ids = this.selectedPlacementIds;
    if (!target || target.locked || ids.length === 0 || !this.canModify(ids)) return false;
    const selected = new Set(ids);
    for (const placement of this.project.placements) {
      if (selected.has(placement.id)) placement.layerId = layerId;
    }
    this.touch();
    return true;
  }

  deleteLayerPlacements(layerId: string): boolean {
    const layer = this.layer(layerId);
    if (!layer || layer.locked) return false;
    const ids = new Set(
      this.project.placements
        .filter((placement) => placement.layerId === layerId)
        .map((placement) => placement.id),
    );
    if (ids.size === 0) return true;
    this.removePlacements(ids);
    this.touch();
    return true;
  }

  groupSelection(name: string): NaturePlacementGroup | null {
    const normalized = normalizedName(name);
    const ids = this.selectedPlacementIds;
    const alreadyGrouped = new Set(this.project.groups.flatMap((group) => group.placementIds));
    if (
      !normalized ||
      ids.length === 0 ||
      this.project.groups.length >= NATURE_PLACEMENT_PROJECT_LIMITS.maxGroups ||
      ids.some((id) => alreadyGrouped.has(id))
    ) {
      return null;
    }
    const group: NaturePlacementGroup = {
      groupId: this.allocateGroupId(),
      name: normalized,
      placementIds: [...ids],
    };
    this.project.groups.push(group);
    this.touch();
    return { ...group, placementIds: [...group.placementIds] };
  }

  ungroupSelection(): boolean {
    const selected = new Set(this.selectedPlacementIds);
    if (selected.size === 0) return false;
    let changed = false;
    this.project.groups = this.project.groups.flatMap((group) => {
      const placementIds = group.placementIds.filter((id) => !selected.has(id));
      if (placementIds.length === group.placementIds.length) return [group];
      changed = true;
      return placementIds.length > 0 ? [{ ...group, placementIds }] : [];
    });
    if (changed) this.touch();
    return changed;
  }

  renameGroup(groupId: string, name: string): boolean {
    const group = this.project.groups.find((entry) => entry.groupId === groupId);
    const normalized = normalizedName(name);
    if (!group || !normalized) return false;
    group.name = normalized;
    this.touch();
    return true;
  }

  selectGroup(groupId: string): boolean {
    const group = this.project.groups.find((entry) => entry.groupId === groupId);
    if (!group) return false;
    this.selectIds(group.placementIds);
    return this.selectedIds.size > 0;
  }

  duplicateGroup(
    groupId: string,
    offset: NaturePlacementPoint,
    copyName: string,
  ): NaturePlacementGroup | null {
    const group = this.project.groups.find((entry) => entry.groupId === groupId);
    const normalizedCopyName = normalizedName(copyName);
    if (
      !group ||
      !normalizedCopyName ||
      this.project.groups.length >= NATURE_PLACEMENT_PROJECT_LIMITS.maxGroups ||
      !this.canModify(group.placementIds) ||
      group.placementIds.some((id) => !this.isSelectable(id))
    )
      return null;
    this.selectIds(group.placementIds);
    const duplicates = this.duplicateSelected(offset);
    if (!duplicates) return null;
    const copy: NaturePlacementGroup = {
      groupId: this.allocateGroupId(),
      name: normalizedCopyName,
      placementIds: duplicates.map((placement) => placement.id),
    };
    this.project.groups.push(copy);
    this.touch();
    return { ...copy, placementIds: [...copy.placementIds] };
  }

  deleteGroup(groupId: string): boolean {
    const index = this.project.groups.findIndex((group) => group.groupId === groupId);
    if (index < 0) return false;
    this.project.groups.splice(index, 1);
    this.touch();
    return true;
  }

  deleteGroupAndPlacements(groupId: string): boolean {
    const group = this.project.groups.find((entry) => entry.groupId === groupId);
    if (!group || !this.canModify(group.placementIds)) return false;
    this.removePlacements(new Set(group.placementIds));
    this.touch();
    return true;
  }

  private isSelectable(id: string): boolean {
    const placement = this.project.placements.find((entry) => entry.id === id);
    if (!placement) return false;
    const layer = this.layer(placement.layerId);
    return Boolean(layer?.visible && !layer.locked);
  }

  private canModify(ids: readonly string[]): boolean {
    return ids.every((id) => {
      const placement = this.project.placements.find((entry) => entry.id === id);
      return placement !== undefined && this.layer(placement.layerId)?.locked === false;
    });
  }

  private layer(layerId: string): NaturePlacementLayer | undefined {
    return this.project.layers.find((layer) => layer.layerId === layerId);
  }

  private removePlacements(ids: ReadonlySet<string>): void {
    this.project.placements = this.project.placements.filter((placement) => !ids.has(placement.id));
    this.project.groups = this.project.groups
      .map((group) => ({
        ...group,
        placementIds: group.placementIds.filter((id) => !ids.has(id)),
      }))
      .filter((group) => group.placementIds.length > 0);
    for (const id of ids) this.selectedIds.delete(id);
  }

  private touch(): void {
    this.project.modifiedAt = this.now().toISOString();
  }

  private resetIdCounters(): void {
    this.nextPlacementId = 1;
    this.nextLayerId = 1;
    this.nextGroupId = 1;
    while (
      this.project.placements.some(
        (entry) => entry.id === this.formatPlacementId(this.nextPlacementId),
      )
    )
      this.nextPlacementId++;
    while (
      this.project.layers.some((entry) => entry.layerId === this.formatLayerId(this.nextLayerId))
    )
      this.nextLayerId++;
    while (
      this.project.groups.some((entry) => entry.groupId === this.formatGroupId(this.nextGroupId))
    )
      this.nextGroupId++;
  }

  private formatPlacementId(value: number): string {
    return `lab-placement-${String(value).padStart(3, '0')}`;
  }

  private formatLayerId(value: number): string {
    return `layer-custom-${String(value).padStart(3, '0')}`;
  }

  private formatGroupId(value: number): string {
    return `group-${String(value).padStart(3, '0')}`;
  }

  private allocatePlacementId(): string {
    let id = this.formatPlacementId(this.nextPlacementId++);
    while (this.project.placements.some((entry) => entry.id === id))
      id = this.formatPlacementId(this.nextPlacementId++);
    return id;
  }

  private allocateLayerId(): string {
    let id = this.formatLayerId(this.nextLayerId++);
    while (this.project.layers.some((entry) => entry.layerId === id))
      id = this.formatLayerId(this.nextLayerId++);
    return id;
  }

  private allocateGroupId(): string {
    let id = this.formatGroupId(this.nextGroupId++);
    while (this.project.groups.some((entry) => entry.groupId === id))
      id = this.formatGroupId(this.nextGroupId++);
    return id;
  }
}
