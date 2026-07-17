import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ui = readFileSync('src/render/nature_placement_lab/placement_ui.ts', 'utf8');
const controller = readFileSync('src/render/nature_placement_lab/placement_controller.ts', 'utf8');
const catalog = readFileSync('src/ui/i18n.catalog/hud_chrome.ts', 'utf8');
const french = readFileSync('src/ui/i18n.locales/fr_FR.ts', 'utf8');

describe('Nature Placement Lab localization', () => {
  it('covers the visible chrome in English and French and relocalizes live', () => {
    const keys = [...ui.matchAll(/hudChrome\.naturePlacementLab\.([A-Za-z0-9]+)/g)].map(
      (match) => match[1],
    );
    for (const key of new Set(keys)) {
      expect(catalog).toMatch(new RegExp(`\\b${key}:`));
      expect(french).toContain(`'hudChrome.naturePlacementLab.${key}'`);
    }
    expect(ui).toContain("'woc:languagechange'");
    expect(ui).toContain('relocalizeChrome');
    expect(controller).toContain('languageChanged');
  });

  it('keeps internal identifiers and imported JSON handling untouched', () => {
    expect(controller).toContain('projectId');
    expect(controller).toContain('layerId');
    expect(controller).toContain('groupId');
    expect(controller).toContain('assetId');
    expect(controller).toContain('parseNaturePlacementProjectJson');
  });
});
