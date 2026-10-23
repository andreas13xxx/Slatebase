/**
 * The reading view renders a shared note through the same code as the app, which addresses
 * content by `vaultId`. A public share has no vault the reader may touch, so it passes a
 * synthetic vault ID instead: `public-share:<token>`. The few places that would otherwise
 * build an authenticated vault URL or fetch with the session recognize it and use the
 * public share instead.
 */
export const PUBLIC_VAULT_PREFIX = 'public-share:'

/** Synthetic vault ID for the reading view of a public share. */
export function toPublicVaultId(token: string): string {
  return `${PUBLIC_VAULT_PREFIX}${token}`
}

/** The share token if `vaultId` is a synthetic public-share ID, else `null`. */
export function parsePublicVaultId(vaultId: string): string | null {
  return vaultId.startsWith(PUBLIC_VAULT_PREFIX) ? vaultId.slice(PUBLIC_VAULT_PREFIX.length) : null
}

/** URL of an embedded asset of a public share; `ref` is the embed reference as written in the note. */
export function publicAssetUrl(token: string, ref: string): string {
  return `/api/v1/public/s/${encodeURIComponent(token)}/asset?ref=${encodeURIComponent(ref)}`
}

/** Key of an embed in the server's `embeds` map: `target`, `target#heading` or `target#^block`. */
export function embedRef(target: string, heading: string | null, blockRef: string | null): string {
  if (blockRef) return `${target}#^${blockRef}`
  if (heading) return `${target}#${heading}`
  return target
}

/** Extracts the token from the public page path `/s/<token>`, or `null` for any other path. */
export function tokenFromPath(pathname: string): string | null {
  const match = /^\/s\/([A-Za-z0-9_-]+)\/?$/.exec(pathname)
  return match?.[1] ?? null
}
