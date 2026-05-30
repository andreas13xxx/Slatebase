/**
 * Unit tests for the PropertiesView component.
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PropertiesView } from './PropertiesView'

describe('PropertiesView', () => {
  it('shows placeholder when no document is open', () => {
    render(
      <PropertiesView data={null} parseError={null} rawFrontmatter={null} hasDocument={false} />
    )

    expect(screen.getByText('Kein Dokument geöffnet.')).toBeInTheDocument()
  })

  it('shows placeholder when no frontmatter found', () => {
    render(
      <PropertiesView data={null} parseError={null} rawFrontmatter={null} />
    )

    expect(screen.getByText('Keine Eigenschaften gefunden.')).toBeInTheDocument()
  })

  it('shows placeholder when data is an empty object', () => {
    render(
      <PropertiesView data={{}} parseError={null} rawFrontmatter="" />
    )

    expect(screen.getByText('Keine Eigenschaften gefunden.')).toBeInTheDocument()
  })

  it('shows error message and raw frontmatter on parse failure', () => {
    const rawContent = 'title: Hello\ninvalid: [unclosed'
    render(
      <PropertiesView
        data={null}
        parseError="Invalid YAML at line 2"
        rawFrontmatter={rawContent}
      />
    )

    expect(screen.getByText('Frontmatter konnte nicht geparst werden.')).toBeInTheDocument()
    const preBlock = document.querySelector('.properties-view__raw-frontmatter')
    expect(preBlock).not.toBeNull()
    expect(preBlock?.tagName).toBe('PRE')
    expect(preBlock?.textContent).toBe(rawContent)
  })

  it('shows error message without raw frontmatter when rawFrontmatter is null', () => {
    render(
      <PropertiesView data={null} parseError="Parse error" rawFrontmatter={null} />
    )

    expect(screen.getByText('Frontmatter konnte nicht geparst werden.')).toBeInTheDocument()
    const container = screen.getByText('Frontmatter konnte nicht geparst werden.').parentElement
    expect(container?.querySelector('pre')).toBeNull()
  })

  it('renders simple key-value pairs as a table', () => {
    const data = {
      title: 'My Note',
      date: '2024-01-15',
      draft: true,
    }

    render(
      <PropertiesView data={data} parseError={null} rawFrontmatter="title: My Note" />
    )

    expect(screen.getByText('title')).toBeInTheDocument()
    expect(screen.getByText('My Note')).toBeInTheDocument()
    expect(screen.getByText('date')).toBeInTheDocument()
    expect(screen.getByText('2024-01-15')).toBeInTheDocument()
    expect(screen.getByText('draft')).toBeInTheDocument()
    expect(screen.getByText('true')).toBeInTheDocument()
  })

  it('renders null values as en-dash', () => {
    const data = {
      emptyField: null,
    }

    render(
      <PropertiesView data={data} parseError={null} rawFrontmatter="emptyField:" />
    )

    expect(screen.getByText('emptyField')).toBeInTheDocument()
    expect(screen.getByText('\u2013')).toBeInTheDocument()
  })

  it('renders boolean values as "true"/"false"', () => {
    const data = {
      published: true,
      archived: false,
    }

    render(
      <PropertiesView data={data} parseError={null} rawFrontmatter="published: true" />
    )

    expect(screen.getByText('true')).toBeInTheDocument()
    expect(screen.getByText('false')).toBeInTheDocument()
  })

  it('renders number values as string representation', () => {
    const data = {
      version: 42,
      rating: 3.14,
    }

    render(
      <PropertiesView data={data} parseError={null} rawFrontmatter="version: 42" />
    )

    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByText('3.14')).toBeInTheDocument()
  })

  it('renders array values as comma-separated inline text', () => {
    const data = {
      tags: ['javascript', 'react', 'typescript'],
    }

    render(
      <PropertiesView data={data} parseError={null} rawFrontmatter="tags: [...]" />
    )

    expect(screen.getByText('tags')).toBeInTheDocument()
    expect(screen.getByText('javascript, react, typescript')).toBeInTheDocument()
  })

  it('renders nested objects with indentation', () => {
    const data = {
      metadata: {
        author: 'Alice',
        version: 2,
      },
    }

    render(
      <PropertiesView data={data} parseError={null} rawFrontmatter="metadata:" />
    )

    expect(screen.getByText('metadata')).toBeInTheDocument()
    expect(screen.getByText('author')).toBeInTheDocument()
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('version')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('indents nested objects by 1rem per level', () => {
    const data = {
      level0: {
        level1: {
          level2: 'deep value',
        },
      },
    }

    render(
      <PropertiesView data={data} parseError={null} rawFrontmatter="" />
    )

    const level0Cell = screen.getByText('level0').closest('td')
    const level1Cell = screen.getByText('level1').closest('td')
    const level2Cell = screen.getByText('level2').closest('td')

    expect(level0Cell).toHaveStyle({ paddingLeft: '0rem' })
    expect(level1Cell).toHaveStyle({ paddingLeft: '1rem' })
    expect(level2Cell).toHaveStyle({ paddingLeft: '2rem' })
  })

  it('renders objects deeper than 5 levels as inline JSON', () => {
    // l1(depth 0) → l2(depth 1) → l3(depth 2) → l4(depth 3) → l5(depth 4) → children at depth 5
    // At depth 5, "l6" has an object value → rendered as inline JSON
    const data = {
      l1: {
        l2: {
          l3: {
            l4: {
              l5: {
                l6: { tooDeep: 'value' },
              },
            },
          },
        },
      },
    }

    render(
      <PropertiesView data={data} parseError={null} rawFrontmatter="" />
    )

    expect(screen.getByText('{"tooDeep":"value"}')).toBeInTheDocument()
  })

  it('sets title attribute on key and value cells for tooltips', () => {
    const data = {
      longKey: 'a long value that might be truncated',
    }

    render(
      <PropertiesView data={data} parseError={null} rawFrontmatter="" />
    )

    const keyCell = screen.getByText('longKey')
    expect(keyCell).toHaveAttribute('title', 'longKey')

    const valueCell = screen.getByText('a long value that might be truncated')
    expect(valueCell).toHaveAttribute('title', 'a long value that might be truncated')
  })

  it('renders mixed array items correctly', () => {
    const data = {
      mixed: [1, 'hello', true, null],
    }

    render(
      <PropertiesView data={data} parseError={null} rawFrontmatter="" />
    )

    // null in array renders as en-dash
    expect(screen.getByText('1, hello, true, \u2013')).toBeInTheDocument()
  })

  it('renders complex array items as JSON', () => {
    const data = {
      items: [{ name: 'a' }, { name: 'b' }],
    }

    render(
      <PropertiesView data={data} parseError={null} rawFrontmatter="" />
    )

    expect(screen.getByText('{"name":"a"}, {"name":"b"}')).toBeInTheDocument()
  })

  it('uses a table element for semantic structure', () => {
    const { container } = render(
      <PropertiesView data={{ key: 'value' }} parseError={null} rawFrontmatter="" />
    )

    expect(container.querySelector('table')).toBeInTheDocument()
  })
})
