import { describe, expect, it } from 'vitest';
import { createBrowserPathShim } from './browser-path-shim';

describe('createBrowserPathShim', () => {
  const path = createBrowserPathShim();

  it('normalizes and joins vault-relative paths', () => {
    expect(path.normalize('notes//daily/../today.md')).toBe('notes/today.md');
    expect(path.join('/vault', 'attachments', '../image.png')).toBe('/vault/image.png');
  });

  it('resolves paths from the browser-safe root', () => {
    expect(path.resolve('notes', '../attachments/image.png')).toBe('/attachments/image.png');
    expect(path.relative('/notes/daily', '/notes/attachments/image.png')).toBe('../attachments/image.png');
  });

  it('provides common filename helpers', () => {
    expect(path.dirname('/notes/today.md')).toBe('/notes');
    expect(path.basename('/notes/today.md')).toBe('today.md');
    expect(path.extname('/notes/today.md')).toBe('.md');
  });
});
