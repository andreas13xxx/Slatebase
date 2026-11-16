import { describe, it, expect, vi } from 'vitest'
import { loadForwardLinks } from './documentPanelActions'
import type { DocumentPanelAction } from './documentPanelData'
import type { DirectoryTree } from '../types'

const tree: DirectoryTree = {
  name: 'root',
  type: 'directory',
  path: '',
  children: [
    {
      name: 'Projekte', type: 'directory', path: 'Projekte',
      children: [{ name: 'Alpha.md', type: 'file', path: 'Projekte/Alpha.md' }],
    },
  ],
}

describe('loadForwardLinks', () => {
  it('keeps the resolved vault path so a note in a subfolder can be opened', () => {
    const dispatch = vi.fn()
    loadForwardLinks(dispatch, 'Siehe [[Alpha]], [[Alpha#Ziel]] und [[Fehlt]].', tree)

    const action = dispatch.mock.calls[0]?.[0] as Extract<DocumentPanelAction, { type: 'SET_FORWARD_LINKS' }>
    expect(action.links.map((l) => [l.target, l.path, l.resolved])).toEqual([
      ['Alpha', 'Projekte/Alpha.md', true],
      ['Alpha', 'Projekte/Alpha.md', true],
      ['Fehlt', undefined, false],
    ])
  })
})
