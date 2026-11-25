/**
 * The undocumented `App` members every plugin-facing `app` shares (app-internals.ts): the same API
 * through an `AppShim` and through the bootstrap `window.app` stub, honest answers for what a browser
 * cannot do.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShim } from './shims/app-shim';
import { installObsidianGlobals } from './install-globals';
import { APP_INTERNAL_NAMES, createAppInternals } from './app-internals';
import { setFoldVault } from '../../editor/foldPersistence';
import { resetLogDedup } from './log';

function makeApp(binary = vi.fn(async (path: string) => ({ path }))) {
  const stub = { on: vi.fn(), off: vi.fn() } as never;
  const vault = { on: vi.fn(), off: vi.fn(), createBinary: binary } as never;
  const app = AppShim.wrapWithProxy(new AppShim({ vault, workspace: stub, metadataCache: stub, pluginId: 'p' }));
  return { app: app as AppShim & Record<string, any>, binary }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

describe('app internals', () => {
  beforeEach(() => {
    resetLogDedup();
    setFoldVault('vault1');
  });
  afterEach(() => {
    setFoldVault(null);
    vi.restoreAllMocks();
  });

  it('provides every listed member through an AppShim without a gap warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { app } = makeApp();
    for (const name of APP_INTERNAL_NAMES) expect(app[name], name).toBeDefined();
    expect(warn).not.toHaveBeenCalled();
  });

  it('provides the same members on the window.app stub', () => {
    installObsidianGlobals();
    const stub = (window as unknown as { app: Record<string, unknown> }).app;
    for (const name of APP_INTERNAL_NAMES) expect(stub[name], name).toBeDefined();
  });

  it('builds a deep link for getObsidianUrl, from a file or a path', () => {
    const { app } = makeApp();
    const url = app.getObsidianUrl({ path: 'Folder/Note.md' }) as string;
    expect(url).toContain('/open?');
    expect(url).toContain('vault=vault1');
    expect(decodeURIComponent(url)).toContain('file=Folder/Note.md');
    expect(app.getObsidianUrl('Folder/Note.md')).toBe(url);
  });

  it('warns and returns an empty link when no vault is open', () => {
    setFoldVault(null);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(makeApp().app.getObsidianUrl('A.md')).toBe('');
    expect(warn).toHaveBeenCalled();
  });

  it('puts a wikilink on the drag when a file is dragged', () => {
    const { app } = makeApp();
    const setData = vi.fn();
    const evt = { dataTransfer: { setData, effectAllowed: 'none' } } as unknown as DragEvent;
    const draggable = app.dragManager.dragFile(evt, { path: 'Folder/Note.md' });
    expect(setData).toHaveBeenCalledWith('text/plain', '[[Folder/Note]]');
    expect(draggable).toMatchObject({ source: 'file', title: 'Folder/Note.md' });
  });

  it('answers truthfully for features Slatebase does not have', () => {
    const { app } = makeApp();
    expect(app.isVimEnabled()).toBe(false);
    expect(typeof app.getBaseFontSize()).toBe('number');
  });

  it('warns for desktop-only methods instead of failing silently', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { app } = makeApp();
    expect(app.openWithDefaultApp({ path: 'a.pdf' })).toBeUndefined();
    app.showInFolder('a.pdf');
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('keeps `title` live', () => {
    const internals = createAppInternals();
    document.title = 'first';
    expect(internals['title']).toBe('first');
    document.title = 'second';
    expect(internals['title']).toBe('second');
  });

  it('saves an attachment at the path the vault setting dictates', async () => {
    const binary = vi.fn(async (path: string) => ({ path }));
    const { app } = makeApp(binary);
    vi.spyOn(app.fileManager, 'getAvailablePathForAttachment').mockResolvedValue('attachments/scan.png');
    const data = new ArrayBuffer(4);
    await expect(app.saveAttachment('scan', 'png', data)).resolves.toEqual({ path: 'attachments/scan.png' });
    expect(binary).toHaveBeenCalledWith('attachments/scan.png', data);
  });
});
