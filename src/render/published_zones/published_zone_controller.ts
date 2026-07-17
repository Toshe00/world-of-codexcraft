import {
  validateNatureZonePackage,
  type NatureZonePackage,
} from '../nature_placement_lab/placement_zone_publication';
import type { PublishedZoneInstanceOwner } from './published_zone_instances';
import {
  decidePublishedZoneProximityAction,
  distanceToPublishedZoneBounds,
  type PublishedZoneLabState,
  type PublishedZonePoint,
} from './published_zone_runtime_core';

export class PublishedZoneController {
  private zonePackage: NatureZonePackage | null = null;
  private lastPlayerPosition: PublishedZonePoint | null = null;
  private loadGeneration = 0;
  private disposed = false;
  private currentState: PublishedZoneLabState = 'inactive';

  constructor(
    private readonly instances: PublishedZoneInstanceOwner,
    private readonly onStateChange: (state: PublishedZoneLabState) => void,
  ) {}

  get state(): PublishedZoneLabState {
    return this.currentState;
  }

  install(value: unknown): boolean {
    if (this.disposed) return false;
    try {
      this.zonePackage = validateNatureZonePackage(value);
    } catch {
      this.invalidate();
      return false;
    }
    this.setState('unloaded');
    if (this.lastPlayerPosition) this.update(this.lastPlayerPosition);
    return true;
  }

  invalidate(): void {
    if (this.disposed) return;
    this.zonePackage = null;
    this.loadGeneration++;
    this.instances.unload();
    this.setState('invalid');
  }

  update(playerPosition: PublishedZonePoint): void {
    if (this.disposed) return;
    this.lastPlayerPosition = { x: playerPosition.x, z: playerPosition.z };
    if (!this.zonePackage) return;
    const distance = distanceToPublishedZoneBounds(playerPosition, this.zonePackage.bounds);
    const action = decidePublishedZoneProximityAction(this.currentState, distance);
    if (action === 'load') this.startLoad();
    else if (action === 'unload') this.unload();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.loadGeneration++;
    this.zonePackage = null;
    this.lastPlayerPosition = null;
    this.instances.dispose();
  }

  private startLoad(): void {
    if (!this.zonePackage || this.currentState !== 'unloaded') return;
    const zonePackage = this.zonePackage;
    const generation = ++this.loadGeneration;
    this.setState('loading');
    void this.instances
      .load(zonePackage)
      .then((loaded) => {
        if (
          this.disposed ||
          generation !== this.loadGeneration ||
          this.currentState !== 'loading'
        ) {
          return;
        }
        if (loaded) this.setState('loaded');
        else this.setState('unloaded');
      })
      .catch(() => {
        if (this.disposed || generation !== this.loadGeneration) return;
        this.invalidate();
      });
  }

  private unload(): void {
    this.loadGeneration++;
    this.instances.unload();
    this.setState('unloaded');
  }

  private setState(state: PublishedZoneLabState): void {
    if (state === this.currentState) return;
    this.currentState = state;
    this.onStateChange(state);
  }
}
