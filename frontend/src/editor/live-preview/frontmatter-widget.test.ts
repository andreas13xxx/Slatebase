import { describe, it, expect, afterEach } from 'vitest'
import { within } from '@testing-library/dom'
import { act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EditorView, keymap } from '@codemirror/view'
import { EditorState, Prec } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { GFM } from '@lezer/markdown'
import { createLivePreviewField, createLivePreviewClickHandler } from './live-preview-extension'
import type { LivePreviewOptions } from './live-preview-extension'
import type { PropertyTypeEntry } from '../../state/propertyTypes'

/**
 * End-to-end checks (real EditorView + real DOM, no app/auth needed) for the
 * interactive frontmatter box: the FrontmatterWidget now mounts the real
 * PropertiesEditor component instead of a read-only summary, committing
 * edits straight back into the document via `view.dispatch`.
 */
function mount(doc: string, options: Partial<LivePreviewOptions> = {}, extraExtensions: import('@codemirror/state').Extension[] = []) {
  const fullOptions: LivePreviewOptions = { vaultId: 'v1', directoryTree: null, ...options }
  const parent = document.createElement('div')
  document.body.appendChild(parent)
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        markdown({ extensions: GFM }),
        createLivePreviewField(fullOptions),
        createLivePreviewClickHandler(fullOptions),
        ...extraExtensions,
      ],
    }),
  })
  return { view, parent }
}

/**
 * FrontmatterWidget defers its initial React render past the current CM6
 * update (see widget-decorations.ts's FrontmatterWidget.toDOM — flushSync
 * there used to reenter CM6's own DOM-update pass and could corrupt its
 * viewport). Tests that inspect the mounted PropertiesEditor must flush
 * React's scheduled work first; `act` waits out however many ticks that
 * takes instead of assuming a fixed number.
 */
function flushMicrotasks(): Promise<void> {
  return act(async () => {})
}

