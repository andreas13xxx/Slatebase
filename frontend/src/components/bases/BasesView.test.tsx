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
import type { BaseQueryResultWire } from '../../bases/types'

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
