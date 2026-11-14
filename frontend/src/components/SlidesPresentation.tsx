import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { useTranslation } from '../i18n'
import { splitSlides } from '../utils/slides'
import type { DirectoryTree } from '../types'
import { ViewMode } from './ViewMode'
import './SlidesPresentation.css'

export interface SlidesPresentationProps {
  /** Markdown of the note; `---` lines separate the slides. */
  content: string
  vaultId: string
  directoryTree: DirectoryTree | null
  sourcePath: string
  onClose: () => void
}

/**
 * Full-screen presentation of one note. Navigate with the arrow keys, Space,
 * PageUp/PageDown, Home/End; Escape closes it.
 */
export function SlidesPresentation({ content, vaultId, directoryTree, sourcePath, onClose }: SlidesPresentationProps) {
  const { t } = useTranslation()
  const slides = useMemo(() => splitSlides(content), [content])
  const [index, setIndex] = useState(0)
  const last = Math.max(0, slides.length - 1)
  const containerRef = useFocusTrap<HTMLDivElement>({ isActive: true, onEscape: onClose, returnFocusOnDeactivate: true })

  const go = useCallback((target: number) => setIndex(Math.min(last, Math.max(0, target))), [last])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      // A focused button handles Space itself; do not advance as well.
      if (e.key === ' ' && e.target instanceof HTMLButtonElement) return
      switch (e.key) {
        case 'ArrowRight': case 'ArrowDown': case 'PageDown': case ' ':
          e.preventDefault(); go(index + 1); break
        case 'ArrowLeft': case 'ArrowUp': case 'PageUp':
          e.preventDefault(); go(index - 1); break
        case 'Home': e.preventDefault(); go(0); break
        case 'End': e.preventDefault(); go(last); break
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [go, index, last])

  return createPortal(
    <div ref={containerRef} className="slides-overlay" role="dialog" aria-modal="true" aria-label={t('slides.title')}>
      <button type="button" className="slides-close" onClick={onClose} aria-label={t('slides.close')}>
        <X size={18} />
      </button>
      <div className="slides-stage" aria-live="polite">
        {slides.length === 0 ? (
          <p className="slides-empty">{t('slides.empty')}</p>
        ) : (
          <div className="slides-slide">
            <ViewMode content={slides[index] ?? ''} vaultId={vaultId} directoryTree={directoryTree} sourcePath={sourcePath} />
          </div>
        )}
      </div>
      <div className="slides-controls">
        <button type="button" onClick={() => go(index - 1)} disabled={index <= 0} aria-label={t('slides.previous')}>
          <ChevronLeft size={18} />
        </button>
        <span className="slides-counter">{slides.length === 0 ? 0 : index + 1} / {slides.length}</span>
        <button type="button" onClick={() => go(index + 1)} disabled={index >= last} aria-label={t('slides.next')}>
          <ChevronRight size={18} />
        </button>
      </div>
    </div>,
    document.body,
  )
}
