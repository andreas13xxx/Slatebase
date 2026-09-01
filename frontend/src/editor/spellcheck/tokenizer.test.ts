import { describe, it, expect } from 'vitest'
import { EditorState } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { collectWords } from './tokenizer'

/** Builds a Markdown-parsing state, so the tokenizer sees the same tree the editor does. */
function stateFor(doc: string): EditorState {
  return EditorState.create({ doc, extensions: [markdown()] })
}

/** All checkable words in the whole document. */
function wordsIn(doc: string): string[] {
  const state = stateFor(doc)
  return collectWords(state, 0, state.doc.length).map((token) => token.word)
}

describe('collectWords', () => {
  describe('plain prose', () => {
    it('extracts words and skips punctuation', () => {
      expect(wordsIn('Hallo Welt, wie geht es dir?')).toEqual(['Hallo', 'Welt', 'wie', 'geht', 'es', 'dir'])
    })

    it('reports positions that map back onto the document', () => {
      const state = stateFor('Ein Wrot hier')
      const tokens = collectWords(state, 0, state.doc.length)
      const wrot = tokens.find((token) => token.word === 'Wrot')
      expect(wrot).toBeDefined()
      expect(state.sliceDoc(wrot!.from, wrot!.to)).toBe('Wrot')
    })

    it('splits hyphenated compounds into their parts', () => {
      expect(wordsIn('Eine E-Mail-Adresse')).toEqual(['Eine', 'Mail', 'Adresse'])
    })

    it('keeps apostrophes inside a word but drops the possessive suffix', () => {
      expect(wordsIn("don't Annas's")).toEqual(["don't", 'Annas'])
    })
  })

  describe('words not worth checking', () => {
    it('skips single letters', () => {
      expect(wordsIn('a b Haus')).toEqual(['Haus'])
    })

    it('skips acronyms', () => {
      expect(wordsIn('Die API und HTML')).toEqual(['Die', 'und'])
    })

    it('skips identifiers with an internal capital', () => {
      expect(wordsIn('Wir nutzen GitHub und useState')).toEqual(['Wir', 'nutzen', 'und'])
    })
  })

  describe('Markdown constructs', () => {
    it('skips fenced code blocks', () => {
      expect(wordsIn('Text davor\n\n```js\nconst istKeinWort = 1\n```\n\nText danach'))
        .toEqual(['Text', 'davor', 'Text', 'danach'])
    })

    it('skips inline code', () => {
      expect(wordsIn('Nutze `npm instal` bitte')).toEqual(['Nutze', 'bitte'])
    })

    it('skips the URL of a link but checks its text', () => {
      expect(wordsIn('[Ein Titel](https://beispiel.de/pfad)')).toEqual(['Ein', 'Titel'])
    })

    it('checks heading and list text', () => {
      expect(wordsIn('# Überschrift\n\n- Erster Punkt')).toEqual(['Überschrift', 'Erster', 'Punkt'])
    })

    it('skips HTML tags but checks the text between them', () => {
      expect(wordsIn('<div class="wrapper">Inhalt</div>')).toEqual(['Inhalt'])
    })
  })

  describe('Slatebase and Obsidian constructs', () => {
    it('skips wikilink targets and embeds', () => {
      expect(wordsIn('Siehe [[Meine Notiz]] und ![[bild.png]] dort')).toEqual(['Siehe', 'und', 'dort'])
    })

    it('skips inline and block math', () => {
      expect(wordsIn('Formel $x = \\alpha$ und $$\\beta$$ Ende')).toEqual(['Formel', 'und', 'Ende'])
    })

    it('skips tags', () => {
      expect(wordsIn('Notiz #projekt/aktiv fertig')).toEqual(['Notiz', 'fertig'])
    })

    it('skips %% comments %%', () => {
      expect(wordsIn('Sichtbar %% versteckter Kommentar %% wieder')).toEqual(['Sichtbar', 'wieder'])
    })

    it('skips bare URLs and e-mail addresses', () => {
      expect(wordsIn('Schreib an post@beispiel.de oder https://beispiel.de heute'))
        .toEqual(['Schreib', 'an', 'oder', 'heute'])
    })

    it('skips YAML frontmatter', () => {
      expect(wordsIn('---\ntitel: Ein Wert\ntags: [eins]\n---\n\nEigentlicher Text'))
        .toEqual(['Eigentlicher', 'Text'])
    })

    it('leaves a lone --- line alone when there is no closing delimiter', () => {
      expect(wordsIn('---\nkein echtes Frontmatter')).toEqual(['kein', 'echtes', 'Frontmatter'])
    })
  })

  describe('ranges', () => {
    it('widens a partial range to whole lines so block constructs are still recognised', () => {
      const state = stateFor('Text davor\n\n```\ncode hier\n```\n')
      // A range starting inside the fenced block must not leak its content.
      const words = collectWords(state, 16, 24).map((token) => token.word)
      expect(words).toEqual([])
    })

    it('returns nothing for an empty document', () => {
      expect(wordsIn('')).toEqual([])
    })
  })
})
