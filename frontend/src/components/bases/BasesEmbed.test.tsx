import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { BasesEmbed, type IBasesEmbedApiClient } from './BasesEmbed'

const SOURCE = 'views:\n  - type: table\n    name: Table\n'

function createClient(overrides: Partial<IBasesEmbedApiClient> = {}): IBasesEmbedApiClient {
  return {
    fetchFileContent: vi.fn().mockResolvedValue({ content: SOURCE, isBinary: false }),
    queryBase: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
    ...overrides,
  }
}

describe('BasesEmbed', () => {
  it('renders an inline source without fetching a file and without a header', async () => {
    const apiClient = createClient()
    const { container } = render(
      <BasesEmbed vaultId="v1" source={SOURCE} onOpenNote={vi.fn()} apiClient={apiClient} />
    )

    await waitFor(() => expect(apiClient.queryBase).toHaveBeenCalled())
    await waitFor(() => expect(container.querySelector('.bases-embed--loading')).toBeNull())

    expect(apiClient.fetchFileContent).not.toHaveBeenCalled()
    expect(container.querySelector('.view-mode-embed-header')).toBeNull()
  })

  it('reports an invalid inline source instead of crashing', async () => {
    render(<BasesEmbed vaultId="v1" source={'views: [unterminated'} onOpenNote={vi.fn()} apiClient={createClient()} />)

    expect(await screen.findByText(/Ungültige Base/)).toBeTruthy()
  })

  it('still fetches the file and shows its name for a file embed', async () => {
    const apiClient = createClient()
    render(<BasesEmbed vaultId="v1" filePath="a.base" target="a" onOpenNote={vi.fn()} apiClient={apiClient} />)

    expect(await screen.findByText('a')).toBeTruthy()
    expect(apiClient.fetchFileContent).toHaveBeenCalledWith('v1', 'a.base')
  })
})
