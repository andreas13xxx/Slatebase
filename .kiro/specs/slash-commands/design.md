# Design Document: Slash Commands

## Overview

Das Slash-Command-Menü sitzt vollständig auf vorhandener Infrastruktur auf: Es ist eine neue **Suggest-Quelle** in der Plugin-Compat-Autovervollständigung (`editor-suggest-*.ts`), die auf `/` triggert und Einträge aus einer kuratierten Liste anbietet, deren Aktionen überwiegend bestehende `editor:*`/Core-Commands über `executeCommandById` ausführen.

Architektur-Leitplanken:

- **Keine neue Popover-/Keymap-Schicht.** Trigger-Erkennung, Popover-Rendering, Pfeiltasten/Enter/Escape-Keymap (`Prec.highest`), Viewport-Clamping, Stale-Guard (Generation-Counter) und „ein Suggest zur Zeit"-Semantik existieren bereits in `editor-suggest-manager.ts`/`editor-suggest-popover.ts`/`editor-suggest-extension.ts`. Das Slash-Menü wird als interne Suggest-Quelle eingehängt — nicht als zweite ViewPlugin/Keymap, die mit Plugin-Suggests um dieselben Tasten kämpft.
- **Keine zweite Formatierungslogik.** Die Aktionen rufen die bereits registrierten Core-Commands (`core-commands.ts`/`core-commands-app.ts`) über die `CommandRegistry` auf. Palette und Slash-Menü teilen damit genau eine Implementierung und können nicht auseinanderdriften (dieselbe Lehre wie beim editor-context-menu, das ebenfalls an `editor:*` delegiert).
- **Trigger-Text zuerst entfernen, dann ausführen.** Der getippte `/…`-Bereich wird vor der Aktion aus dem Dokument gelöscht, damit die Aktion an sauberer Cursorposition wirkt.
- **Kuratierte Liste an einer Stelle.** Alle Slash-Einträge liegen in einer Datei (IDs + Aktion), die Labels lokalisiert über das `core-command-i18n.ts`-Muster — nicht über mehrere Call-Sites verstreut.
- **Nur CM6-Haupteditor**, konsistent mit Rechtschreibprüfung und EditorSuggests.

Backend: **nicht betroffen.** Reines Frontend-Editor-Feature, kein Endpoint, kein Backend-Modul.

## Architecture

### Frontend — neue Dateien

| Pfad | Verantwortung |
|------|---------------|
| `frontend/src/editor/slash/slash-commands.ts` | Die kuratierte `SlashCommand[]`-Liste: pro Eintrag stabile ID, Icon-Name, und entweder eine Core-Command-ID (`editor:*`) oder ein kleiner Direkt-Einfüge-Handler (Datum/Zeit). Einzige Quelle der Wahrheit für den Menüinhalt. |
| `frontend/src/editor/slash/slash-trigger.ts` | Trigger-Erkennung: prüft, ob der Cursor hinter einem `/` am Zeilenanfang/nach Leerraum steht (und NICHT in Code/Wikilink/Math — Wiederverwendung der Tokenizer-Regionslogik aus `editor/spellcheck/tokenizer.ts`, soweit sinnvoll), liefert den Filtertext und den zu ersetzenden Bereich. |
| `frontend/src/editor/slash/slash-suggest-source.ts` | Die Suggest-Quelle, die `slash-trigger` + `slash-commands` an die vorhandene Suggest_Infrastructure anbindet: `onTrigger` → Bereich/Filter, `getSuggestions` → gefilterte Liste (Fuzzy-Match via `utils/fuzzyMatch.ts`), `renderSuggestion` → `.suggestion-item`, `selectSuggestion` → Trigger-Text löschen + Aktion ausführen. |
| `frontend/src/editor/slash/slash-command-i18n.ts` | DE/EN-Labels je ID (Muster von `core-command-i18n.ts`). |
| `frontend/src/editor/slash/*.test.ts` | Trigger-Erkennung (positiv/negativ: `/` im Wort, in Code, in Pfad), Filterung, Trigger-Text-Entfernung + Ausführung, Datum/Zeit-Einfügung. |

### Frontend — geänderte Dateien

| Pfad | Änderung |
|------|----------|
| `frontend/src/editor/CodeMirrorEditor.tsx` | Registriert die Slash-Suggest-Quelle in der vorhandenen Suggest_Infrastructure beim Editor-Mount (dort, wo heute die Plugin-Suggests + die `==`-Highlight-Autocomplete eingehängt werden). Nur im Haupteditor. |
| `frontend/src/plugins/compat/editor-suggest-manager.ts` (falls nötig) | Minimal öffnen, damit eine **interne** (nicht-plugin) Suggest-Quelle registriert werden kann, ohne an einen Plugin-Kontext gebunden zu sein. Wenn die vorhandene Registrierungs-API das schon zulässt, keine Änderung. |
| `frontend/src/editor/formatting.ts` (nur falls Lücken) | Für Slash-Einträge, deren Formatierung noch nicht als Core-Command existiert (z.B. „horizontale Linie" oder „Callout einfügen"), den fehlenden `editor:*`-Command ergänzen — NICHT eine slash-eigene Variante. So profitiert auch die Command Palette davon. |

