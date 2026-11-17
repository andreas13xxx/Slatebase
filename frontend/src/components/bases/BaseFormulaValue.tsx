/**
 * BaseFormulaValue — renders one evaluated formula value in a Bases view.
 *
 * Most values are plain text (`formatFormulaValue`). Three are not: `html(...)`
 * is rendered as sanitized HTML, `icon(...)` as the Lucide icon of that name and
 * `image(...)` as the picture behind a vault path or http(s) URL. A list holding
 * such values renders each element in turn.
 *
 * The HTML comes from a `.base` file, which anyone with write access to the
 * vault controls: it goes through the same DOMPurify step as plugin-rendered
 * Markdown (no scripts, event handlers, inline CSS or forms).
 */

import { Fragment, memo, useContext } from 'react'
import type { ReactNode } from 'react'
import { formatFormulaValue, isHtml, isIcon, isImage } from '@slatebase/shared-contracts'
import type { FormulaValue } from '@slatebase/shared-contracts'
import { AppContext } from '../../state'
import { resolveWikilinkTarget } from '../../plugins/link-resolver'
import { sanitizeRenderedHtml } from '../../plugins/compat/sanitize-rendered-html'
import { resolveIconMarkupSync } from '../../plugins/compat/lucide-icons'
import { useIconResolutionTick } from '../../utils/pluginIcon'
import { parseCardImage, vaultImageSrc } from './cardImage'

const ICON_SIZE_PX = 16

export interface BaseFormulaValueProps {
  value: FormulaValue
  /** Vault the row belongs to; without it a vault image shows its path as text. */
  vaultId?: string | undefined
  /** Path of the row's note, so a bare image name resolves like a link written in that note. */
  sourcePath?: string | undefined
}

/** True when the value (or an element of a list) renders as something other than text. */
function isRich(value: FormulaValue): boolean {
  if (Array.isArray(value)) return value.some(isRich)
  return isHtml(value) || isIcon(value) || isImage(value)
}

const IconValueView = memo(function IconValueView({ name }: { name: string }) {
  // The icon set loads per icon on demand: re-render once this one has arrived.
  useIconResolutionTick()
  const markup = name ? resolveIconMarkupSync(name, ICON_SIZE_PX) : null
  // Unknown or still loading: the name is the honest stand-in.
  if (!markup) return <span className="bases-value-icon bases-value-icon--text">{name}</span>
  return <span className="bases-value-icon" role="img" aria-label={name} dangerouslySetInnerHTML={{ __html: markup }} />
})

const ImageValueView = memo(function ImageValueView({ path, vaultId, sourcePath }: { path: string; vaultId?: string | undefined; sourcePath?: string | undefined }) {
  const tree = useContext(AppContext)?.state.directoryTree ?? null
  const image = parseCardImage(path)
  let src: string | null = null
  if (image?.kind === 'url') src = image.src
  else if (image?.kind === 'file' && vaultId) src = vaultImageSrc(vaultId, resolveWikilinkTarget(image.target, tree, sourcePath) ?? image.target)
  if (!src) return <>{path}</>
  return <img className="bases-value-image" src={src} alt="" loading="lazy" />
})

export const BaseFormulaValue = memo(function BaseFormulaValue({ value, vaultId, sourcePath }: BaseFormulaValueProps): ReactNode {
  if (!isRich(value)) return formatFormulaValue(value)
  if (Array.isArray(value)) {
    // A value list has no identity besides its position, so the index is the key.
    return value.map((item, i) => (
      <Fragment key={i}>
        {i > 0 && ', '}
        <BaseFormulaValue value={item} vaultId={vaultId} sourcePath={sourcePath} />
      </Fragment>
    ))
  }
  if (isHtml(value)) return <span className="bases-value-html" dangerouslySetInnerHTML={{ __html: sanitizeRenderedHtml(value.html) }} />
  if (isIcon(value)) return <IconValueView name={value.name} />
  if (isImage(value)) return <ImageValueView path={value.path} vaultId={vaultId} sourcePath={sourcePath} />
  return formatFormulaValue(value)
})
