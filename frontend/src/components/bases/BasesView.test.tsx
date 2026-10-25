/**
 * Integration tests for BasesView's plugin-view mounting path:
 * - a registered view `type` mounts the plugin view in a scoped container,
 * - an unregistered type renders the built-in table,
 * - the view switcher appears for a multi-view base,
 * - a throwing factory falls back to the table.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { installObsidianGlobals } from '../../plugins/compat/install-globals'
import { registerBasesView, resetForVault } from '../../plugins/compat/bases-view-registry'
import { BasesView } from './BasesView'
import type { IApiClient } from '../../api'
import type { BaseQueryResultWire } from '@slatebase/shared-contracts'

installObsidianGlobals()

const result: BaseQueryResultWire = {
  rows: [{ path: 'a.md', fileName: 'a', values: { title: ['Alpha'] } }],
  total: 1,
}

function makeApiClient(): IApiClient {
  return {
    queryBase: vi.fn().mockResolvedValue(result),
    getPropertyTypes: vi.fn().mockResolvedValue({ entries: [] }),
    fetchFileContent: vi.fn(),
    saveFile: vi.fn(),
  } as unknown as IApiClient
}

const tableSource = [
  'views:',
  '  - type: table',
  '    name: Tabelle',
  '    order: [title]',
  'properties:',
  '  title: {}',
].join('\n')

// A plugin-registered view type (NOT one of the built-in `table`/`cards`
// types, which render in-app). Used to exercise the plugin-host path.
const pluginSource = [
  'views:',
  '  - type: gallery',
  '    name: Karten',
  '    order: [title]',
  '  - type: table',
  '    name: Tabelle',
  '    order: [title]',
  'properties:',
  '  title: {}',
].join('\n')

describe('BasesView plugin views', () => {
  beforeEach(() => resetForVault())
  afterEach(() => resetForVault())

  it('renders the built-in table when the view type is not a registered plugin view', async () => {
    render(
      <BasesView apiClient={makeApiClient()} vaultId="v1" source={tableSource} readOnly={false} onOpenNote={() => {}} onSaveSource={() => {}} />,
    )
    // The built-in table renders a link button for the note.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Alpha' })).toBeTruthy())
  })

  it('mounts a registered plugin view in a data-plugin-id scoped container', async () => {
    const factory = vi.fn((_controller: unknown, el: HTMLElement) => {
      const inst = {
        containerEl: el,
        load() {},
        onDataUpdated() { el.textContent = 'PLUGIN VIEW RENDERED' },
      }
      return inst
    })
    registerBasesView('gallery', { name: 'Karten', factory }, 'card-plugin')

    const { container } = render(
      <BasesView apiClient={makeApiClient()} vaultId="v1" source={pluginSource} readOnly={false} onOpenNote={() => {}} onSaveSource={() => {}} />,
    )

    await waitFor(() => expect(factory).toHaveBeenCalledTimes(1))
    const host = container.querySelector('.bases-view__plugin-container') as HTMLElement
    expect(host).toBeTruthy()
    expect(host.getAttribute('data-plugin-id')).toBe('card-plugin')
    await waitFor(() => expect(screen.getByText('PLUGIN VIEW RENDERED')).toBeTruthy())
  })

  it('shows a view switcher for a multi-view base', () => {
    registerBasesView('gallery', { name: 'Karten', factory: (_c, el) => ({ containerEl: el, load() {}, onDataUpdated() {} }) }, 'card-plugin')
    render(
      <BasesView apiClient={makeApiClient()} vaultId="v1" source={pluginSource} readOnly={false} onOpenNote={() => {}} onSaveSource={() => {}} />,
    )
    expect(screen.getByRole('tab', { name: 'Karten' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Tabelle' })).toBeTruthy()
  })

  it('falls back to the table when the plugin factory throws', async () => {
    registerBasesView('gallery', { name: 'Karten', factory: () => { throw new Error('factory boom') } }, 'card-plugin')
    render(
      <BasesView apiClient={makeApiClient()} vaultId="v1" source={pluginSource} readOnly={false} onOpenNote={() => {}} onSaveSource={() => {}} />,
    )
    // Error banner shows, and the built-in table renders the note.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Alpha' })).toBeTruthy())
    expect(screen.getByText(/Plugin-Ansicht ist fehlgeschlagen/)).toBeTruthy()
  })

  it('switching to the table view renders the built-in table', async () => {
    registerBasesView('gallery', { name: 'Karten', factory: (_c, el) => ({ containerEl: el, load() {}, onDataUpdated() {} }) }, 'card-plugin')
    render(
      <BasesView apiClient={makeApiClient()} vaultId="v1" source={pluginSource} readOnly={false} onOpenNote={() => {}} onSaveSource={() => {}} />,
    )
    fireEvent.click(screen.getByRole('tab', { name: 'Tabelle' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Alpha' })).toBeTruthy())
  })
})

describe('BasesView — this is the base file itself', () => {
  const thisSource = [
    'filters: file.hasLink(this.file)',
    'views:',
    '  - type: table',
    '    name: Tabelle',
    '    order: [title]',
    'properties:',
    '  title: {}',
  ].join('\n')

  it('looks up the base file as the host of this.*', async () => {
    const apiClient = makeApiClient()
    render(
      <BasesView apiClient={apiClient} vaultId="v1" source={thisSource} hostPath="Projekte/Offen.base" readOnly={false} onOpenNote={() => {}} onSaveSource={() => {}} />,
    )

    await waitFor(() => expect(apiClient.queryBase).toHaveBeenCalledWith('v1', expect.objectContaining({ filters: { path: 'Projekte/Offen.base' } })))
  })

  it('makes no host lookup for a base that never reads this', async () => {
    const apiClient = makeApiClient()
    render(
      <BasesView apiClient={apiClient} vaultId="v1" source={tableSource} hostPath="Projekte/Offen.base" readOnly={false} onOpenNote={() => {}} onSaveSource={() => {}} />,
    )

    await waitFor(() => expect(screen.getByRole('button', { name: 'Alpha' })).toBeTruthy())
    expect(apiClient.queryBase).toHaveBeenCalledTimes(1)
  })
})

// ── Kanban card move: optimistic concurrency (ETag) ─────────────────────────

const kanbanResult: BaseQueryResultWire = {
  rows: [
    { path: 'a.md', fileName: 'Task A', values: { status: ['todo'] } },
    { path: 'b.md', fileName: 'Task B', values: { status: ['done'] } },
  ],
  total: 2,
}

const kanbanSource = [
  'views:',
  '  - type: cards',
  '    name: Board',
  '    groupBy:',
  '      property: status',
  '    order: [file.name, status]',
  'properties:',
  '  status: {}',
].join('\n')

/** Minimal DataTransfer stub for jsdom (no native drag support). */
function dt(): DataTransfer {
  const store: Record<string, string> = {}
  return {
    effectAllowed: '', dropEffect: '',
    setData: (k: string, v: string) => { store[k] = v },
    getData: (k: string) => store[k] ?? '',
  } as unknown as DataTransfer
}

