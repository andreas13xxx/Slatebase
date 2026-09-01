import { describe, it, expect } from 'vitest'
import { isKnownCompound, type WordLookup } from './compound'

/**
 * Stands in for the Hunspell dictionary: the parts German actually builds its
 * compounds from, matched case-insensitively on the first letter the way
 * `inDictionary()` does in the worker.
 */
const VOCABULARY = new Set([
  'Verzeichnis', 'Struktur', 'Daten', 'Bank', 'Verbindung', 'Wissen', 'Zettel',
  'Kasten', 'Notiz', 'Verwaltung', 'Datei', 'Name', 'Suche', 'Ergebnis',
  'Benutzer', 'Ober', 'Fläche', 'Arbeit', 'Speicher', 'Sicherheit', 'Lücke',
  'Taste', 'Kombination', 'Haus', 'Test', 'Prüfung', 'Rechtschreib',
])

const lookup: WordLookup = (word) => {
  const capitalised = word.charAt(0).toUpperCase() + word.slice(1)
  return VOCABULARY.has(word) || VOCABULARY.has(capitalised)
}

describe('isKnownCompound', () => {
  describe('accepts ordinary German compounds', () => {
    const compounds = [
      'Verzeichnisstruktur',
      'Datenbankverbindung',
      'Zettelkasten',
      'Notizverwaltung',
      'Rechtschreibprüfung',
      'Wissensdatenbank',
      'Dateiname',
      'Benutzeroberfläche',
      'Arbeitsspeicher',
      'Sicherheitslücke',
      'Tastenkombination',
    ]

    it.each(compounds)('%s', (word) => {
      expect(isKnownCompound(word, lookup)).toBe(true)
    })
  })

  describe('linking morphemes', () => {
    it('accepts a compound joined with an "s" (Arbeit-s-speicher)', () => {
      expect(isKnownCompound('Arbeitsspeicher', lookup)).toBe(true)
    })

    it('accepts a compound joined with an "n" (Taste-n-kombination)', () => {
      expect(isKnownCompound('Tastenkombination', lookup)).toBe(true)
    })

    it('accepts a three-part compound (Wissen-s-daten-bank)', () => {
      expect(isKnownCompound('Wissensdatenbank', lookup)).toBe(true)
    })
  })

  describe('rejects misspellings', () => {
    const misspellings = [
      'Datenbannkverbindung',
      'Verzeichnisstrucktur',
      'Notzverwaltung',
      'Qwertzuiopas',
      'Blablablabla',
    ]

    it.each(misspellings)('%s', (word) => {
      expect(isKnownCompound(word, lookup)).toBe(false)
    })
  })

  describe('guards', () => {
    it('does not split a word shorter than eight characters', () => {
      // "Hausname" would split, "Hausnam" is below the length floor.
      expect(isKnownCompound('Hausnam', lookup)).toBe(false)
    })

    it('does not accept fragments shorter than four characters', () => {
      // "Haus" + "ob" — the tail is too short to count as a part.
      expect(isKnownCompound('Hausob', lookup)).toBe(false)
    })

    it('stops at three parts', () => {
      // Four real parts in a row must not be assembled.
      expect(isKnownCompound('Datenbanknamestruktur', lookup)).toBe(false)
    })

    it('accepts a word the lookup already knows outright', () => {
      expect(isKnownCompound('Verzeichnis', lookup)).toBe(true)
    })
  })
})
