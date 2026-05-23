import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { ViewMode, resolveWikilinkTarget } from './ViewMode'
import type { DirectoryTree } from '../types'

describe('ViewMode', () => {
  const defaultProps = {
    content: '',
    vaultId: 'test-vault',
    directoryTree: null,
  }

  it('renders an article element with aria-label', () => {
    const { container } = render(<ViewMode {...defaultProps} content="Hello" />)
    const article = container.querySelector('article')
    expect(article).not.toBeNull()
    expect(article?.getAttribute('aria-label')).toBe('Markdown-Ansicht')
  })

  describe('Headings as collapsible sections (Req 5.2)', () => {
    it('renders H1 as details/summary with open attribute', () => {
      const { container } = render(<ViewMode {...defaultProps} content={"# Title\n\nSome content"} />)
      const details = container.querySelector('details')
      expect(details).not.toBeNull()
      expect(details?.hasAttribute('open')).toBe(true)
      const summary = details?.querySelector('summary')
      expect(summary).not.toBeNull()
      const h1 = summary?.querySelector('h1')
      expect(h1?.textContent).toBe('Title')
    })

    it('renders H2 inside H1 section as nested details', () => {
      const { container } = render(
        <ViewMode {...defaultProps} content={"# Title\n\n## Subtitle\n\nContent"} />
      )
      const allDetails = container.querySelectorAll('details')
      expect(allDetails.length).toBe(2)
      // The H2 should be nested inside the H1 section
      const h1Details = allDetails[0]
      const h2Details = h1Details?.querySelector('details')
      expect(h2Details).not.toBeNull()
      expect(h2Details?.querySelector('h2')?.textContent).toBe('Subtitle')
    })

    it('renders same-level headings as sibling sections', () => {
      const { container } = render(
        <ViewMode {...defaultProps} content={"## First\n\nContent 1\n\n## Second\n\nContent 2"} />
      )
      const article = container.querySelector('article')
      const topDetails = article?.querySelectorAll(':scope > details')
      expect(topDetails?.length).toBe(2)
    })
  })

  describe('Text formatting (Req 5.3)', () => {
    it('renders bold text as <strong>', () => {
      const { container } = render(<ViewMode {...defaultProps} content="**bold text**" />)
      const strong = container.querySelector('strong')
      expect(strong?.textContent).toBe('bold text')
    })

    it('renders italic text as <em>', () => {
      const { container } = render(<ViewMode {...defaultProps} content="*italic text*" />)
      const em = container.querySelector('em')
      expect(em?.textContent).toBe('italic text')
    })

    it('renders strikethrough as <del>', () => {
      const { container } = render(<ViewMode {...defaultProps} content="~~deleted~~" />)
      const del = container.querySelector('del')
      expect(del?.textContent).toBe('deleted')
    })

    it('renders inline code as <code>', () => {
      const { container } = render(<ViewMode {...defaultProps} content="`inline code`" />)
      const code = container.querySelector('code.view-mode-inline-code')
      expect(code?.textContent).toBe('inline code')
    })
  })

  describe('Lists (Req 5.4)', () => {
    it('renders unordered list', () => {
      const { container } = render(<ViewMode {...defaultProps} content={"- Item 1\n- Item 2\n- Item 3"} />)
      const ul = container.querySelector('ul')
      expect(ul).not.toBeNull()
      const items = ul?.querySelectorAll('li')
      expect(items?.length).toBe(3)
    })

    it('renders ordered list', () => {
      const { container } = render(<ViewMode {...defaultProps} content={"1. First\n2. Second\n3. Third"} />)
      const ol = container.querySelector('ol')
      expect(ol).not.toBeNull()
      const items = ol?.querySelectorAll('li')
      expect(items?.length).toBe(3)
    })

    it('renders task list with non-interactive checkboxes', () => {
      const { container } = render(
        <ViewMode {...defaultProps} content={"- [x] Done\n- [ ] Not done"} />
      )
      const checkboxes = container.querySelectorAll('input[type="checkbox"]')
      expect(checkboxes.length).toBe(2)
      expect((checkboxes[0] as HTMLInputElement).checked).toBe(true)
      expect((checkboxes[0] as HTMLInputElement).disabled).toBe(true)
      expect((checkboxes[1] as HTMLInputElement).checked).toBe(false)
      expect((checkboxes[1] as HTMLInputElement).disabled).toBe(true)
    })
  })

  describe('Code blocks (Req 5.5)', () => {
    it('renders code block with syntax highlighting for known language', () => {
      const { container } = render(
        <ViewMode {...defaultProps} content={'```javascript\nconst x = 1;\n```'} />
      )
      const code = container.querySelector('code.hljs.language-javascript')
      expect(code).not.toBeNull()
      // Should have highlighted HTML (spans with hljs classes)
      expect(code?.innerHTML).toContain('hljs-')
    })

    it('renders code block as plain monospace for unknown language', () => {
      const { container } = render(
        <ViewMode {...defaultProps} content={'```unknownlang123\nsome code\n```'} />
      )
      const pre = container.querySelector('pre.view-mode-code')
      expect(pre).not.toBeNull()
      const code = pre?.querySelector('code')
      expect(code?.textContent).toBe('some code')
      // Should NOT have hljs class
      expect(code?.classList.contains('hljs')).toBe(false)
    })

    it('renders code block without language as plain monospace', () => {
      const { container } = render(
        <ViewMode {...defaultProps} content={'```\nplain code\n```'} />
      )
      const code = container.querySelector('pre.view-mode-code code')
      expect(code?.textContent).toBe('plain code')
    })
  })

  describe('Tables (Req 5.6)', () => {
    it('renders GFM table with thead and tbody', () => {
      const markdown = '| Header 1 | Header 2 |\n| --- | --- |\n| Cell 1 | Cell 2 |'
      const { container } = render(<ViewMode {...defaultProps} content={markdown} />)
      const table = container.querySelector('table')
      expect(table).not.toBeNull()
      const thead = table?.querySelector('thead')
      expect(thead).not.toBeNull()
      const ths = thead?.querySelectorAll('th')
      expect(ths?.length).toBe(2)
      expect(ths?.[0]?.textContent).toBe('Header 1')
      const tbody = table?.querySelector('tbody')
      expect(tbody).not.toBeNull()
      const tds = tbody?.querySelectorAll('td')
      expect(tds?.length).toBe(2)
      expect(tds?.[0]?.textContent).toBe('Cell 1')
    })
  })

  describe('Blockquotes and horizontal rules (Req 5.6)', () => {
    it('renders blockquote', () => {
      const { container } = render(<ViewMode {...defaultProps} content={"> This is a quote"} />)
      const blockquote = container.querySelector('blockquote')
      expect(blockquote).not.toBeNull()
      expect(blockquote?.textContent).toContain('This is a quote')
    })

    it('renders horizontal rule', () => {
      const { container } = render(<ViewMode {...defaultProps} content={"Above\n\n---\n\nBelow"} />)
      const hr = container.querySelector('hr')
      expect(hr).not.toBeNull()
    })
  })

  describe('Links', () => {
    it('renders external links with target="_blank" and rel="noopener noreferrer"', () => {
      const { container } = render(
        <ViewMode {...defaultProps} content={"[Google](https://google.com)"} />
      )
      const link = container.querySelector('a')
      expect(link?.getAttribute('href')).toBe('https://google.com')
      expect(link?.getAttribute('target')).toBe('_blank')
      expect(link?.getAttribute('rel')).toBe('noopener noreferrer')
      expect(link?.textContent).toBe('Google')
    })

    it('renders internal links that call onInternalLinkClick', () => {
      const onClick = vi.fn()
      const { container } = render(
        <ViewMode {...defaultProps} content={"[Note](./other.md)"} onInternalLinkClick={onClick} />
      )
      const link = container.querySelector('a.view-mode-link--internal')
      expect(link).not.toBeNull()
      link?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      expect(onClick).toHaveBeenCalledWith('./other.md')
    })
  })

  describe('Error handling (Req 5.7)', () => {
    it('renders empty content without crashing', () => {
      const { container } = render(<ViewMode {...defaultProps} content="" />)
      const article = container.querySelector('article')
      expect(article).not.toBeNull()
    })

    it('renders content with mixed valid and complex markdown without crashing', () => {
      const complexMarkdown = `# Title

**Bold** and *italic* and ~~strike~~

- List item
  - Nested

\`\`\`python
def hello():
    print("world")
\`\`\`

| A | B |
|---|---|
| 1 | 2 |

> Quote

---

[Link](https://example.com)
`
      const { container } = render(<ViewMode {...defaultProps} content={complexMarkdown} />)
      const article = container.querySelector('article')
      expect(article).not.toBeNull()
      // Should have rendered various elements
      expect(container.querySelector('strong')).not.toBeNull()
      expect(container.querySelector('em')).not.toBeNull()
      expect(container.querySelector('del')).not.toBeNull()
      expect(container.querySelector('ul')).not.toBeNull()
      expect(container.querySelector('table')).not.toBeNull()
      expect(container.querySelector('blockquote')).not.toBeNull()
      expect(container.querySelector('hr')).not.toBeNull()
    })
  })

  describe('Wikilinks (Req 6.1, 6.6)', () => {
    const treeWithFiles: DirectoryTree = {
      name: 'root',
      type: 'directory',
      path: '',
      children: [
        { name: 'Notes.md', type: 'file', path: 'Notes.md' },
        { name: 'README.md', type: 'file', path: 'README.md' },
        {
          name: 'subfolder',
          type: 'directory',
          path: 'subfolder',
          children: [
            { name: 'Deep Note.md', type: 'file', path: 'subfolder/Deep Note.md' },
          ],
        },
      ],
    }

    it('renders [[target]] wikilink as internal link', () => {
      const onClick = vi.fn()
      const { container } = render(
        <ViewMode content="See [[Notes]]" vaultId="v1" directoryTree={treeWithFiles} onInternalLinkClick={onClick} />
      )
      const link = container.querySelector('a.view-mode-link--internal')
      expect(link).not.toBeNull()
      expect(link?.textContent).toBe('Notes')
      link?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      expect(onClick).toHaveBeenCalledWith('Notes.md')
    })

    it('renders [[target|display]] wikilink with display text', () => {
      const onClick = vi.fn()
      const { container } = render(
        <ViewMode content="See [[Notes|My Notes]]" vaultId="v1" directoryTree={treeWithFiles} onInternalLinkClick={onClick} />
      )
      const link = container.querySelector('a.view-mode-link--internal')
      expect(link).not.toBeNull()
      expect(link?.textContent).toBe('My Notes')
    })

    it('renders broken wikilink with distinct styling when target not in tree', () => {
      const { container } = render(
        <ViewMode content="See [[NonExistent]]" vaultId="v1" directoryTree={treeWithFiles} />
      )
      const link = container.querySelector('a.view-mode-link--broken')
      expect(link).not.toBeNull()
      expect(link?.textContent).toBe('NonExistent')
    })

    it('resolves wikilinks case-insensitively', () => {
      const onClick = vi.fn()
      const { container } = render(
        <ViewMode content="See [[notes]]" vaultId="v1" directoryTree={treeWithFiles} onInternalLinkClick={onClick} />
      )
      const link = container.querySelector('a.view-mode-link--internal')
      expect(link).not.toBeNull()
      expect(link?.classList.contains('view-mode-link--broken')).toBe(false)
      link?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      expect(onClick).toHaveBeenCalledWith('Notes.md')
    })

    it('calls onInternalLinkClick with fallback path for broken wikilinks', () => {
      const onClick = vi.fn()
      const { container } = render(
        <ViewMode content="See [[NewPage]]" vaultId="v1" directoryTree={treeWithFiles} onInternalLinkClick={onClick} />
      )
      const link = container.querySelector('a.view-mode-link--broken')
      expect(link).not.toBeNull()
      link?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      expect(onClick).toHaveBeenCalledWith('NewPage.md')
    })
  })

  describe('Broken standard Markdown links (Req 6.6)', () => {
    const treeWithFiles: DirectoryTree = {
      name: 'root',
      type: 'directory',
      path: '',
      children: [
        { name: 'existing.md', type: 'file', path: 'existing.md' },
      ],
    }

    it('renders internal link to existing file without broken styling', () => {
      const { container } = render(
        <ViewMode content="[Link](existing.md)" vaultId="v1" directoryTree={treeWithFiles} />
      )
      const link = container.querySelector('a.view-mode-link--internal')
      expect(link).not.toBeNull()
      expect(link?.classList.contains('view-mode-link--broken')).toBe(false)
    })

    it('renders internal link to non-existing file with broken styling', () => {
      const { container } = render(
        <ViewMode content="[Link](missing.md)" vaultId="v1" directoryTree={treeWithFiles} />
      )
      const link = container.querySelector('a.view-mode-link--broken')
      expect(link).not.toBeNull()
      expect(link?.textContent).toBe('Link')
    })
  })
})

