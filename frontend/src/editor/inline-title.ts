/**
 * Inline title for the CM6 editor (app.json `showInlineTitle`): the note's file name, without
 * `.md`, as an editable single-line field at the very start of the document — it scrolls with the
 * content, in Source and Live Preview alike. Not part of the note's text; committing it renames the
 * file through `onRename`.
 */
import { WidgetType, Decoration, EditorView, type DecorationSet } from '@codemirror/view'
import { StateField, type Extension } from '@codemirror/state'

/** Options of the inline-title extension. */
export interface InlineTitleOptions {
  /** Current title (file name without `.md`). */
  title: string
  /** Vault path of the note; part of the widget identity so a moved note never keeps a stale rename handler. */
  path: string
  /** Whether the title can be edited. */
  readOnly: boolean
  /** Called with the new title when the user commits a changed value. Reject to keep the old name. */
  onRename: (newTitle: string) => Promise<void> | void
}

class InlineTitleWidget extends WidgetType {
  private readonly options: InlineTitleOptions

  constructor(options: InlineTitleOptions) {
    super()
    this.options = options
  }

  eq(other: InlineTitleWidget): boolean {
    return other.options.title === this.options.title && other.options.path === this.options.path && other.options.readOnly === this.options.readOnly
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'cm-inline-title'
    const input = document.createElement('input')
    input.type = 'text'
    input.className = 'cm-inline-title-input inline-title'
    input.value = this.options.title
    input.readOnly = this.options.readOnly
    input.spellcheck = false
    input.setAttribute('aria-label', this.options.title)
    const { title, onRename } = this.options
    let done = false
    const commit = () => {
      if (done) return
      done = true
      const next = input.value.trim()
      if (!next || next === title) {
        input.value = title
        return
      }
      Promise.resolve(onRename(next)).catch(() => {
        input.value = title
      })
    }
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        commit()
        view.focus()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        done = true
        input.value = title
        view.focus()
      }
    })
    input.addEventListener('blur', commit)
    wrap.appendChild(input)
    return wrap
  }

  ignoreEvent(): boolean {
    return true
  }
}

/** Builds the extension; `null` options give no title. */
export function inlineTitleExtension(options: InlineTitleOptions | null): Extension {
  if (!options) return []
  const field = StateField.define<DecorationSet>({
    create: () => Decoration.set([Decoration.widget({ widget: new InlineTitleWidget(options), block: true, side: -1 }).range(0)]),
    update: (deco) => deco,
    provide: (f) => EditorView.decorations.from(f),
  })
  return field
}