## Datenmodell

```ts
// slash-commands.ts (Skizze)
interface SlashCommand {
  id: string                    // stabil, sprachunabhängig, z.B. 'slash:insert-table'
  icon: string                  // Lucide-/Obsidian-Icon-Name
  // Genau eines von beiden:
  commandId?: string            // bestehende Core-Command-ID, via executeCommandById
  insert?: (view: EditorView) => void  // Direkt-Einfüge-Handler (Datum/Zeit)
}
```

Die Labels liegen nicht am Objekt, sondern werden über `slash-command-i18n.ts` anhand der `id` aufgelöst (gleiches Prinzip wie Core-Commands: IDs fix, nur die Anzeige lokalisiert).

## Trigger-/Auswahl-Fluss

1. Der Nutzer tippt `/` am Zeilenanfang/nach Leerraum → `slash-trigger` meldet der Suggest_Infrastructure einen offenen Trigger mit Ersetzungsbereich `[slashPos … cursor]` und Filtertext `""`.
2. Weitertippen aktualisiert den Filtertext; `getSuggestions` liefert die per `fuzzyMatch` gefilterte, sortierte `SlashCommand`-Liste.
3. Das vorhandene Popover rendert die Einträge (`.suggestion-item`, Icon + lokalisiertes Label), Pfeiltasten/Enter/Escape über die vorhandene `Prec.highest`-Keymap.
4. Bei Auswahl: `slash-suggest-source.selectSuggestion` löscht zuerst den Ersetzungsbereich via CM6-Dispatch, dann:
   - `commandId` gesetzt → `app.commands.executeCommandById(commandId)` (eine Implementierung, geteilt mit der Palette), oder
   - `insert` gesetzt → Direkt-Dispatch des Einfügetexts an der Cursorposition.
5. Ein Leerzeichen, Cursor-Verlassen oder Escape schließt das Menü ohne Einfügung (Lifecycle der Suggest_Infrastructure).

## Koexistenz mit Plugin-Suggests

- Die Slash-Quelle ist eine weitere Quelle in derselben Infrastruktur → die vorhandene „ein Suggest zur Zeit"-Logik entscheidet den Gewinner; es gibt nie zwei überlappende Popover.
- Stale-Guard (Generation-Counter) und das Schließen beim Vault-Wechsel werden geerbt, nicht dupliziert.
- Visuell identisch, weil dieselben `.suggestion-*`-Klassen genutzt werden.

## Security & Konsistenz

- Kein `eval`, kein Backend, kein Dateizugriff — reines Editor-Verhalten.
- Aktionen laufen ausschließlich über die bestehende `CommandRegistry`/CM6-Dispatch → keine neue Ausführungs-/Angriffsfläche.
- Trigger meidet Code-/Wikilink-/Math-Regionen (Tokenizer-Regionslogik), damit `/` im normalen Text nie fälschlich ein Menü öffnet.

## Testing-Strategie

- `slash-trigger`: positiv (Zeilenanfang, nach Leerraum) / negativ (`/` im Wort, in `a/b`, in Codeblock, in Wikilink/Math).
- `slash-suggest-source`: Filterung per Fuzzy-Match; Auswahl löscht Trigger-Text UND führt Aktion aus (nicht nur eines); Datum/Zeit-Direkt-Einfügung landet an der Cursorposition.
- Deaktivierte/fehlende Commands: Eintrag ausgelassen/deaktiviert statt stillem No-Op.
- Koexistenz: Slash-Trigger und ein Plugin-Trigger ergeben genau ein Popover (Wiring-Test gegen die Suggest_Infrastructure).

## Offene Design-Fragen (vor Phase 1 zu klären)

1. **Core-Command-Lücken:** Welche der geforderten Einträge (Callout einfügen, horizontale Linie, Aufgabenliste, Tabelle) haben bereits einen `editor:*`-Command, welche brauchen einen neuen? Vor Phase 1 die Registry (`core-commands.ts`/`core-commands-app.ts`) durchgehen und die Lücken als „neuer Core-Command, dann vom Slash-Eintrag referenziert" einplanen — nicht als slash-eigene Formatierfunktion.
2. **Interne Suggest-Quelle:** Lässt die vorhandene `editor-suggest-manager.ts`-Registrierungs-API eine nicht-plugin-gebundene Quelle zu, oder braucht sie eine schmale Erweiterung (Pseudo-ID wie `__slash__`, analog zu `__editor-suggest__`)?
3. **Trigger-Regionsprüfung:** Wie viel der `editor/spellcheck/tokenizer.ts`-Regionslogik (Code/Wikilink/Math überspringen) ist wiederverwendbar, ohne eine Abhängigkeit zu erzwingen, die dort nicht hingehört? Ggf. eine kleine gemeinsame Helfer-Funktion.
