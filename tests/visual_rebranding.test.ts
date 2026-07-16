import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '..');
const read = (relativePath: string): string =>
  readFileSync(path.join(root, relativePath), 'utf8');

const publicPages = [
  'public/data-deletion.html',
  'public/links.html',
  'public/merch.html',
  'public/press.html',
  'public/privacy.html',
  'public/server-unavailable.html',
  'public/support.html',
  'public/terms.html',
] as const;

const mainWebSurfaces = [
  'index.html',
  'play.html',
  'guide.html',
  'admin.html',
  'editor.html',
  ...publicPages,
  'src/guide/chrome.ts',
  'src/guide/head.ts',
  'src/main.ts',
  'src/ui/player_card.ts',
] as const;

const legacyBrandAssetNames = [
  ['worldof', ['claude', 'craft'].join(''), '-logo.png'].join(''),
  ['woc', '-logo-guide.webp'].join(''),
  ['woc', '-logo-hero.webp'].join(''),
  ['woc', '-logo-square.webp'].join(''),
  ['woc', '_logo_square.webp'].join(''),
  ['woc', '-loading-screen.jpg'].join(''),
  'favicon.ico',
  'favicon-32x32.png',
  'favicon-16x16.png',
  'icon-192.png',
  'icon-512.png',
  'apple-touch-icon.png',
] as const;

const legacyLongName = ['World of', ['Claude', 'Craft'].join('')].join(' ');
const legacyShortName = ['Claude', 'Craft'].join('');

const playerReadmes = [
  'README.md',
  ...readdirSync(path.join(root, 'docs/i18n'))
    .filter((name) => /^README\..+\.md$/.test(name))
    .map((name) => `docs/i18n/${name}`),
] as const;

function localeSources(directory: string): string[] {
  return readdirSync(path.join(root, directory))
    .filter((name) => name.endsWith('.ts'))
    .map((name) => `${directory}/${name}`);
}

