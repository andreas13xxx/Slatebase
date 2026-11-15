import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { ViewMode } from './ViewMode'

describe('ViewMode callout with heading-only wikilink', () => {
  it('still renders a callout when the body contains [[#Heading|Alias]]', () => {
    const content = '> [!warning] Experimentell\n> Siehe [[#Grenzen und Lücken|Liste unten]] weiter.'
    const { container } = render(
      <ViewMode content={content} vaultId="v" directoryTree={null as never} onInternalLinkClick={() => {}} token="t" />,
    )
    expect(container.innerHTML).toContain('callout')
    expect(container.querySelectorAll('blockquote').length).toBe(0)
  })
})
