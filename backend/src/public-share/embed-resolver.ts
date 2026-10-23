// ─── Public Share Links — Embed resolver ─────────────────────────────────────

import path from 'node:path'
import { getContentTypeFromExtension } from '../vault/mime.js'
import { resolveWikilinkTargetOnTree } from '../link-index/link-match-resolver.js'
import {
  extractBlockById,
  extractEmbeds,
  extractHeadingSection,
  stripFrontmatter,
  type ParsedEmbed,
} from './embed-extraction.js'
import {
  DEFAULT_EMBED_LIMITS,
  type EmbedResolverLimits,
  type EmbedUnavailableReason,
  type IPublicShareVaultAccess,
  type PublicEmbedView,
  type ResolvedEmbed,
  type ResolvedEmbeds,
} from './types.js'

/** Extensions delivered as assets (kept in step with frontend/src/plugins/types.ts). */
const ASSET_EXTENSIONS: ReadonlySet<string> = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.avif', '.bmp',
  '.pdf',
  '.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac', '.wma',
  '.mp4', '.webm', '.ogv', '.mov', '.mkv',
])

/** Targets that pull data from the rest of the vault or need the app; never inlined. */
const UNSUPPORTED_EXTENSIONS: ReadonlySet<string> = new Set(['.base', '.canvas'])

function hasHiddenSegment(p: string): boolean {
  return p.split(/[\\/]/).some((segment) => segment.startsWith('.'))
}

function unavailable(reason: EmbedUnavailableReason): ResolvedEmbed {
  return { kind: 'unavailable', reason }
}

interface QueueItem {
  markdown: string
  /** Nesting level of the note whose markdown this is (the shared note is 0). */
  depth: number
  /** Paths of the notes from the shared note down to this one. */
  ancestors: ReadonlySet<string>
}

/**
 * Resolves the embeds of a shared note, recursively.
 *
 * - Embeds are keyed by their reference as written (`embedRef`). The same
 *   reference resolves once, at its shallowest occurrence.
 * - Targets resolve against the vault tree without a source folder, exactly
 *   like the reading view does for embeds.
 * - Notes are inlined (frontmatter stripped, heading/block excerpt applied) up
 *   to `limits.maxDepth` levels; cycles, hidden paths, `.base`/`.canvas` and
 *   anything over the size/count limits become `unavailable`.
 * - Assets are only listed; their bytes are read later by `readAsset`.
 *
 * @param rootPath - Vault path of the shared note (counts as its own ancestor).
 * @param markdown - Markdown of the shared note, frontmatter already stripped.
 */
export async function resolveEmbeds(
  vaultId: string,
  rootPath: string,
  markdown: string,
  access: IPublicShareVaultAccess,
  limits: EmbedResolverLimits = DEFAULT_EMBED_LIMITS,
): Promise<ResolvedEmbeds> {
  // A Map, not an object: refs come from user content and may be `__proto__`.
  const result = new Map<string, ResolvedEmbed>()
  const tree = await access.getTree(vaultId)
  let totalChars = 0
  let count = 0

  const queue: QueueItem[] = [{ markdown, depth: 0, ancestors: new Set([rootPath]) }]

  for (let item = queue.shift(); item !== undefined; item = queue.shift()) {
    for (const embed of extractEmbeds(item.markdown)) {
      if (result.has(embed.ref)) continue

      if (count >= limits.maxEmbeds) {
        result.set(embed.ref, unavailable('too-large'))
        continue
      }
      count++

      const outcome = await resolveOne(embed, item, tree, vaultId, access, limits, totalChars)
      result.set(embed.ref, outcome.embed)
      if (outcome.embed.kind === 'note') {
        totalChars += outcome.embed.markdown.length
        queue.push({
          markdown: outcome.embed.markdown,
          depth: item.depth + 1,
          ancestors: new Set([...item.ancestors, outcome.path]),
        })
      }
    }
  }

  return Object.fromEntries(result)
}

async function resolveOne(
  embed: ParsedEmbed,
  from: QueueItem,
  tree: Awaited<ReturnType<IPublicShareVaultAccess['getTree']>>,
  vaultId: string,
  access: IPublicShareVaultAccess,
  limits: EmbedResolverLimits,
  totalChars: number,
): Promise<{ embed: ResolvedEmbed; path: string }> {
  const fail = (reason: EmbedUnavailableReason) => ({ embed: unavailable(reason), path: '' })

  if (hasHiddenSegment(embed.target)) return fail('hidden')

  const targetExt = path.extname(embed.target).toLowerCase()
  if (UNSUPPORTED_EXTENSIONS.has(targetExt)) return fail('unsupported')

  if (tree === null) return fail('unreadable')

  const resolved = resolveWikilinkTargetOnTree(embed.target, tree, '')
  if (resolved === null) return fail('missing')
  if (hasHiddenSegment(resolved)) return fail('hidden')

  const ext = path.extname(resolved).toLowerCase()
  if (UNSUPPORTED_EXTENSIONS.has(ext)) return fail('unsupported')

  if (ASSET_EXTENSIONS.has(ext)) {
    return {
      embed: { kind: 'asset', path: resolved, contentType: getContentTypeFromExtension(resolved) },
      path: resolved,
    }
  }
  if (ext !== '.md') return fail('unsupported')

  if (from.depth + 1 > limits.maxDepth) return fail('depth')
  if (from.ancestors.has(resolved)) return fail('cycle')

  const text = await access.readText(vaultId, resolved)
  if (text === null) return fail('unreadable')

  let content = stripFrontmatter(text)
  if (embed.blockRef !== null) {
    const block = extractBlockById(content, embed.blockRef)
    if (block === null) return fail('missing')
    content = block
  } else if (embed.heading !== null) {
    content = extractHeadingSection(content, embed.heading)
  }

  if (totalChars + content.length > limits.maxTotalChars) return fail('too-large')

  return { embed: { kind: 'note', markdown: content }, path: resolved }
}

/** Projects resolved embeds to what the public reader may see: no paths, no failure reasons. */
export function toPublicEmbeds(embeds: ResolvedEmbeds): Record<string, PublicEmbedView> {
  return Object.fromEntries(
    Object.entries(embeds).map(([ref, embed]): [string, PublicEmbedView] => {
      switch (embed.kind) {
        case 'note':
          return [ref, { kind: 'note', markdown: embed.markdown }]
        case 'asset':
          return [ref, { kind: 'asset', contentType: embed.contentType }]
        case 'unavailable':
          return [ref, { kind: 'unavailable' }]
      }
    }),
  )
}
