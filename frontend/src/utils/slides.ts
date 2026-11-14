/**
 * Splits a Markdown note into slides: a line holding only `---` starts a new slide.
 * A leading frontmatter block is dropped, and `---` inside a fenced code block
 * stays part of the slide. Empty slides are skipped.
 */
export function splitSlides(markdown: string): string[] {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n')
  let start = 0
  if (lines[0]?.trim() === '---') {
    const end = lines.findIndex((line, i) => i > 0 && line.trim() === '---')
    if (end > 0) start = end + 1
  }

  const slides: string[] = []
  let current: string[] = []
  let fence: string | null = null
  const flush = (): void => {
    const text = current.join('\n').trim()
    if (text) slides.push(text)
    current = []
  }

  for (const line of lines.slice(start)) {
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(line)
    if (fenceMatch) {
      const marker = fenceMatch[1] ?? ''
      if (fence === null) fence = marker
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null
    }
    const afterText = (current[current.length - 1] ?? '').trim() !== ''
    // A `---` right under a text line is a Setext heading underline, not a separator.
    if (fence === null && /^---\s*$/.test(line) && !afterText) {
      flush()
      continue
    }
    current.push(line)
  }
  flush()
  return slides
}
