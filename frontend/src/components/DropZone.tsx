import { Upload } from 'lucide-react'
import { useDropZone } from '../hooks/useDropZone'
import type { UseDropZoneOptions } from '../hooks/useDropZone'
import './DropZone.css'

/** Props for the DropZone component. */
export interface DropZoneProps {
  /** Content rendered inside the drop zone wrapper. */
  children: React.ReactNode
  /** Callback invoked when valid files are dropped. */
  onDrop: UseDropZoneOptions['onDrop']
  /** Maximum number of files per drop (default 50). */
  maxFiles?: number
  /** Maximum individual file size in bytes (default 100 MB). */
  maxFileSize?: number
  /** Optional MIME type filter. */
  accept?: string[]
  /** Target path for dropped files. */
  targetPath?: string
  /** Whether dropping is disabled (e.g. no file open in editor). */
  disabled?: boolean
  /** Custom message when drop is rejected (disabled state). */
  disabledMessage?: string
  /** Optional additional CSS class name. */
  className?: string
}

/**
 * DropZone wrapper component.
 *
 * Wraps children with drag-and-drop file upload capability.
 * Shows a visual overlay when files are being dragged over the zone.
 * Uses the useDropZone hook for event handling and validation.
 */
export function DropZone({
  children,
  onDrop,
  maxFiles,
  maxFileSize,
  accept,
  targetPath,
  disabled,
  disabledMessage,
  className,
}: DropZoneProps) {
  const { isDragOver, dropRef, handlers } = useDropZone({
    onDrop,
    maxFiles,
    maxFileSize,
    accept,
    targetPath,
    disabled,
    disabledMessage,
  })

  return (
    <div
      ref={dropRef}
      className={`drop-zone${isDragOver ? ' drop-zone--active' : ''}${className ? ` ${className}` : ''}`}
      {...handlers}
    >
      {children}
      {isDragOver && (
        <div className="drop-zone__overlay" aria-hidden="true">
          <div className="drop-zone__overlay-content">
            <Upload size={32} className="drop-zone__overlay-icon" />
            <span className="drop-zone__overlay-text">
              {disabled ? 'Drop nicht möglich' : 'Dateien hier ablegen'}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
