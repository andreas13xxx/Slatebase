import type { DirectoryTree } from '../types'
import type { PublicEmbedView } from './types'

/** Splits an embed reference into its file target (without `#heading` / `#^block`). */
function targetOf(ref: string): string {
  const hash = ref.indexOf('#')
  return hash === -1 ? ref : ref.slice(0, hash)
}

/**
 * Builds the file tree the reading view resolves embed targets against, from the embeds the
 * server resolved. Paths are the targets as written (notes get `.md` appended when the target
 * has no extension), so resolving `![[Inner]]` yields `Inner.md` and `![[img/pic.png]]` yields
 * `img/pic.png`, which is also the `ref` of the asset URL. Embeds the server could not resolve
 * are left out, so they render as "not available".
 */
export function buildPublicTree(embeds: Record<string, PublicEmbedView>): DirectoryTree {
  const files = new Map<string, DirectoryTree>()

  for (const [ref, embed] of Object.entries(embeds)) {
    if (embed.kind === 'unavailable') continue
    const target = targetOf(ref)
    if (target === '') continue
    const hasExtension = /\.[A-Za-z0-9]+$/.test(target.slice(target.lastIndexOf('/') + 1))
    const path = embed.kind === 'note' && !hasExtension ? `${target}.md` : target
    if (files.has(path)) continue
    files.set(path, { name: path.slice(path.lastIndexOf('/') + 1), type: 'file', path })
  }

  return { name: '', type: 'directory', path: '', children: [...files.values()] }
}
