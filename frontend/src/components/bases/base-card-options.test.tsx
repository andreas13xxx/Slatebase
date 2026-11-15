import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { BaseDocument, BaseRow, BaseView } from '@slatebase/shared-contracts'
import { parseBase } from '@slatebase/shared-contracts'
import { BasesCardsView } from './BasesCardsView'
import { BasesToolbar } from './BasesToolbar'
import { setCardSize, setCardImageProperty, setCardImageFit, setCardImageAspectRatio, CARD_SIZE } from './base-edit'

// Written by Obsidian: size 440, ratio 2.5, fit "contain", image property `file.file`.
const SAMPLE = `views:
  - type: cards
    name: Sicht
    image: file.file
    imageAspectRatio: 2.5
    cardSize: 440
    imageFit: contain
`

const doc = (): BaseDocument => ({ properties: { cover: {} }, views: [{ type: 'cards', name: 'G' }] })

describe('card option edits', () => {
  it('clamps the size to 50-800 and never writes the default', () => {
    expect(setCardSize(doc(), 0, 9999).views[0]!.cardSize).toBe(800)
    expect(setCardSize(doc(), 0, 1).views[0]!.cardSize).toBe(50)
    expect('cardSize' in setCardSize(setCardSize(doc(), 0, 300), 0, CARD_SIZE.default).views[0]!).toBe(false)
  })

  it('clamps the ratio to 0.25-2.5 and never writes the default', () => {
    expect(setCardImageAspectRatio(doc(), 0, 9).views[0]!.imageAspectRatio).toBe(2.5)
    expect(setCardImageAspectRatio(doc(), 0, 0.01).views[0]!.imageAspectRatio).toBe(0.25)
    expect('imageAspectRatio' in setCardImageAspectRatio(doc(), 0, 1).views[0]!).toBe(false)
  })

  it('writes contain only; fill removes the key', () => {
    const d = setCardImageFit(doc(), 0, 'contain')
    expect(d.views[0]!.imageFit).toBe('contain')
    expect('imageFit' in setCardImageFit(d, 0, 'cover').views[0]!).toBe(false)
  })

  it('sets and clears the image property', () => {
    const d = setCardImageProperty(doc(), 0, 'cover')
    expect(d.views[0]!.image).toBe('cover')
    expect('image' in setCardImageProperty(d, 0, '').views[0]!).toBe(false)
  })

  it('reads the Obsidian sample', () => {
    const r = parseBase(SAMPLE)
    if (!r.success) throw new Error('parse failed')
    expect(r.errors ?? []).toEqual([])
    expect(r.document.views[0]).toMatchObject({ image: 'file.file', imageAspectRatio: 2.5, cardSize: 440, imageFit: 'contain' })
  })
})

describe('cards rendering', () => {
  const rows: BaseRow[] = [{ path: 'a.md', fileName: 'a', values: { cover: ['https://example.com/x.png'] } }]
  const renderCards = (view: BaseView) =>
    render(<BasesCardsView doc={doc()} view={view} rows={rows} vaultId="v" onOpenNote={() => {}} />)

  it('clamps an out-of-range size and ratio', () => {
    const { container } = renderCards({ type: 'cards', image: 'cover', cardSize: 5000, imageAspectRatio: 9 })
    expect((container.querySelector('.bases-cards') as HTMLElement).style.getPropertyValue('--bases-card-size')).toBe('800px')
    expect((container.querySelector('.bases-cards__cover') as HTMLElement).style.aspectRatio).toMatch(/^2\.5(\s*\/\s*1)?$/)
  })

  it('fits the image in for contain', () => {
    const { container } = renderCards({ type: 'cards', image: 'cover', imageFit: 'contain' })
    expect((container.querySelector('img') as HTMLElement).style.objectFit).toBe('contain')
  })

  it('fills by default', () => {
    const { container } = renderCards({ type: 'cards', image: 'cover' })
    expect((container.querySelector('img') as HTMLElement).style.objectFit).toBe('cover')
  })

  it('shows no image for file.file when the note is not an image', () => {
    const { container } = renderCards({ type: 'cards', image: 'file.file' })
    expect(container.querySelector('.bases-cards__cover')).toBeNull()
  })
})

describe('Anzeige panel for cards', () => {
  function setup() {
    let current = doc()
    const onChange = vi.fn()
    render(
      <BasesToolbar doc={current} rows={[]} activeIndex={0} readOnly={false} mode="view" onSelectView={() => {}} onChange={onChange} searchQuery="" onSearchQueryChange={() => {}} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Anzeige/ }))
    const apply = (): BaseDocument => { current = onChange.mock.calls.at(-1)![0](current); return current }
    return { apply, onChange }
  }

  it('sets size, fit and ratio', () => {
    const { apply } = setup()
    const size = screen.getByLabelText('Kartengröße')
    fireEvent.change(size, { target: { value: '440' } })
    fireEvent.blur(size)
    expect(apply().views[0]!.cardSize).toBe(440)
    fireEvent.change(screen.getByLabelText('Bildanpassung'), { target: { value: 'contain' } })
    expect(apply().views[0]!.imageFit).toBe('contain')
    const ratio = screen.getByLabelText('Bildformat')
    fireEvent.change(ratio, { target: { value: '2,5' } })
    fireEvent.blur(ratio)
    expect(apply().views[0]!.imageAspectRatio).toBe(2.5)
  })

  it('ignores text that is not a number', () => {
    const { onChange } = setup()
    const size = screen.getByLabelText('Kartengröße')
    fireEvent.change(size, { target: { value: 'abc' } })
    fireEvent.blur(size)
    expect(onChange).not.toHaveBeenCalled()
  })
})
