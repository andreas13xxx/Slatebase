import { describe, it, expect, vi, afterEach } from 'vitest';
import { FileManagerShim } from './file-manager-shim';
import type { IVaultShim, TFile } from '../types';

function makeFile(path: string): TFile {
  const name = path.slice(path.lastIndexOf('/') + 1);
  return { path, name, basename: name, extension: 'md', stat: { mtime: 0, ctime: 0, size: 0 }, parent: null };
}

function makeShim(trash: () => Promise<void>) {
  const vault = { trash: vi.fn(trash) } as unknown as IVaultShim;
  return { shim: new FileManagerShim(vault), vault };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('FileManagerShim.trashFile (Obsidian 1.15.1)', () => {
  it('resolves to true when the file was trashed', async () => {
    const { shim, vault } = makeShim(async () => {});
    const file = makeFile('a.md');
    await expect(shim.trashFile(file)).resolves.toBe(true);
    expect(vault.trash).toHaveBeenCalledWith(file);
  });

  it('resolves to false (and does not throw) when trashing fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { shim } = makeShim(async () => {
      throw new Error('boom');
    });
    await expect(shim.trashFile(makeFile('a.md'))).resolves.toBe(false);
    expect(warn).toHaveBeenCalled();
  });
});

describe('FileManagerShim.promptForDeletion (Obsidian 1.15.1)', () => {
  it('resolves to false and trashes nothing when the user cancels', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { shim, vault } = makeShim(async () => {});
    await expect(shim.promptForDeletion(makeFile('a.md'))).resolves.toBe(false);
    expect(vault.trash).not.toHaveBeenCalled();
  });

  it('trashes the file after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { shim, vault } = makeShim(async () => {});
    await expect(shim.promptForDeletion(makeFile('a.md'))).resolves.toBe(true);
    expect(vault.trash).toHaveBeenCalledTimes(1);
  });

  it('resolves to false when trashing fails after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { shim } = makeShim(async () => {
      throw new Error('boom');
    });
    await expect(shim.promptForDeletion(makeFile('a.md'))).resolves.toBe(false);
  });

  it('is exposed through the proxy without being recorded as a gap', () => {
    const { shim } = makeShim(async () => {});
    const proxied = FileManagerShim.wrapWithProxy(shim);
    expect(typeof proxied.promptForDeletion).toBe('function');
  });
});
