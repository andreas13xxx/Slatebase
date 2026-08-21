/**
 * MDAST node types for LaTeX math.
 */
import type { Literal } from 'mdast'

/**
 * Inline math node: $E=mc^2$
 */
export interface MathInlineNode extends Literal {
  type: 'mathInline'
  value: string
}

/**
 * Block math node: $$\n...\n$$
 */
export interface MathBlockNode extends Literal {
  type: 'mathBlock'
  value: string
}

declare module 'mdast' {
  interface PhrasingContentMap {
    mathInline: MathInlineNode
  }

  interface BlockContentMap {
    mathBlock: MathBlockNode
  }

  interface RootContentMap {
    mathInline: MathInlineNode
    mathBlock: MathBlockNode
  }
}
