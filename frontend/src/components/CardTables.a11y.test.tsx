import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { axe } from 'vitest-axe'
import { AdminUsersPage } from './AdminUsersPage'
import { AdminVaultsPage } from './AdminVaultsPage'
import { McpTokensPage } from './McpTokensPage'
import type { IApiClient } from '../api'

/**
 * The three tables that turn into cards below 768 px (data-table--cards): every value cell names its
 * column through `data-label`, the header stays in the DOM, and the explicit ARIA roles keep the table
 * semantics that `display: block` would drop. The layout itself (CSS) is not measured in jsdom. axe runs on
 * the table only: the surrounding pages' heading order is not what is under test here.
 */

const user = {
  userId: 'u1', username: 'admin', displayName: 'Administrator', email: 'a@example.com',
  avatarUrl: '', avatarType: 'initials', avatarColor: '', avatarData: '', avatarDicebear: '',
  role: 'admin', preferredLanguage: 'de', colorScheme: 'system', suspended: false,
  mustChangePassword: false, createdAt: '2025-01-01T00:00:00Z',
}

/** Every body row has labelled value cells; only the actions cell may go without a label. */
function expectCardStructure(table: HTMLElement, labelledCells: number): void {
  expect(table).toHaveClass('data-table--cards')
  expect(table).toHaveAttribute('role', 'table')
  expect(table.querySelectorAll('thead th[role="columnheader"]').length).toBeGreaterThan(0)
  const row = table.querySelector('tbody tr') as HTMLElement
  expect(row).toHaveAttribute('role', 'row')
  const labelled = row.querySelectorAll('td[role="cell"][data-label]')
  expect(labelled).toHaveLength(labelledCells)
  labelled.forEach((cell) => expect(cell.getAttribute('data-label')).not.toBe(''))
}

describe('card tables', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('users: labelled cells, table roles, no axe violations', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ items: [user], total: 1, page: 1, pageSize: 20, totalPages: 1 })),
    })
    render(<AdminUsersPage apiClient={{
      getToken: vi.fn().mockReturnValue('t'), getCsrfToken: vi.fn().mockReturnValue('c'),
    } as unknown as IApiClient} />)
    const table = await screen.findByRole('table')
    expectCardStructure(table, 6)
    expect(await axe(table)).toHaveNoViolations()
  })

  it('vaults: labelled cells, table roles, no axe violations', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) })
    const apiClient = {
      fetchAllVaults: vi.fn().mockResolvedValue([{ id: 'v1', name: 'Notes', ownerName: 'admin' }]),
      fetchVaultTree: vi.fn().mockResolvedValue({ name: 'root', type: 'directory', path: '/', children: [] }),
    } as unknown as IApiClient
    render(<AdminVaultsPage apiClient={apiClient} />)
    const table = await screen.findByRole('table')
    expectCardStructure(table, 5)
    expect(await axe(table)).toHaveNoViolations()
  })

  it('tokens: labelled cells, table roles, no axe violations', async () => {
    const apiClient = {
      listMcpTokens: vi.fn().mockResolvedValue([{
        tokenId: 't1', name: 'CI', createdAt: '2025-01-01T00:00:00Z', expiresAt: '2025-06-01T00:00:00Z',
        lastUsedAt: null, status: 'active', maskedToken: 'sb_…abcd',
      }]),
    } as unknown as IApiClient
    render(<McpTokensPage apiClient={apiClient} />)
    const table = await screen.findByRole('table')
    await waitFor(() => expect(table.querySelector('tbody tr')).not.toBeNull())
    // The name cell is the card title and the actions cell has no label: four labelled cells.
    expectCardStructure(table, 4)
    expect(await axe(table)).toHaveNoViolations()
  })
})
