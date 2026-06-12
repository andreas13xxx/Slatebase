/**
 * Compares two semantic version strings (X.Y.Z format).
 * Returns -1 if a < b, 0 if a === b, 1 if a > b.
 * Strips leading 'v' prefix if present.
 */
export function compareSemver(a: string, b: string): -1 | 0 | 1 {
  const parse = (v: string): [number, number, number] => {
    const cleaned = v.startsWith('v') ? v.slice(1) : v;
    const [major, minor, patch] = cleaned.split('.').map(Number);
    return [major ?? 0, minor ?? 0, patch ?? 0];
  };

  const [aMajor, aMinor, aPatch] = parse(a);
  const [bMajor, bMinor, bPatch] = parse(b);

  if (aMajor !== bMajor) return aMajor > bMajor ? 1 : -1;
  if (aMinor !== bMinor) return aMinor > bMinor ? 1 : -1;
  if (aPatch !== bPatch) return aPatch > bPatch ? 1 : -1;
  return 0;
}
