/**
 * BasesEmbed's plugin-view path (gap: a `![[file.base]]`/code-block embed of a
 * plugin-only view type, e.g. `map`, used to always fall back to the table —
 * it never checked the plugin registry the way the full `BasesView` does):
 * - a registered view type mounts the plugin view (reading view: full IApiClient),
 * - the same type with only the narrower Live Preview client stays on the table fallback,
 * - an unregistered type stays on the table fallback,
 * - a throwing factory falls back to the table instead of crashing the embed.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { installObsidianGlobals } from '../../plugins/compat/install-globals'
import { registerBasesView, resetForVault } from '../../plugins/compat/bases-view-registry'
import { BasesEmbed, type IBasesEmbedApiClient } from './BasesEmbed'
import type { IApiClient } from '../../api'
import type { BaseQueryResultWire } from '@slatebase/shared-contracts'

installObsidianGlobals()

const result: BaseQueryResultWire = {
  rows: [{ path: 'a.md', fileName: 'a', values: { title: ['Alpha'] } }],
  total: 1,
}

const SOURCE = 'views:\n  - type: map\n    name: Karte\n    order: [title]\n'

/** The narrower client the Live Preview CM6 widget passes — no `getPropertyTypes`. */
function narrowClient(): IBasesEmbedApiClient {
  return {
    fetchFileContent: vi.fn().mockResolvedValue({ content: SOURCE, isBinary: false }),
    queryBase: vi.fn().mockResolvedValue(result),
  }
}

/** The full `IApiClient` the reading-view path gets via `AppContext`. */
function fullClient(): IApiClient {
  return {
    fetchFileContent: vi.fn().mockResolvedValue({ content: SOURCE, isBinary: false }),
    queryBase: vi.fn().mockResolvedValue(result),
    getPropertyTypes: vi.fn().mockResolvedValue({ entries: [] }),
  } as unknown as IApiClient
}

describe('BasesEmbed plugin views', () => {
  beforeEach(() => resetForVault())
  afterEach(() => resetForVault())

  it('mounts a registered plugin view when the resolved client is the full IApiClient', async () => {
    const factory = vi.fn((_controller: unknown, el: HTMLElement) => ({
      containerEl: el,
      load() {},
      onDataUpdated() { el.textContent = 'PLUGIN MAP RENDERED' },
    }))
    registerBasesView('map', { name: 'Karte', factory }, 'maps-plugin')

    const { container } = render(
      <BasesEmbed vaultId="v1" source={SOURCE} onOpenNote={() => {}} apiClient={fullClient()} />,
    )

    await waitFor(() => expect(factory).toHaveBeenCalledTimes(1))
    const host = container.querySelector('.bases-view__plugin-container') as HTMLElement
    expect(host).toBeTruthy()
    expect(host.getAttribute('data-plugin-id')).toBe('maps-plugin')
    await waitFor(() => expect(screen.getByText('PLUGIN MAP RENDERED')).toBeTruthy())
  })

  it('stays on the table fallback for the same registered type with only the narrower Live Preview client', async () => {
    const factory = vi.fn()
    registerBasesView('map', { name: 'Karte', factory }, 'maps-plugin')

    const { container } = render(
      <BasesEmbed vaultId="v1" source={SOURCE} onOpenNote={() => {}} apiClient={narrowClient()} />,
    )

    await waitFor(() => expect(container.querySelector('.bases-embed--loading')).toBeNull())
    expect(factory).not.toHaveBeenCalled()
    expect(container.querySelector('.bases-view__plugin-container')).toBeNull()
    expect(container.querySelector('table.bases-table')).toBeTruthy()
  })

  it('falls back to the table when no plugin registered the type', async () => {
    const { container } = render(
      <BasesEmbed vaultId="v1" source={SOURCE} onOpenNote={() => {}} apiClient={fullClient()} />,
    )
    await waitFor(() => expect(container.querySelector('.bases-embed--loading')).toBeNull())
    expect(container.querySelector('.bases-view__plugin-container')).toBeNull()
    expect(container.querySelector('table.bases-table')).toBeTruthy()
  })

  it('falls back to the table when the plugin factory throws', async () => {
    registerBasesView('map', { name: 'Karte', factory: () => { throw new Error('boom') } }, 'maps-plugin')

    const { container } = render(
      <BasesEmbed vaultId="v1" source={SOURCE} onOpenNote={() => {}} apiClient={fullClient()} />,
    )
    await waitFor(() => expect(container.querySelector('table.bases-table')).toBeTruthy())
  })
})
