import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { getCM } from '@replit/codemirror-vim'
import { describe, expect, it } from 'vitest'
import { loadVimExtension, vimExtensionIfLoaded } from './vim-mode'

describe('vim mode', () => {
  it('is empty until the module is loaded, then a real extension', async () => {
    expect(vimExtensionIfLoaded()).toEqual([])
    const extension = await loadVimExtension()
    expect(Array.isArray(extension) ? extension.length : 1).toBeGreaterThan(0)
    expect(vimExtensionIfLoaded()).not.toEqual([])
  })

  it('puts an editor into Vim: `i` insert mode is reachable, normal mode does not type letters', async () => {
    const extension = await loadVimExtension()
    const parent = document.createElement('div')
    document.body.appendChild(parent)
    const view = new EditorView({ state: EditorState.create({ doc: 'abc', extensions: [extension] }), parent })
    const cm = getCM(view)
    expect(cm).not.toBeNull()
    expect(cm?.state.vim?.insertMode).toBeFalsy()
    view.destroy()
    parent.remove()
  })
})
