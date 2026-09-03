import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { TagsView } from './TagsView'
import type { TagEntry } from '../../state/documentPanelData'

describe('TagsView', () => {
  const defaultProps = {
    tags: [] as TagEntry[],
    loading: false,
    expandedTag: null as string | null,
    tagFiles: [] as string[],
    onTagClick: vi.fn(),
    onFileClick: vi.fn(),
  }

  it('shows loading indicator when loading is true', () => {
    render(React.createElement(TagsView, { ...defaultProps, loading: true }))
    expect(screen.getByText('Laden…')).toBeInTheDocument()
  })

  it('shows placeholder when no tags found', () => {
    render(React.createElement(TagsView, { ...defaultProps, tags: [] }))
    expect(screen.getByText('Keine Tags gefunden.')).toBeInTheDocument()
  })

  it('renders tags sorted alphabetically case-insensitive', () => {
    const tags: TagEntry[] = [
      { name: 'Zebra', count: 1 },
      { name: 'alpha', count: 3 },
      { name: 'Beta', count: 2 },
    ]
    render(React.createElement(TagsView, { ...defaultProps, tags }))

    const buttons = screen.getAllByRole('button')
    // Sorted: alpha, Beta, Zebra (case-insensitive)
    expect(buttons[0]).toHaveTextContent('#alpha')
    expect(buttons[1]).toHaveTextContent('#Beta')
    expect(buttons[2]).toHaveTextContent('#Zebra')
  })

  it('displays tag name with # prefix and occurrence count', () => {
    const tags: TagEntry[] = [{ name: 'project', count: 5 }]
    render(React.createElement(TagsView, { ...defaultProps, tags }))

    expect(screen.getByText('#project')).toBeInTheDocument()
    expect(screen.getByText('(5)')).toBeInTheDocument()
  })

  it('calls onTagClick when a tag is clicked', async () => {
    const user = userEvent.setup()
    const onTagClick = vi.fn()
    const tags: TagEntry[] = [{ name: 'todo', count: 2 }]
    render(React.createElement(TagsView, { ...defaultProps, tags, onTagClick }))

    await user.click(screen.getByRole('button'))
    expect(onTagClick).toHaveBeenCalledWith('todo')
  })

  it('shows file list when tag is expanded', () => {
    const tags: TagEntry[] = [{ name: 'project', count: 2 }]
    const tagFiles = ['notes/meeting.md', 'ideas/brainstorm.md']
    render(React.createElement(TagsView, {
      ...defaultProps,
      tags,
      expandedTag: 'project',
      tagFiles,
    }))

    // File paths are displayed without .md extension
    expect(screen.getByText('notes/meeting')).toBeInTheDocument()
    expect(screen.getByText('ideas/brainstorm')).toBeInTheDocument()
  })

  it('calls onFileClick with full path when a file in expanded tag is clicked', async () => {
    const user = userEvent.setup()
    const onFileClick = vi.fn()
    const tags: TagEntry[] = [{ name: 'project', count: 1 }]
    const tagFiles = ['notes/meeting.md']
    render(React.createElement(TagsView, {
      ...defaultProps,
      tags,
      expandedTag: 'project',
      tagFiles,
      onFileClick,
    }))

    await user.click(screen.getByText('notes/meeting'))
    expect(onFileClick).toHaveBeenCalledWith('notes/meeting.md')
  })

  it('sets aria-expanded on expanded tag button', () => {
    const tags: TagEntry[] = [
      { name: 'alpha', count: 1 },
      { name: 'beta', count: 2 },
    ]
    render(React.createElement(TagsView, {
      ...defaultProps,
      tags,
      expandedTag: 'alpha',
      tagFiles: ['file.md'],
    }))

    const buttons = screen.getAllByRole('button')
    // alpha is first (sorted), should be expanded; beta is second
    const alphaButton = buttons.find(b => b.textContent?.includes('#alpha'))
    const betaButton = buttons.find(b => b.textContent?.includes('#beta'))
    expect(alphaButton).toHaveAttribute('aria-expanded', 'true')
    expect(betaButton).toHaveAttribute('aria-expanded', 'false')
  })

  it('displays title attribute with full tag info for tooltip', () => {
    const tags: TagEntry[] = [{ name: 'project', count: 3 }]
    render(React.createElement(TagsView, { ...defaultProps, tags }))

    const button = screen.getByRole('button')
    expect(button).toHaveAttribute('title', '#project (3)')
  })

  it('strips .md extension from file paths in expanded list', () => {
    const tags: TagEntry[] = [{ name: 'test', count: 1 }]
    const tagFiles = ['hello.md']
    render(React.createElement(TagsView, {
      ...defaultProps,
      tags,
      expandedTag: 'test',
      tagFiles,
    }))

    expect(screen.getByText('hello')).toBeInTheDocument()
  })

  it('preserves file paths without .md extension', () => {
    const tags: TagEntry[] = [{ name: 'test', count: 1 }]
    const tagFiles = ['data.csv']
    render(React.createElement(TagsView, {
      ...defaultProps,
      tags,
      expandedTag: 'test',
      tagFiles,
    }))

    expect(screen.getByText('data.csv')).toBeInTheDocument()
  })

  it('file buttons have title attribute with full path for tooltip', () => {
    const tags: TagEntry[] = [{ name: 'test', count: 1 }]
    const tagFiles = ['very/long/path/to/file.md']
    render(React.createElement(TagsView, {
      ...defaultProps,
      tags,
      expandedTag: 'test',
      tagFiles,
    }))

    const fileButton = screen.getByText('very/long/path/to/file')
    expect(fileButton).toHaveAttribute('title', 'very/long/path/to/file.md')
  })

  describe('nested tags', () => {
    const nested: TagEntry[] = [
      { name: 'Rezepte/Hauptspeise', count: 2, files: ['a.md', 'b.md'] },
      { name: 'Rezepte/Nachtisch', count: 1, files: ['c.md'] },
      { name: 'flach', count: 1, files: ['d.md'] },
    ]

    it('collapses a family of tags into one row with the subtree total', () => {
      render(React.createElement(TagsView, { ...defaultProps, tags: nested }))

      expect(screen.getByText('#Rezepte')).toBeInTheDocument()
      expect(screen.getByText('(3)')).toBeInTheDocument()
      // Collapsed by default — that condensing is the point of the tree.
      expect(screen.queryByText('Hauptspeise')).not.toBeInTheDocument()
    })

    it('counts a note once even when it carries a parent and a child tag', () => {
      const tags: TagEntry[] = [
        { name: 'Rezepte', count: 1, files: ['a.md'] },
        { name: 'Rezepte/Hauptspeise', count: 1, files: ['a.md'] },
      ]
      render(React.createElement(TagsView, { ...defaultProps, tags }))

      // One note, one row: summing the two counts would claim two.
      expect(screen.getByText('(1)')).toBeInTheDocument()
    })

    it('reveals the children when the branch is expanded', async () => {
      const user = userEvent.setup()
      render(React.createElement(TagsView, { ...defaultProps, tags: nested }))

      await user.click(screen.getByLabelText('Tags unter Rezepte anzeigen'))

      // Children show only their own segment — the parent is already the row above.
      expect(screen.getByText('Hauptspeise')).toBeInTheDocument()
      expect(screen.getByText('Nachtisch')).toBeInTheDocument()
    })

    it('opens the full tag name when a child row is clicked', async () => {
      const user = userEvent.setup()
      const onTagClick = vi.fn()
      render(React.createElement(TagsView, { ...defaultProps, tags: nested, onTagClick }))

      await user.click(screen.getByLabelText('Tags unter Rezepte anzeigen'))
      await user.click(screen.getByText('Hauptspeise'))

      expect(onTagClick).toHaveBeenCalledWith('Rezepte/Hauptspeise')
    })

    it('toggles the branch when a row no note carries directly is clicked', async () => {
      const user = userEvent.setup()
      const onTagClick = vi.fn()
      render(React.createElement(TagsView, { ...defaultProps, tags: nested, onTagClick }))

      // No note is tagged `#Rezepte` itself, so its row has no file list to open.
      await user.click(screen.getByText('#Rezepte'))

      expect(onTagClick).not.toHaveBeenCalled()
      expect(screen.getByText('Hauptspeise')).toBeInTheDocument()
    })

    it('reveals a nested tag whose file list was expanded elsewhere', () => {
      render(React.createElement(TagsView, {
        ...defaultProps,
        tags: nested,
        expandedTag: 'Rezepte/Hauptspeise',
        tagFiles: ['a.md'],
      }))

      expect(screen.getByText('Hauptspeise')).toBeInTheDocument()
      expect(screen.getByText('a')).toBeInTheDocument()
    })

    it('leaves flat tags without a branch toggle', () => {
      render(React.createElement(TagsView, { ...defaultProps, tags: [{ name: 'flach', count: 1 }] }))

      expect(screen.getAllByRole('button')).toHaveLength(1)
    })
  })
})
