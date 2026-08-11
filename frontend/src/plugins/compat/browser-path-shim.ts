/**
 * A browser-safe subset of Node's POSIX `path` module for mobile-compatible
 * Obsidian plugins. It only transforms path strings; it never grants file
 * system access.
 */

export interface BrowserPathShim {
  readonly sep: '/';
  readonly delimiter: ':';
  normalize(path: string): string;
  join(...paths: string[]): string;
  resolve(...paths: string[]): string;
  isAbsolute(path: string): boolean;
  relative(from: string, to: string): string;
  dirname(path: string): string;
  basename(path: string, suffix?: string): string;
  extname(path: string): string;
  parse(path: string): { root: string; dir: string; base: string; ext: string; name: string };
  format(pathObject: { dir?: string; root?: string; base?: string; name?: string; ext?: string }): string;
  readonly posix: BrowserPathShim;
  readonly win32: BrowserPathShim;
}

function normalizeSegments(path: string, allowAboveRoot: boolean): string[] {
  const result: string[] = [];
  for (const segment of path.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (result.length > 0 && result[result.length - 1] !== '..') result.pop();
      else if (allowAboveRoot) result.push('..');
    } else {
      result.push(segment);
    }
  }
  return result;
}

/** Creates a POSIX path module suitable for use by browser-evaluated plugins. */
export function createBrowserPathShim(): BrowserPathShim {
  const normalize = (path: string): string => {
    if (!path) return '.';
    const value = path.replace(/\\/g, '/');
    const absolute = value.startsWith('/');
    const trailingSeparator = value.endsWith('/');
    const normalized = normalizeSegments(value, !absolute).join('/');
    if (!normalized) return absolute ? '/' : '.';
    return `${absolute ? '/' : ''}${normalized}${trailingSeparator ? '/' : ''}`;
  };

  const join = (...paths: string[]): string => {
    const filtered = paths.filter(Boolean);
    return filtered.length === 0 ? '.' : normalize(filtered.join('/'));
  };

  const resolve = (...paths: string[]): string => {
    let resolved = '';
    for (let index = paths.length - 1; index >= 0; index -= 1) {
      const path = paths[index];
      if (!path) continue;
      resolved = `${path.replace(/\\/g, '/')}/${resolved}`;
      if (path.startsWith('/')) break;
    }
    const normalized = normalize(`/${resolved}`);
    return normalized === '/' ? normalized : normalized.replace(/\/+$/, '');
  };

  const isAbsolute = (path: string): boolean => path.startsWith('/');
  const dirname = (path: string): string => {
    const value = normalize(path).replace(/\/$/, '');
    const index = value.lastIndexOf('/');
    if (index < 0) return '.';
    return index === 0 ? '/' : value.slice(0, index);
  };
  const basename = (path: string, suffix?: string): string => {
    let value = normalize(path).replace(/\/$/, '');
    value = value.slice(value.lastIndexOf('/') + 1);
    return suffix && value.endsWith(suffix) ? value.slice(0, -suffix.length) : value;
  };
  const extname = (path: string): string => {
    const base = basename(path);
    const index = base.lastIndexOf('.');
    return index <= 0 ? '' : base.slice(index);
  };
  const parse = (path: string) => {
    const base = basename(path);
    const ext = extname(base);
    return { root: isAbsolute(path) ? '/' : '', dir: dirname(path), base, ext, name: ext ? base.slice(0, -ext.length) : base };
  };
  const format = (pathObject: { dir?: string; root?: string; base?: string; name?: string; ext?: string }): string => {
    const base = pathObject.base ?? `${pathObject.name ?? ''}${pathObject.ext ?? ''}`;
    const dir = pathObject.dir ?? pathObject.root ?? '';
    return dir ? join(dir, base) : base;
  };
  const relative = (from: string, to: string): string => {
    const fromParts = normalize(resolve(from)).slice(1).split('/').filter(Boolean);
    const toParts = normalize(resolve(to)).slice(1).split('/').filter(Boolean);
    while (fromParts[0] && fromParts[0] === toParts[0]) {
      fromParts.shift();
      toParts.shift();
    }
    return [...fromParts.map(() => '..'), ...toParts].join('/');
  };

  const shim = { sep: '/' as const, delimiter: ':' as const, normalize, join, resolve, isAbsolute, relative, dirname, basename, extname, parse, format };
  return { ...shim, posix: shim as BrowserPathShim, win32: shim as BrowserPathShim };
}
