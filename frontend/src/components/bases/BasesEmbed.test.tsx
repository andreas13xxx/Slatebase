import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { BasesEmbed, type IBasesEmbedApiClient } from './BasesEmbed'
import { pickEmbedView } from './pickEmbedView'
import { parseBase } from '../../bases'

const SOURCE = 'views:\n  - type: table\n    name: Table\n'
const TWO_VIEWS = 'views:\n  - type: table\n    name: Alle\n  - type: cards\n    name: Board\n'

function docOf(yaml: string) {
  const parsed = parseBase(yaml)
  if (!parsed.success) throw new Error('fixture does not parse')
  return parsed.document
}

describe('pickEmbedView', () => {
  it('takes the first view without a name', () => {
    expect(pickEmbedView(docOf(TWO_VIEWS), undefined)).toMatchObject({ view: { name: 'Alle' } })
  })

  it('takes the named view', () => {
    expect(pickEmbedView(docOf(TWO_VIEWS), 'Board')).toMatchObject({ view: { name: 'Board' } })
  })

  it('trims the name', () => {
    expect(pickEmbedView(docOf(TWO_VIEWS), ' Board ')).toMatchObject({ view: { name: 'Board' } })
  })

  it('reports an unknown name instead of falling back to the first view', () => {
    expect(pickEmbedView(docOf(TWO_VIEWS), 'Gibt es nicht')).toEqual({ error: 'Ansicht nicht gefunden: Gibt es nicht' })
  })

  it('reports a base without views', () => {
    expect(pickEmbedView({ views: [] } as never, undefined)).toEqual({ error: 'Base hat keine Ansicht' })
  })
})

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

  it('queries the named view of a file embed and names it in the header', async () => {
    const apiClient = createClient({ fetchFileContent: vi.fn().mockResolvedValue({ content: TWO_VIEWS, isBinary: false }) })
    render(<BasesEmbed vaultId="v1" filePath="a.base" target="a" viewName="Board" onOpenNote={vi.fn()} apiClient={apiClient} />)

    expect(await screen.findByText('a › Board')).toBeTruthy()
    expect(apiClient.queryBase).toHaveBeenCalledWith('v1', expect.objectContaining({}))
  })

  it('shows an error for an unknown view name and runs no query', async () => {
    const apiClient = createClient({ fetchFileContent: vi.fn().mockResolvedValue({ content: TWO_VIEWS, isBinary: false }) })
    render(<BasesEmbed vaultId="v1" filePath="a.base" target="a" viewName="Fehlt" onOpenNote={vi.fn()} apiClient={apiClient} />)

    expect(await screen.findByText('Ansicht nicht gefunden: Fehlt')).toBeTruthy()
    expect(apiClient.queryBase).not.toHaveBeenCalled()
  })

  it('looks up the host note for this.* when a host path is given', async () => {
    const apiClient = createClient()
    const source = 'filters: file.hasLink(this.file)\nviews:\n  - type: table\n    name: Table\n'
    render(<BasesEmbed vaultId="v1" source={source} hostPath="Projekte/Plan.md" onOpenNote={vi.fn()} apiClient={apiClient} />)

    await waitFor(() => expect(apiClient.queryBase).toHaveBeenCalledWith('v1', expect.objectContaining({ filters: { path: 'Projekte/Plan.md' } })))
  })

  it('makes no host lookup without this.* in the base', async () => {
    const apiClient = createClient()
    render(<BasesEmbed vaultId="v1" source={SOURCE} hostPath="Projekte/Plan.md" onOpenNote={vi.fn()} apiClient={apiClient} />)

    await waitFor(() => expect(apiClient.queryBase).toHaveBeenCalledTimes(1))
  })

  it('ignores a view name for an inline block', async () => {
    const apiClient = createClient()
    const { container } = render(<BasesEmbed vaultId="v1" source={SOURCE} viewName="Fehlt" onOpenNote={vi.fn()} apiClient={apiClient} />)

    await waitFor(() => expect(apiClient.queryBase).toHaveBeenCalled())
    expect(container.querySelector('.view-mode-embed--missing')).toBeNull()
  })

  it('still fetches the file and shows its name for a file embed', async () => {
    const apiClient = createClient()
    render(<BasesEmbed vaultId="v1" filePath="a.base" target="a" onOpenNote={vi.fn()} apiClient={apiClient} />)

    expect(await screen.findByText('a')).toBeTruthy()
    expect(apiClient.fetchFileContent).toHaveBeenCalledWith('v1', 'a.base')
  })
})
