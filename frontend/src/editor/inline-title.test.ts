import { describe, it, expect, vi } from 'vitest'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { inlineTitleExtension, type InlineTitleOptions } from './inline-title'

function mount(options: InlineTitleOptions | null) {
  const parent = document.createElement('div')
  document.body.appendChild(parent)
  const view = new EditorView({ state: EditorState.create({ doc: 'body', extensions: [inlineTitleExtension(options)] }), parent })
  return { view, input: parent.querySelector<HTMLInputElement>('.cm-inline-title-input') }
}

const base = { title: 'Note', path: 'a/Note.md', readOnly: false }

describe('inlineTitleExtension', () => {
  it('renders no title without options', () => {
    expect(mount(null).input).toBeNull()
  })

  it('shows the title as an editable field', () => {
    const { input } = mount({ ...base, onRename: vi.fn() })
    expect(input?.value).toBe('Note')
    expect(input?.readOnly).toBe(false)
  })

  it('is read-only when the vault is read-only', () => {
    expect(mount({ ...base, readOnly: true, onRename: vi.fn() }).input?.readOnly).toBe(true)
  })

  it('renames on Enter with the trimmed value', () => {
    const onRename = vi.fn()
    const { input } = mount({ ...base, onRename })
    input!.value = '  Neu '
    input!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(onRename).toHaveBeenCalledWith('Neu')
  })

  it('does not rename an unchanged or empty title', () => {
    const onRename = vi.fn()
    const { input } = mount({ ...base, onRename })
    input!.dispatchEvent(new Event('blur'))
    expect(onRename).not.toHaveBeenCalled()
  })

  it('discards the edit on Escape', () => {
    const onRename = vi.fn()
    const { input } = mount({ ...base, onRename })
    input!.value = 'Neu'
    input!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    input!.dispatchEvent(new Event('blur'))
    expect(input!.value).toBe('Note')
    expect(onRename).not.toHaveBeenCalled()
  })
})