async function dragTaskAToDone(apiClient: IApiClient): Promise<void> {
  render(
    <BasesView apiClient={apiClient} vaultId="v1" source={kanbanSource} readOnly={false} onOpenNote={() => {}} onSaveSource={() => {}} />,
  )
  await waitFor(() => expect(screen.getByText('Task A')).toBeTruthy())
  const data = dt()
  const card = screen.getByText('Task A').closest('button') as HTMLElement
  fireEvent.dragStart(card, { dataTransfer: data })
  const done = screen.getByText('done').closest('section') as HTMLElement
  fireEvent.dragOver(done, { dataTransfer: data })
  fireEvent.drop(done, { dataTransfer: data })
}

describe('BasesView Kanban card move — ETag concurrency', () => {
  it('passes the fetched file ETag as If-Match when saving the moved card', async () => {
    const fetchFileContent = vi.fn().mockResolvedValue({ content: '---\nstatus: todo\n---\n', etag: 'etag-1' })
    const saveFile = vi.fn().mockResolvedValue({ path: 'a.md', name: 'a.md', size: 1, etag: 'etag-2' })
    const apiClient = {
      queryBase: vi.fn().mockResolvedValue(kanbanResult),
      getPropertyTypes: vi.fn().mockResolvedValue({ entries: [] }),
      fetchFileContent, saveFile,
    } as unknown as IApiClient

    await dragTaskAToDone(apiClient)

    await waitFor(() => expect(saveFile).toHaveBeenCalledTimes(1))
    // 4th arg is the ifMatch ETag from the read.
    expect(saveFile.mock.calls[0]?.[3]).toBe('etag-1')
    expect(saveFile.mock.calls[0]?.[1]).toBe('a.md')
  })

  it('re-reads and retries once when the first save conflicts', async () => {
    const fetchFileContent = vi.fn()
      .mockResolvedValueOnce({ content: '---\nstatus: todo\n---\n', etag: 'stale' })
      .mockResolvedValueOnce({ content: '---\nstatus: todo\nextra: kept\n---\n', etag: 'fresh' })
    const saveFile = vi.fn()
      .mockRejectedValueOnce({ code: 'CONFLICT', message: 'changed' })
      .mockResolvedValueOnce({ path: 'a.md', name: 'a.md', size: 1, etag: 'done' })
    const apiClient = {
      queryBase: vi.fn().mockResolvedValue(kanbanResult),
      getPropertyTypes: vi.fn().mockResolvedValue({ entries: [] }),
      fetchFileContent, saveFile,
    } as unknown as IApiClient

    await dragTaskAToDone(apiClient)

    await waitFor(() => expect(saveFile).toHaveBeenCalledTimes(2))
    // Re-read before the retry, and the retry carries the fresh ETag.
    expect(fetchFileContent).toHaveBeenCalledTimes(2)
    expect(saveFile.mock.calls[1]?.[3]).toBe('fresh')
    // The concurrent edit's content is the base for the retry (merged, not clobbered).
    expect(saveFile.mock.calls[1]?.[2]).toContain('extra: kept')
    // No error banner on a successful retry.
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('surfaces an error banner for a non-conflict save failure', async () => {
    const fetchFileContent = vi.fn().mockResolvedValue({ content: '---\nstatus: todo\n---\n', etag: 'e1' })
    const saveFile = vi.fn().mockRejectedValue({ code: 'INTERNAL_ERROR', message: 'boom' })
    const apiClient = {
      queryBase: vi.fn().mockResolvedValue(kanbanResult),
      getPropertyTypes: vi.fn().mockResolvedValue({ entries: [] }),
      fetchFileContent, saveFile,
    } as unknown as IApiClient

    await dragTaskAToDone(apiClient)

    // The banner surfaces the server's own message (extractErrorMessage prefers it).
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('boom'))
    expect(saveFile).toHaveBeenCalledTimes(1) // no retry for a non-conflict error
  })
})