describe('resolveWikilinkTarget', () => {
  const tree: DirectoryTree = {
    name: 'root',
    type: 'directory',
    path: '',
    children: [
      { name: 'Hello.md', type: 'file', path: 'Hello.md' },
      { name: 'World.md', type: 'file', path: 'World.md' },
      {
        name: 'docs',
        type: 'directory',
        path: 'docs',
        children: [
          { name: 'Guide.md', type: 'file', path: 'docs/Guide.md' },
          { name: 'image.png', type: 'file', path: 'docs/image.png' },
        ],
      },
    ],
  }

  it('resolves target without extension to .md file', () => {
    expect(resolveWikilinkTarget('Hello', tree)).toBe('Hello.md')
  })

  it('resolves target with .md extension', () => {
    expect(resolveWikilinkTarget('Hello.md', tree)).toBe('Hello.md')
  })

  it('resolves case-insensitively', () => {
    expect(resolveWikilinkTarget('hello', tree)).toBe('Hello.md')
    expect(resolveWikilinkTarget('WORLD', tree)).toBe('World.md')
  })

  it('resolves files in subdirectories', () => {
    expect(resolveWikilinkTarget('Guide', tree)).toBe('docs/Guide.md')
  })

  it('resolves non-md files by exact name', () => {
    expect(resolveWikilinkTarget('image.png', tree)).toBe('docs/image.png')
  })

  it('returns null for non-existent targets', () => {
    expect(resolveWikilinkTarget('NonExistent', tree)).toBeNull()
  })

  it('returns null for null tree', () => {
    expect(resolveWikilinkTarget('Hello', null)).toBeNull()
  })

  it('returns null for empty target', () => {
    expect(resolveWikilinkTarget('', tree)).toBeNull()
    expect(resolveWikilinkTarget('  ', tree)).toBeNull()
  })
})
