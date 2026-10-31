import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { axe } from 'vitest-axe'
import { VaultConfigSection } from './VaultConfigSection'
import type { IApiClient, VaultConfig } from '../../api'

vi.mock('../ToastNotification', () => ({ showToast: vi.fn() }))

function createClient(overrides: Partial<VaultConfig> = {}) {
  let config: VaultConfig = {
    templatesDirectory: 'Templates',
    dailyNotesDirectory: 'Journal',
    dailyNoteTemplate: 'Templates/daily.md',
    dailyNoteFormat: null,
    uniqueNoteDirectory: '',
    activityRetentionDays: 90,
    ...overrides,
  }
  return {
    getVaultConfig: vi.fn(async () => config),
    saveVaultConfig: vi.fn(async (_id: string, change: Partial<VaultConfig>) => {
      config = { ...config, ...change }
      return config
    }),
  }
}

const renderSection = (client: ReturnType<typeof createClient>) =>
  render(<VaultConfigSection apiClient={client as unknown as IApiClient} vaultId="v1" />)

describe('VaultConfigSection: daily note format', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows the default format and a preview of today\'s note name', async () => {
    renderSection(createClient())
    const input = await screen.findByLabelText('Tagesnotiz-Datumsformat')
    expect(input).toHaveValue('YYYY-MM-DD')
    expect(document.getElementById('vault-daily-note-format-preview')?.textContent).toMatch(/^Heute: \d{4}-\d{2}-\d{2}\.md$/)
  })

  it('previews the note name for the format typed and saves it', async () => {
    const client = createClient()
    renderSection(client)
    const input = await screen.findByLabelText('Tagesnotiz-Datumsformat')

    fireEvent.change(input, { target: { value: 'YYYY/MM/YYYY-MM-DD' } })
    expect(document.getElementById('vault-daily-note-format-preview')?.textContent).toMatch(/^Heute: \d{4}\/\d{2}\/\d{4}-\d{2}-\d{2}\.md$/)

    fireEvent.click(screen.getByRole('button', { name: /speichern/i }))
    await waitFor(() => expect(client.saveVaultConfig).toHaveBeenCalled())
    expect(client.saveVaultConfig.mock.calls[0]?.[1]).toMatchObject({ dailyNoteFormat: 'YYYY/MM/YYYY-MM-DD' })
  })

  it('does not send the format when it was not changed', async () => {
    const client = createClient()
    renderSection(client)
    const folder = await screen.findByLabelText(/Tagesnotizen-Verzeichnis|Verzeichnis für Tagesnotizen/i)
    fireEvent.change(folder, { target: { value: 'Tagebuch' } })

    fireEvent.click(screen.getByRole('button', { name: /speichern/i }))
    await waitFor(() => expect(client.saveVaultConfig).toHaveBeenCalled())
    expect(client.saveVaultConfig.mock.calls[0]?.[1]).not.toHaveProperty('dailyNoteFormat')
  })

  it('refuses a format that cannot name notes: message instead of preview, save disabled', async () => {
    const client = createClient()
    renderSection(client)
    const input = await screen.findByLabelText('Tagesnotiz-Datumsformat')

    fireEvent.change(input, { target: { value: '[Tagebuch]' } })

    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(document.getElementById('vault-daily-note-format-preview')?.textContent).toMatch(/Datumsangaben/)
    expect(screen.getByRole('button', { name: /speichern/i })).toBeDisabled()
  })

  it('has no accessibility violations', async () => {
    const { container } = renderSection(createClient({ dailyNoteFormat: 'DD.MM.YYYY' }))
    await screen.findByLabelText('Tagesnotiz-Datumsformat')
    expect(await axe(container)).toHaveNoViolations()
  }, 30000)
})
