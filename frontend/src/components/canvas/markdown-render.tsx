/**
 * Renders a very lightweight Markdown preview (inline formatting only).
 * Handles: bold, italic, code, headings, links, lists.
 * Intentionally lightweight — no full remark pipeline for performance in canvas nodes.
 */

/** Renders inline markdown: bold, italic, code, links. */
export function renderInline(text: string): React.ReactNode {
  // Process inline patterns with a simple regex approach
  const parts: React.ReactNode[] = []
  let remaining = text
  let key = 0

  while (remaining.length > 0) {
    // Bold: **text**
    const boldMatch = remaining.match(/^\*\*(.+?)\*\*/)
    if (boldMatch) {
      parts.push(<strong key={key++}>{boldMatch[1]}</strong>)
      remaining = remaining.slice(boldMatch[0].length)
      continue
    }
    // Italic: *text* or _text_
    const italicMatch = remaining.match(/^\*(.+?)\*/) || remaining.match(/^_(.+?)_/)
    if (italicMatch) {
      parts.push(<em key={key++}>{italicMatch[1]}</em>)
      remaining = remaining.slice(italicMatch[0].length)
      continue
    }
    // Inline code: `text`
    const codeMatch = remaining.match(/^`(.+?)`/)
    if (codeMatch) {
      parts.push(<code key={key++} className="canvas-md-code">{codeMatch[1]}</code>)
      remaining = remaining.slice(codeMatch[0].length)
      continue
    }
    // Link: [text](url)
    const linkMatch = remaining.match(/^\[(.+?)\]\((.+?)\)/)
    if (linkMatch) {
      parts.push(<a key={key++} className="canvas-md-link" href={linkMatch[2]} onClick={(e) => e.stopPropagation()}>{linkMatch[1]}</a>)
      remaining = remaining.slice(linkMatch[0].length)
      continue
    }
    // Strikethrough: ~~text~~
    const strikeMatch = remaining.match(/^~~(.+?)~~/)
    if (strikeMatch) {
      parts.push(<del key={key++}>{strikeMatch[1]}</del>)
      remaining = remaining.slice(strikeMatch[0].length)
      continue
    }
    // Regular character
    parts.push(remaining[0])
    remaining = remaining.slice(1)
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>
}

/**
 * Renders block-level markdown structure.
 * Handles: headings, lists, tasks, blockquotes, horizontal rules, paragraphs.
 * Detects mermaid blocks and shows placeholder (no rendering for performance).
 */
export function renderSimpleMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n')
  const result: React.ReactNode[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    let rendered: React.ReactNode

    // Detect mermaid block start
    if (line.trim().startsWith('```mermaid')) {
      const remaining = text.slice(0, text.indexOf(line)) + '\n' + line + '\n'
      const content = text.substring(remaining.length).split('\n')
      let blockEnd = -1
      for (let j = 1; j < content.length; j++) {
        if (content[j]!.trim().startsWith('```')) {
          blockEnd = j - 1
          break
        }
      }
      const mermaidBlock = content.slice(0, blockEnd + 1).join('\n')
      rendered = (
        <div key={i} className="canvas-md-mermaid">
          <div className="canvas-md-mermaid-header">
            <span className="canvas-md-mermaid-label">Mermaid-Diagramm</span>
            <span className="canvas-md-mermaid-hint">Nicht in Canvas-Vorschau gerendert</span>
          </div>
          <pre className="canvas-md-mermaid-code">{mermaidBlock}</pre>
        </div>
      )
      // Skip the mermaid block lines
      i += blockEnd + 1
      result.push(rendered)
      continue
    }

    // Headings
    if (line.startsWith('### ')) {
      rendered = <h5 key={i} className="canvas-md-h3">{renderInline(line.slice(4))}</h5>
    } else if (line.startsWith('## ')) {
      rendered = <h4 key={i} className="canvas-md-h2">{renderInline(line.slice(3))}</h4>
    } else if (line.startsWith('# ')) {
      rendered = <h3 key={i} className="canvas-md-h1">{renderInline(line.slice(2))}</h3>
    } else if (line.startsWith('- [ ] ') || line.startsWith('- [x] ')) {
      const checked = line.startsWith('- [x] ')
      rendered = (
        <div key={i} className="canvas-md-task">
          <input type="checkbox" checked={checked} readOnly tabIndex={-1} />
          <span>{renderInline(line.slice(6))}</span>
        </div>
      )
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      rendered = <li key={i} className="canvas-md-li">{renderInline(line.slice(2))}</li>
    } else if (/^\d+\. /.test(line)) {
      const content = line.replace(/^\d+\. /, '')
      rendered = <li key={i} className="canvas-md-li canvas-md-li--ordered">{renderInline(content)}</li>
    } else if (line.startsWith('> ')) {
      rendered = <blockquote key={i} className="canvas-md-quote">{renderInline(line.slice(2))}</blockquote>
    } else if (line.trim() === '---') {
      rendered = <hr key={i} className="canvas-md-hr" />
    } else if (line.trim() === '') {
      rendered = <br key={i} />
    } else {
      rendered = <p key={i} className="canvas-md-p">{renderInline(line)}</p>
    }

    result.push(rendered)
  }

  return result
}
