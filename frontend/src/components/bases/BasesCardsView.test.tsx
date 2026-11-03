import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { BaseDocument, BaseRow, BaseView } from '@slatebase/shared-contracts'
import { BasesCardsView } from './BasesCardsView'
import { parseCardImage } from './cardImage'

const doc: BaseDocument = { views: [] }
const row = (path: string, values: Record<string, unknown> = {}): BaseRow => ({
  path, fileName: path.replace(/\.md$/, ''), values,
})

describe('parseCardImage', () => {
  it('classifies colours, wikilinks, urls and paths', () => {
    expect(parseCardImage('#ff0000')).toEqual({ kind: 'color', color: '#ff0000' })
    expect(parseCardImage('[[pics/a.jpg]]')).toEqual({ kind: 'file', target: 'pics/a.jpg' })
    expect(parseCardImage('![[a.png|100]]')).toEqual({ kind: 'file', target: 'a.png' })
    expect(parseCardImage('https://x.test/a.png')).toEqual({ kind: 'url', src: 'https://x.test/a.png' })
    expect(parseCardImage('plain/path.png')).toEqual({ kind: 'file', target: 'plain/path.png' })
    expect(parseCardImage('')).toBeNull()
  })

  it('rejects non-http schemes', () => {
    expect(parseCardImage('javascript:alert(1)')).toEqual({ kind: 'file', target: 'javascript:alert(1)' })
    expect(parseCardImage('http://[bad')).toBeNull()
  })
})

describe('BasesCardsView', () => {
  const view: BaseView = { type: 'cards', image: 'cover', imageFit: 'contain', imageAspectRatio: 2, cardSize: 300, order: ['file.name', 'cover', 'status'] }

  it('renders a card per row with image options applied', () => {
    const rows = [row('a.md', { cover: ['https://x.test/a.png'], status: ['open'] }), row('b.md', { cover: ['#00ff00'] })]
    const { container } = render(<BasesCardsView doc={doc} view={view} rows={rows} vaultId="v1" onOpenNote={() => {}} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    const img = container.querySelector('img')!
    expect(img.getAttribute('src')).toBe('https://x.test/a.png')
    expect(img.style.objectFit).toBe('contain')
    expect((container.querySelector('.bases-cards__cover') as HTMLElement).style.aspectRatio).toMatch(/^2( \/ 1)?$/)
    expect((container.querySelector('.bases-cards') as HTMLElement).style.getPropertyValue('--bases-card-size')).toBe('300px')
    expect(screen.getByText('open')).toBeTruthy()
  })

  it('resolves a vault file through the raw endpoint', () => {
    const { container } = render(
      <BasesCardsView doc={doc} view={view} rows={[row('a.md', { cover: ['[[pics/a.jpg]]'] })]} vaultId="v 1" onOpenNote={() => {}} />,
    )
    expect(container.querySelector('img')!.getAttribute('src')).toBe('/api/v1/vaults/v%201/files?path=pics%2Fa.jpg&raw=true')
  })

  it('opens the note on click', async () => {
    const onOpen = vi.fn()
    render(<BasesCardsView doc={doc} view={{ type: 'cards' }} rows={[row('a.md')]} vaultId="v" onOpenNote={onOpen} />)
    await userEvent.click(screen.getByRole('button'))
    expect(onOpen).toHaveBeenCalledWith('a.md')
  })
})
