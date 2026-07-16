import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const html = readFileSync(new URL('../public/server-unavailable.html', import.meta.url), 'utf8');

describe('server unavailable fallback page', () => {
  it('uses a text-only brand treatment and clear downtime copy', () => {
    expect(html).toContain('/loading-screen.jpg');
    expect(html).toContain('<p class="logo" data-i18n="logoAlt">World of CodexCraft</p>');
    expect(html).toContain('The realm is temporarily unavailable.');
    expect(html).toContain('Back soon');
    expect(html).toContain('http-equiv="refresh" content="30"');
  });
});