describe('phase 2 visual rebranding', () => {
  it('uses the new long and short names in page and application metadata', () => {
    expect(read('index.html')).toContain('<title data-i18n="seo.title">World of CodexCraft:');
    expect(read('guide.html')).toContain('<meta property="og:site_name" content="World of CodexCraft"');

    const manifest = JSON.parse(read('public/manifest.webmanifest')) as {
      name: string;
      short_name: string;
      description: string;
    };
    expect(manifest).toMatchObject({
      name: 'World of CodexCraft',
      short_name: 'CodexCraft',
      description: 'World of CodexCraft mobile realm',
    });

    const packageJson = JSON.parse(read('package.json')) as {
      name: string;
      build: { appId: string; productName: string; protocols: { schemes: string[] }[] };
    };
    expect(packageJson.build.productName).toBe('World of CodexCraft');
    expect(packageJson.name).toBe('world-of-claudecraft');
    const compactLegacy = ['worldof', ['claude', 'craft'].join('')].join('');
    expect(packageJson.build.appId).toBe(['com', compactLegacy, 'desktop'].join('.'));
    expect(packageJson.build.protocols[0]?.schemes).toEqual([compactLegacy]);
  });

  it('removes legacy logos from main web surfaces while retaining rollback files', () => {
    for (const relativePath of mainWebSurfaces) {
      expect(read(relativePath).toLowerCase(), relativePath).not.toContain(legacyLongName.toLowerCase());
      for (const legacyAsset of legacyBrandAssetNames) {
        expect(read(relativePath), `${relativePath}: ${legacyAsset}`).not.toContain(legacyAsset);
      }
    }

    for (const relativePath of playerReadmes) {
      const source = read(relativePath);
      expect(source.toLowerCase(), relativePath).not.toContain(legacyLongName.toLowerCase());
      for (const legacyAsset of legacyBrandAssetNames) {
        expect(source, `${relativePath}: ${legacyAsset}`).not.toContain(legacyAsset);
      }
    }

    for (const relativePath of [
      'mediawiki/LocalSettings.php',
      'mediawiki/theme/Common.css',
      'mediawiki/seed/pages.xml',
    ]) {
      const source = read(relativePath);
      for (const legacyAsset of legacyBrandAssetNames) {
        expect(source, `${relativePath}: ${legacyAsset}`).not.toContain(legacyAsset);
      }
    }

    expect(read('mediawiki/LocalSettings.php')).toContain("$wgSitename = 'World of CodexCraft Wiki'");
    expect(read('mediawiki/seed/pages.xml')).toContain('&lt;h1&gt;World of CodexCraft Wiki&lt;/h1&gt;');

    for (const asset of [
      ['public/', legacyBrandAssetNames[1]].join(''),
      ['public/', legacyBrandAssetNames[2]].join(''),
      ['public/', legacyBrandAssetNames[4]].join(''),
      ['public/', legacyBrandAssetNames[0]].join(''),
      ['woc', '_community.png'].join(''),
      ['worldof', 'claude.png'].join(''),
    ]) {
      expect(() => readFileSync(path.join(root, asset)), asset).not.toThrow();
    }
  });

  it('keeps the new brand byte-identical in every authored UI and admin locale', () => {
    const sources = [
      'src/ui/i18n.catalog/editor.ts',
      'src/ui/i18n.catalog/guide.ts',
      'src/ui/i18n.catalog/hud_chrome.ts',
      'src/ui/i18n.catalog/index.ts',
      'src/ui/i18n.catalog/shell.ts',
      'src/admin/i18n.en.ts',
      ...localeSources('src/ui/i18n.locales'),
      ...localeSources('src/admin/i18n.locales'),
    ];

    for (const relativePath of sources) {
      const source = read(relativePath);
      expect(source.toLowerCase(), relativePath).not.toContain(legacyLongName.toLowerCase());
      expect(source, relativePath).not.toContain(legacyShortName);
    }

    expect(read('src/ui/i18n.catalog/guide.ts')).toContain("brand: 'World of CodexCraft'");
    expect(read('src/ui/i18n.catalog/guide.ts')).toContain("brandShort: 'CodexCraft'");
  });

  it('preserves application, protocol, domain, storage, and native bundle identities', () => {
    const compactLegacy = ['worldof', ['claude', 'craft'].join('')].join('');
    expect(read('capacitor.config.ts')).toContain(`appId: 'com.${compactLegacy}'`);
    expect(read('electron/main.cjs')).toContain(`const APP_ORIGIN = 'app://${compactLegacy}'`);
    expect(read('electron/main.cjs')).toContain(`const deepLinkProtocol = '${compactLegacy}'`);
    expect(read('android/app/build.gradle')).toContain(`applicationId "com.${compactLegacy}"`);
    expect(read('ios/App/App.xcodeproj/project.pbxproj')).toContain(
      `PRODUCT_BUNDLE_IDENTIFIER = com.${compactLegacy};`,
    );
    expect(read('src/main.ts')).toContain(`const SITE_URL = 'https://${compactLegacy}.com/'`);
    expect(read('src/admin/api.ts')).toContain(
      `const TOKEN_KEY = '${legacyShortName.toLowerCase()}_admin_token'`,
    );
  });

  it('pins visible native, desktop, bot, and recovery-code labels to the new brand', () => {
    expect(read('capacitor.config.ts')).toContain("appName: 'World of CodexCraft'");
    expect(read('android/app/src/main/res/values/strings.xml')).toContain(
      '<string name="app_name">World of CodexCraft</string>',
    );
    expect(read('ios/App/App/Info.plist')).toContain('<string>World of CodexCraft</string>');
    expect(read('electron/main.cjs')).toContain("title: 'World of CodexCraft'");
    expect(read('electron/shell_strings.cjs')).toContain("fatalTitle: 'World of CodexCraft'");
    expect(read('src/ui/two_factor_setup.ts')).toContain("brand = 'World of CodexCraft'");
    expect(read('bot/logic.ts')).toContain('World of CodexCraft');
  });
});
