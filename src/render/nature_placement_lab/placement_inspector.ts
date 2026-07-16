import { type TranslationKey, t } from '../../ui/i18n';
import type { NaturePlacement } from './placement_core';
import type { NaturePlacementInspectorInput } from './placement_transform_validation';

export interface NaturePlacementInspectorCallbacks {
  apply(input: NaturePlacementInspectorInput): void;
  delete(): void;
  duplicate(): void;
  placeOnGround(): void;
  reset(): void;
}

type InspectorField = keyof NaturePlacementInspectorInput;

const FIELD_KEYS: ReadonlyArray<[InspectorField, TranslationKey]> = [
  ['positionX', 'hudChrome.naturePlacementLab.positionX'],
  ['positionY', 'hudChrome.naturePlacementLab.positionY'],
  ['positionZ', 'hudChrome.naturePlacementLab.positionZ'],
  ['rotationY', 'hudChrome.naturePlacementLab.rotationYDegrees'],
  ['scale', 'hudChrome.naturePlacementLab.scale'],
  ['groundOffsetY', 'hudChrome.naturePlacementLab.groundOffsetY'],
];

function button(documentRef: Document, label: string): HTMLButtonElement {
  const element = documentRef.createElement('button');
  element.type = 'button';
  element.className = 'btn';
  element.textContent = label;
  return element;
}

function inputValue(value: number): string {
  const rounded = Math.round(value * 1_000_000) / 1_000_000;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

export function shouldPreserveInspectorDraft(
  selectedId: string | null,
  placementId: string,
  numericFieldIsActive: boolean,
): boolean {
  return placementId === selectedId && numericFieldIsActive;
}

export class NaturePlacementInspector {
  readonly root: HTMLElement;
  private readonly fields = new Map<InspectorField, HTMLInputElement>();
  private readonly idValue: HTMLInputElement;
  private readonly assetValue: HTMLInputElement;
  private selectedId: string | null = null;

  constructor(
    documentRef: Document,
    callbacks: NaturePlacementInspectorCallbacks,
    mount: HTMLElement,
    signal: AbortSignal,
  ) {
    this.root = documentRef.createElement('div');
    this.root.className = 'nature-placement-lab-inspector';
    this.idValue = this.readonlyField(documentRef, t('hudChrome.naturePlacementLab.id'));
    this.assetValue = this.readonlyField(documentRef, t('hudChrome.naturePlacementLab.assetId'));
    this.root.append(
      this.idValue.parentElement as HTMLElement,
      this.assetValue.parentElement as HTMLElement,
    );

    for (const [field, key] of FIELD_KEYS) {
      const label = documentRef.createElement('label');
      label.textContent = t(key);
      const input = documentRef.createElement('input');
      input.type = 'number';
      input.step = 'any';
      input.autocomplete = 'off';
      input.dataset.field = field;
      label.appendChild(input);
      this.fields.set(field, input);
      this.root.appendChild(label);
    }

    const actions = documentRef.createElement('div');
    actions.className = 'nature-placement-lab-actions nature-placement-lab-inspector-actions';
    const apply = button(documentRef, t('hudChrome.naturePlacementLab.apply'));
    const reset = button(documentRef, t('hudChrome.naturePlacementLab.resetTransform'));
    const ground = button(documentRef, t('hudChrome.naturePlacementLab.placeOnGround'));
    const duplicate = button(documentRef, t('hudChrome.naturePlacementLab.duplicate'));
    const remove = button(documentRef, t('hudChrome.naturePlacementLab.deleteSelected'));
    actions.append(apply, reset, ground, duplicate, remove);
    this.root.appendChild(actions);
    mount.appendChild(this.root);

    apply.addEventListener('click', () => callbacks.apply(this.read()), { signal });
    reset.addEventListener('click', () => callbacks.reset(), { signal });
    ground.addEventListener('click', () => callbacks.placeOnGround(), { signal });
    duplicate.addEventListener('click', () => callbacks.duplicate(), { signal });
    remove.addEventListener('click', () => callbacks.delete(), { signal });
  }

  update(placement: NaturePlacement | null, activeElement: Element | null): void {
    this.root.hidden = placement === null;
    if (!placement) {
      this.selectedId = null;
      return;
    }
    const editingCurrent = shouldPreserveInspectorDraft(
      this.selectedId,
      placement.id,
      activeElement !== null && [...this.fields.values()].some((input) => input === activeElement),
    );
    this.idValue.value = placement.id;
    this.assetValue.value = placement.assetId;
    if (!editingCurrent) {
      const values: Record<InspectorField, number> = {
        positionX: placement.position.x,
        positionY: placement.position.y,
        positionZ: placement.position.z,
        rotationY: (placement.rotationY * 180) / Math.PI,
        scale: placement.scale,
        groundOffsetY: placement.groundOffsetY,
      };
      for (const [field, input] of this.fields) input.value = inputValue(values[field]);
    }
    this.selectedId = placement.id;
  }

  private read(): NaturePlacementInspectorInput {
    return {
      positionX: this.fields.get('positionX')?.value ?? '',
      positionY: this.fields.get('positionY')?.value ?? '',
      positionZ: this.fields.get('positionZ')?.value ?? '',
      rotationY: this.fields.get('rotationY')?.value ?? '',
      scale: this.fields.get('scale')?.value ?? '',
      groundOffsetY: this.fields.get('groundOffsetY')?.value ?? '',
    };
  }

  private readonlyField(documentRef: Document, labelText: string): HTMLInputElement {
    const label = documentRef.createElement('label');
    label.textContent = labelText;
    const input = documentRef.createElement('input');
    input.type = 'text';
    input.readOnly = true;
    label.appendChild(input);
    return input;
  }
}
