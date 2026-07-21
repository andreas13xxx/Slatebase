import { EditorView } from '@codemirror/view'
import type { Extension } from '@codemirror/state'

/**
 * Options for the image paste and drag-and-drop CM6 extension.
 */
export interface ImagePasteOptions {
  /** Upload function: takes a File, returns the filename on success. */
  onUpload: (file: File) => Promise<string>
  /** Vault ID for constructing embed links. */
  vaultId: string
}

/** Supported image MIME types for paste interception. */
const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml']

/** Placeholder text inserted during upload. */
const UPLOAD_PLACEHOLDER = '![Uploading...](…)'

/**
 * Checks whether a MIME type is an image type we should intercept.
 */
function isImageMime(mimeType: string): boolean {
  return mimeType.startsWith('image/')
}

/**
 * Inserts text at the current cursor position in the editor.
 * Returns the from/to positions of the inserted text.
 */
function insertTextAtCursor(view: EditorView, text: string): { from: number; to: number } {
  const { from } = view.state.selection.main
  view.dispatch({
    changes: { from, insert: text },
    selection: { anchor: from + text.length },
  })
  return { from, to: from + text.length }
}

/**
 * Replaces text in the editor between the given positions.
 */
function replaceRange(view: EditorView, from: number, to: number, replacement: string): void {
  view.dispatch({
    changes: { from, to, insert: replacement },
    selection: { anchor: from + replacement.length },
  })
}

/**
 * Handles a single image file upload: inserts placeholder, uploads, replaces with embed link.
 */
async function handleImageUpload(
  view: EditorView,
  file: File,
  onUpload: ImagePasteOptions['onUpload'],
): Promise<void> {
  // Insert placeholder at cursor position
  const placeholder = insertTextAtCursor(view, UPLOAD_PLACEHOLDER)

  try {
    const filename = await onUpload(file)
    const embedLink = `![[${filename}]]`

    // Replace placeholder with embed link
    // Account for possible document changes: find the placeholder text
    const docText = view.state.doc.toString()
    const placeholderIndex = docText.indexOf(UPLOAD_PLACEHOLDER, Math.max(0, placeholder.from - 10))

    if (placeholderIndex !== -1) {
      replaceRange(view, placeholderIndex, placeholderIndex + UPLOAD_PLACEHOLDER.length, embedLink)
    } else {
      // Fallback: placeholder may have moved, try to find it anywhere
      const fallbackIndex = docText.indexOf(UPLOAD_PLACEHOLDER)
      if (fallbackIndex !== -1) {
        replaceRange(view, fallbackIndex, fallbackIndex + UPLOAD_PLACEHOLDER.length, embedLink)
      } else {
        // Placeholder not found (user may have deleted it), insert at end of doc
        const end = view.state.doc.length
        replaceRange(view, end, end, embedLink)
      }
    }
  } catch (err) {
    // On error: remove placeholder
    const docText = view.state.doc.toString()
    const placeholderIndex = docText.indexOf(UPLOAD_PLACEHOLDER)
    if (placeholderIndex !== -1) {
      replaceRange(view, placeholderIndex, placeholderIndex + UPLOAD_PLACEHOLDER.length, '')
    }
    console.error('Image upload failed:', err)
  }
}

/**
 * Handles a markdown file drop: inserts a wikilink without extension.
 */
function handleMarkdownDrop(view: EditorView, file: File): void {
  const nameWithoutExtension = file.name.replace(/\.md$/i, '')
  const wikilink = `[[${nameWithoutExtension}]]`
  insertTextAtCursor(view, wikilink)
}

/**
 * Creates a CM6 extension that handles image paste and file drag-and-drop.
 * - Paste: intercepts only image/* MIME types, uploads, inserts ![[filename]]
 * - Drop: handles image files (upload + embed) and .md files (wikilink)
 *
 * Text paste is NOT intercepted — only image/* MIME types trigger interception.
 */
export function createImagePasteExtension(options: ImagePasteOptions): Extension {
  const { onUpload } = options

  return EditorView.domEventHandlers({
    paste(event: ClipboardEvent, view: EditorView): boolean | void {
      // Check clipboardData.items for any image/* type
      const items = event.clipboardData?.items
      if (!items) return

      let imageItem: DataTransferItem | null = null
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (item && item.kind === 'file' && (IMAGE_MIME_TYPES.includes(item.type) || isImageMime(item.type))) {
          imageItem = item
          break
        }
      }

      // If NO image items found, return early — let CM6 handle normal text paste
      if (!imageItem) return

      // Image found: prevent default paste behavior
      event.preventDefault()

      const file = imageItem.getAsFile()
      if (!file) return

      // Upload and insert embed link (async, fire-and-forget)
      void handleImageUpload(view, file, onUpload)

      return true
    },

    drop(event: DragEvent, view: EditorView): boolean | void {
      const files = event.dataTransfer?.files
      if (!files || files.length === 0) return

      // Check if any of the dropped files are image or markdown files
      let hasHandleableFiles = false
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        if (file && (isImageMime(file.type) || file.name.endsWith('.md'))) {
          hasHandleableFiles = true
          break
        }
      }

      if (!hasHandleableFiles) return

      // Prevent default browser drag behavior
      event.preventDefault()
      event.stopPropagation()

      // Process each dropped file
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        if (!file) continue

        if (isImageMime(file.type)) {
          // Image file: upload and insert embed link
          void handleImageUpload(view, file, onUpload)
        } else if (file.name.endsWith('.md')) {
          // Markdown file: insert wikilink
          handleMarkdownDrop(view, file)
        }
      }

      return true
    },
  })
}
