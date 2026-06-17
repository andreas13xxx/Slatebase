import { useRef, useEffect } from 'react'
import './LineNumbers.css'

/**
 * Props for the LineNumbers component.
 */
export interface LineNumbersProps {
  /** The editor text content used to compute line count */
  text: string
  /** Current scrollTop of the textarea (for scroll synchronization) */
  scrollTop: number
  /** Line-height in pixels, must match the textarea */
  lineHeight: number
  /** Whether line numbers are visible */
  visible: boolean
}

/**
 * LineNumbers renders a vertical gutter with line numbers that scroll-syncs
 * with the editor textarea.
 *
 * Requirements 4.3, 4.4: Line numbers display and pixel-perfect alignment.
 */
export function LineNumbers({ text, scrollTop, lineHeight, visible }: LineNumbersProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = scrollTop
    }
  }, [scrollTop])

  if (!visible) {
    return null
  }

  const lineCount = text.split('\n').length

  return (
    <div
      ref={containerRef}
      className="line-numbers-container"
      aria-hidden="true"
    >
      {Array.from({ length: lineCount }, (_, i) => (
        <div
          key={i}
          className="line-number"
          style={{ lineHeight: `${lineHeight}px` }}
        >
          {i + 1}
        </div>
      ))}
    </div>
  )
}
