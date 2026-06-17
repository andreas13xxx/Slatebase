import { useCallback, useRef, useState } from 'react'
import { showToast } from '../components/ToastNotification'

/** Default maximum files per drop operation. */
const DEFAULT_MAX_FILES = 50

/** Default maximum file size in bytes (100 MB). */
const DEFAULT_MAX_FILE_SIZE = 104857600

/** Options for configuring the drop zone hook. */
export interface UseDropZoneOptions {
  /** Callback invoked when valid files are dropped. */
  onDrop: (files: File[], targetPath: string) => Promise<void>
  /** Maximum number of files per drop (default 50). */
  maxFiles?: number
  /** Maximum individual file size in bytes (default 100 MB). */
  maxFileSize?: number
  /** Optional MIME type filter (e.g. ['image/png', 'image/jpeg']). */
  accept?: string[]
  /** Target path for the dropped files (directory). */
  targetPath?: string
  /** Whether dropping is disabled (e.g. no file open in editor). */
  disabled?: boolean
  /** Custom message shown when drop is rejected due to disabled state. */
  disabledMessage?: string
}

/** Return value of the useDropZone hook. */
export interface UseDropZoneReturn {
  /** Whether a drag operation is currently over the drop zone. */
  isDragOver: boolean
  /** Ref to attach to the drop zone container element. */
  dropRef: React.RefObject<HTMLDivElement | null>
  /** Event handlers to spread on the drop zone element. */
  handlers: {
    onDragEnter: (e: React.DragEvent<HTMLDivElement>) => void
    onDragLeave: (e: React.DragEvent<HTMLDivElement>) => void
    onDragOver: (e: React.DragEvent<HTMLDivElement>) => void
    onDrop: (e: React.DragEvent<HTMLDivElement>) => void
  }
}

/**
 * Custom hook for handling file drag-and-drop.
 *
 * Uses a drag counter to correctly handle nested element enter/leave events.
 * Validates file count and individual file sizes before invoking the onDrop callback.
 * Shows toast notifications for validation errors.
 */
export function useDropZone(options: UseDropZoneOptions): UseDropZoneReturn {
  const {
    onDrop,
    maxFiles = DEFAULT_MAX_FILES,
    maxFileSize = DEFAULT_MAX_FILE_SIZE,
    accept,
    targetPath = '',
    disabled = false,
    disabledMessage = 'Bitte zuerst eine Datei öffnen',
  } = options

  const [isDragOver, setIsDragOver] = useState(false)
  const dropRef = useRef<HTMLDivElement | null>(null)
  const dragCounterRef = useRef(0)

  const onDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current += 1
    if (dragCounterRef.current === 1) {
      setIsDragOver(true)
    }
  }, [])

  const onDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current -= 1
    if (dragCounterRef.current === 0) {
      setIsDragOver(false)
    }
  }, [])

  const onDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current = 0
    setIsDragOver(false)

    // Reject drop when disabled (e.g. no file open in editor)
    if (disabled) {
      showToast('warning', disabledMessage)
      return
    }

    const droppedFiles = Array.from(e.dataTransfer.files)

    if (droppedFiles.length === 0) {
      return
    }

    // Validate: max file count
    if (droppedFiles.length > maxFiles) {
      showToast('error', `Maximal ${maxFiles} Dateien pro Drop-Vorgang erlaubt (${droppedFiles.length} ausgewählt)`)
      return
    }

    // Validate individual files: size and optional MIME type
    const validFiles: File[] = []
    const maxSizeMB = Math.round(maxFileSize / (1024 * 1024))

    for (const file of droppedFiles) {
      if (file.size > maxFileSize) {
        showToast('error', `"${file.name}" überschreitet die maximale Dateigröße von ${maxSizeMB} MB`)
        continue
      }

      if (accept && accept.length > 0 && !accept.includes(file.type)) {
        showToast('warning', `"${file.name}" hat einen nicht unterstützten Dateityp`)
        continue
      }

      validFiles.push(file)
    }

    if (validFiles.length === 0) {
      return
    }

    try {
      await onDrop(validFiles, targetPath)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload fehlgeschlagen'
      showToast('error', message)
    }
  }, [disabled, disabledMessage, maxFiles, maxFileSize, accept, onDrop, targetPath])

  return {
    isDragOver,
    dropRef,
    handlers: {
      onDragEnter,
      onDragLeave,
      onDragOver,
      onDrop: handleDrop,
    },
  }
}
