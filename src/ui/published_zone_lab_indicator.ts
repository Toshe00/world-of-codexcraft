import { t, type TranslationKey } from './i18n';

export type PublishedZoneLabIndicatorState =
  | 'inactive'
  | 'loading'
  | 'loaded'
  | 'unloaded'
  | 'invalid';

const STATE_KEYS: Readonly<Record<PublishedZoneLabIndicatorState, TranslationKey>> = {
  inactive: 'hudChrome.publishedZoneLab.inactive',
  loading: 'hudChrome.publishedZoneLab.loading',
  loaded: 'hudChrome.publishedZoneLab.loaded',
  unloaded: 'hudChrome.publishedZoneLab.unloaded',
  invalid: 'hudChrome.publishedZoneLab.invalid',
};

export class PublishedZoneLabIndicator {
  private readonly root: HTMLDivElement;
  private readonly title: HTMLElement;
  private readonly zone: HTMLSpanElement;
  private readonly status: HTMLSpanElement;
  private readonly abort = new AbortController();
  private state: PublishedZoneLabIndicatorState = 'inactive';

  constructor(
    private readonly documentRef: Document,
    mount: HTMLElement,
    private readonly zoneId: string,
  ) {
    this.root = documentRef.createElement('div');
    this.root.className = 'published-zone-lab-indicator';
    this.root.setAttribute('role', 'status');
    this.root.setAttribute('aria-live', 'polite');
    this.title = documentRef.createElement('strong');
    this.zone = documentRef.createElement('span');
    this.status = documentRef.createElement('span');
    this.status.className = 'published-zone-lab-state';
    this.root.append(this.title, this.zone, this.status);
    mount.append(this.root);
    this.render();
    this.documentRef.addEventListener('woc:languagechange', () => this.render(), {
      signal: this.abort.signal,
    });
  }

  update(state: PublishedZoneLabIndicatorState): void {
    if (state === this.state) return;
    this.state = state;
    this.render();
  }

  dispose(): void {
    this.abort.abort();
    this.root.remove();
  }

  private render(): void {
    this.title.textContent = t('hudChrome.publishedZoneLab.title');
    this.zone.textContent = t('hudChrome.publishedZoneLab.zoneId', { zoneId: this.zoneId });
    this.status.textContent = t(STATE_KEYS[this.state]);
    this.root.dataset.state = this.state;
  }
}