describe('Interactive frontmatter box', () => {
  let cleanup: (() => void) | undefined

  afterEach(() => {
    cleanup?.()
    cleanup = undefined
  })

  const DOC = '---\ntitle: Hello\n---\nBody text\n'

  it('mounts the real PropertiesEditor for an editable document instead of the read-only summary', async () => {
    const { view, parent } = mount(DOC)
    cleanup = () => { view.destroy(); parent.remove() }
    await flushMicrotasks()

    expect(view.dom.querySelector('.properties-editor__key')?.textContent).toBe('title')
    // The old read-only text-parsing render's classes should not appear.
    expect(view.dom.querySelector('.cm-lp-frontmatter-key')).toBeNull()
  })

  it('falls back to the read-only summary when the editor is read-only', () => {
    const { view, parent } = mount(DOC, {}, [EditorState.readOnly.of(true)])
    cleanup = () => { view.destroy(); parent.remove() }

    expect(view.dom.querySelector('.cm-lp-frontmatter-key')?.textContent).toBe('title')
    expect(view.dom.querySelector('.properties-editor__key')).toBeNull()
  })

  it('committing a new value updates only the frontmatter, leaving the body untouched', async () => {
    const user = userEvent.setup()
    const { view, parent } = mount(DOC)
    cleanup = () => { view.destroy(); parent.remove() }
    await flushMicrotasks()

    const scope = within(view.dom.querySelector('.properties-editor') as HTMLElement)
    await user.click(scope.getByRole('button', { name: 'Hello' }))
    const input = scope.getByRole('textbox')
    await user.clear(input)
    await user.type(input, 'Changed{Enter}')

    expect(view.state.doc.toString()).toBe('---\ntitle: Changed\n---\nBody text\n')
  })

  it('renaming a key preserves its value and position', async () => {
    const user = userEvent.setup()
    const { view, parent } = mount('---\ntitle: Hello\ntags: [a, b]\n---\nBody\n')
    cleanup = () => { view.destroy(); parent.remove() }
    await flushMicrotasks()

    const scope = within(view.dom.querySelector('.properties-editor') as HTMLElement)
    await user.click(scope.getByRole('button', { name: 'title' }))
    const input = scope.getByRole('textbox', { name: 'Name der Eigenschaft' })
    await user.clear(input)
    await user.type(input, 'heading{Enter}')

    const lines = view.state.doc.toString().split('\n')
    expect(lines[1]).toBe('heading: Hello')
    expect(lines[2]).toBe('tags: [a, b]')
  })

  it('deleting the only property removes the whole block, delimiters included', async () => {
    const user = userEvent.setup()
    const { view, parent } = mount(DOC)
    cleanup = () => { view.destroy(); parent.remove() }
    await flushMicrotasks()

    const deleteBtn = view.dom.querySelector('.properties-editor__delete-btn') as HTMLElement
    await user.click(deleteBtn)

    expect(view.state.doc.toString()).toBe('Body text\n')
  })

  it('changing a property type calls the callback without touching the document', async () => {
    const user = userEvent.setup()
    const typeRegistry: PropertyTypeEntry[] = []
    let received: { key: string; type: string } | null = null
    const { view, parent } = mount(DOC, {
      typeRegistry,
      onPropertyTypeChange: (key, type) => { received = { key, type } },
    })
    cleanup = () => { view.destroy(); parent.remove() }
    await flushMicrotasks()

    const select = within(view.dom.querySelector('.properties-editor') as HTMLElement).getByRole('combobox', { name: 'Typ' })
    await user.selectOptions(select, 'checkbox')

    expect(received).toEqual({ key: 'title', type: 'checkbox' })
    expect(view.state.doc.toString()).toBe(DOC)
  })

  it('editing a date & time property leaves every other property intact', async () => {
    // Regression test: the date control used to commit on every `change` the
    // native input fired, and serializeFrontmatter dropped blank properties —
    // together, touching a date wiped the rest of the block.
    const { view, parent } = mount('---\ntitle: Hello\nstatus:\ncreated: 2026-09-01T10:30\ntags: [a, b]\n---\nBody\n')
    cleanup = () => { view.destroy(); parent.remove() }
    await flushMicrotasks()

    const input = view.dom.querySelector('input[type="datetime-local"]') as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { value: '2026-12-24T18:00' } })
      fireEvent.blur(input)
    })

    expect(view.state.doc.toString()).toBe(
      '---\ntitle: Hello\nstatus:\ncreated: 2026-12-24T18:00\ntags: [a, b]\n---\nBody\n',
    )
  })

  it('keeps a blank property when an unrelated property is edited', async () => {
    const user = userEvent.setup()
    const { view, parent } = mount('---\ntitle: Hello\nstatus:\n---\nBody\n')
    cleanup = () => { view.destroy(); parent.remove() }
    await flushMicrotasks()

    const scope = within(view.dom.querySelector('.properties-editor') as HTMLElement)
    await user.click(scope.getByRole('button', { name: 'Hello' }))
    await user.clear(scope.getByRole('textbox'))
    await user.type(scope.getByRole('textbox'), 'Changed{Enter}')

    expect(view.state.doc.toString()).toBe('---\ntitle: Changed\nstatus:\n---\nBody\n')
  })

  it('does not let a plugin-style Prec.highest Enter keymap fire while typing inside the widget', async () => {
    // Regression test for the bug this whole rework grew out of: a
    // Prec.highest keymap (e.g. Advanced Tables' "Enter moves to next row")
    // must not also react to Enter pressed inside a nested form control.
    const user = userEvent.setup()
    let keymapFired = false
    const interceptor = Prec.highest(keymap.of([{
      key: 'Enter',
      run: () => { keymapFired = true; return true },
    }]))
    const { view, parent } = mount(DOC, {}, [interceptor])
    cleanup = () => { view.destroy(); parent.remove() }
    await flushMicrotasks()

    const scope = within(view.dom.querySelector('.properties-editor') as HTMLElement)
    await user.click(scope.getByRole('button', { name: 'Hello' }))
    const input = scope.getByRole('textbox')
    await user.type(input, '{Enter}')

    expect(keymapFired).toBe(false)
  })
})
