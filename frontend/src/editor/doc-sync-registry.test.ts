import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { EditorView } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import {
  registerSyncView,
  unregisterSyncView,
  broadcastChanges,
  remoteSync,
  resetDocSyncRegistry,
} from './doc-sync-registry'

function createView(doc: string): EditorView {
  return new EditorView({ state: EditorState.create({ doc }) })
}

describe('doc-sync-registry', () => {
  let views: EditorView[] = []

  beforeEach(() => {
    resetDocSyncRegistry()
    views = []
  })

  afterEach(() => {
    for (const v of views) v.destroy()
  })

  function track(view: EditorView): EditorView {
    views.push(view)
    return view
  }

  it('mirrors a change to a sibling view with the same tabId', () => {
    const a = track(createView('hello'))
    const b = track(createView('hello'))
    registerSyncView('v::note.md', a)
    registerSyncView('v::note.md', b)

    const tr = a.state.update({ changes: { from: 5, insert: ' world' } })
    a.dispatch(tr)
    broadcastChanges('v::note.md', a, tr.changes)

    expect(b.state.doc.toString()).toBe('hello world')
  })

  it('marks mirrored transactions with the remoteSync annotation', () => {
    const a = track(createView('x'))
    let sawRemote = false
    const b = track(
      new EditorView({
        state: EditorState.create({
          doc: 'x',
          extensions: [
            EditorView.updateListener.of((u) => {
              if (u.transactions.some((tr) => tr.annotation(remoteSync))) sawRemote = true
            }),
          ],
        }),
      }),
    )
    registerSyncView('t', a)
    registerSyncView('t', b)

    const tr = a.state.update({ changes: { from: 1, insert: 'y' } })
    a.dispatch(tr)
    broadcastChanges('t', a, tr.changes)

    expect(sawRemote).toBe(true)
    expect(b.state.doc.toString()).toBe('xy')
  })

  it('does not echo the change back to the source view', () => {
    const a = track(createView('a'))
    registerSyncView('t', a)
    const tr = a.state.update({ changes: { from: 1, insert: 'b' } })
    a.dispatch(tr)
    // Source is the only view — broadcast is a no-op, doc unchanged by mirror.
    broadcastChanges('t', a, tr.changes)
    expect(a.state.doc.toString()).toBe('ab')
  })

  it('does not mirror across different tabIds', () => {
    const a = track(createView('one'))
    const b = track(createView('two'))
    registerSyncView('tab-a', a)
    registerSyncView('tab-b', b)

    const tr = a.state.update({ changes: { from: 3, insert: '!' } })
    a.dispatch(tr)
    broadcastChanges('tab-a', a, tr.changes)

    expect(b.state.doc.toString()).toBe('two')
  })

  it('stops mirroring to an unregistered view', () => {
    const a = track(createView('p'))
    const b = track(createView('p'))
    registerSyncView('t', a)
    registerSyncView('t', b)
    unregisterSyncView('t', b)

    const tr = a.state.update({ changes: { from: 1, insert: 'q' } })
    a.dispatch(tr)
    broadcastChanges('t', a, tr.changes)

    expect(b.state.doc.toString()).toBe('p')
  })
})
