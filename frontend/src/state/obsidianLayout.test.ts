import { describe, it, expect } from 'vitest'
import type { PersistedPaneTree, PersistedPaneTab } from './paneTreeState'
import { obsidianToPaneTree, paneTreeToObsidian } from './obsidianLayout'

const tab = (filePath: string, over: Partial<PersistedPaneTab> = {}): PersistedPaneTab => ({
  vaultId: 'v1', filePath, fileName: filePath.split('/').pop()!, mode: 'view', pinned: false, ...over,
})

const split: PersistedPaneTree = {
  activePaneId: 'p2',
  root: {
    kind: 'split', id: 's', direction: 'horizontal', sizes: [0.5, 0.5],
    children: [
      { kind: 'pane', id: 'p1', tabs: [tab('a.md', { mode: 'edit' }), tab('dir/b.md', { pinned: true })], activeTabId: 'v1::dir/b.md' },
      { kind: 'pane', id: 'p2', tabs: [tab('c.canvas'), tab('__graph__')], activeTabId: 'v1::c.canvas' },
    ],
  },
}

describe('paneTreeToObsidian', () => {
  const { main, active, lastOpenFiles } = paneTreeToObsidian(split, 'v1')
  const groups = (main['children'] as Array<Record<string, unknown>>)
  const leaves = (group: Record<string, unknown>) => group['children'] as Array<Record<string, unknown>>
  const view = (leaf: Record<string, unknown>) => leaf['state'] as { type: string; state: Record<string, unknown> }

  it('writes side-by-side panes as Obsidian\'s vertical split with tab groups', () => {
    expect(main['type']).toBe('split')
    expect(main['direction']).toBe('vertical')
    expect(groups.map((g) => g['type'])).toEqual(['tabs', 'tabs'])
    expect(typeof main['id']).toBe('string')
    expect(main['id']).toMatch(/^[0-9a-f]{16}$/)
  })

  it('writes files as typed leaves, the editing mode as source, pins and the current tab', () => {
    const [a, b] = leaves(groups[0]!)
    expect(view(a!)).toMatchObject({ type: 'markdown', state: { file: 'a.md', mode: 'source' } })
    expect(view(b!).state).toMatchObject({ file: 'dir/b.md', mode: 'preview' })
    expect(b!['pinned']).toBe(true)
    expect(groups[0]!['currentTab']).toBe(1)
    const [canvas, graph] = leaves(groups[1]!)
    expect(view(canvas!)).toMatchObject({ type: 'canvas', state: { file: 'c.canvas' } })
    expect(view(graph!).type).toBe('graph')
  })

  it('names the active leaf and the open files', () => {
    const activeLeaf = leaves(groups[1]!)[0]!
    expect(active).toBe(activeLeaf['id'])
    expect(lastOpenFiles).toEqual(['a.md', 'dir/b.md', 'c.canvas'])
  })

  it('leaves out tabs of another vault and virtual tabs', () => {
    const tree: PersistedPaneTree = {
      activePaneId: 'p', root: { kind: 'pane', id: 'p', activeTabId: null, tabs: [tab('x.md', { vaultId: 'other' }), tab('__view::foo'), tab('__webview::https://x.test'), tab('ok.md')] },
    }
    const result = paneTreeToObsidian(tree, 'v1')
    const only = (result.main['children'] as Array<Record<string, unknown>>)[0]!['children'] as Array<Record<string, unknown>>
    expect(only.map((l) => view(l).state['file'])).toEqual(['ok.md'])
  })
})

describe('obsidianToPaneTree', () => {
  it('round-trips a layout', () => {
    const { main } = paneTreeToObsidian(split, 'v1')
    const result = obsidianToPaneTree(main, 'v1')!
    expect(result.skipped).toBe(0)
    const root = result.tree.root
    expect(root.kind).toBe('split')
    if (root.kind !== 'split') return
    expect(root.direction).toBe('horizontal')
    expect(root.sizes).toEqual([0.5, 0.5])
    const [first, second] = root.children
    expect(first).toMatchObject({ kind: 'pane', activeTabId: 'v1::dir/b.md' })
    if (first?.kind === 'pane') {
      expect(first.tabs.map((t) => [t.filePath, t.mode, t.pinned])).toEqual([['a.md', 'edit', false], ['dir/b.md', 'view', true]])
    }
    if (second?.kind === 'pane') expect(second.tabs.map((t) => t.filePath)).toEqual(['c.canvas', '__graph__'])
    expect(result.tree.activePaneId).toBe((first as { id: string }).id)
  })

  it('reads a layout Obsidian wrote: a horizontal split stacks panes, side panels and unknown views are skipped and counted', () => {
    const main = {
      id: 'a', type: 'split', direction: 'horizontal',
      children: [
        { id: 'b', type: 'tabs', currentTab: 0, children: [
          { id: 'c', type: 'leaf', state: { type: 'markdown', state: { file: 'Note.md', mode: 'preview', source: false } } },
          { id: 'd', type: 'leaf', state: { type: 'dataview-custom', state: {} } },
          { id: 'e', type: 'leaf', state: { type: 'backlink', state: {} } },
        ] },
        { id: 'f', type: 'tabs', children: [{ id: 'g', type: 'leaf', state: { type: 'image', state: { file: 'img/p.png' } } }] },
      ],
    }
    const result = obsidianToPaneTree(main, 'v1')!
    expect(result.skipped).toBe(2)
    expect(result.tree.root).toMatchObject({ kind: 'split', direction: 'vertical' })
  })

  it('refuses paths that leave the vault and nodes without content', () => {
    const main = { type: 'split', children: [{ type: 'tabs', children: [
      { type: 'leaf', state: { type: 'markdown', state: { file: '../secret.md' } } },
      { type: 'leaf', state: { type: 'markdown', state: { file: '/etc/passwd' } } },
    ] }] }
    const result = obsidianToPaneTree(main, 'v1')!
    expect(result.skipped).toBe(2)
    expect(result.tree.root).toMatchObject({ kind: 'pane', tabs: [] })
    expect(obsidianToPaneTree('x', 'v1')).toBeNull()
    expect(obsidianToPaneTree({ type: 'split', children: [] }, 'v1')).toBeNull()
  })
})
