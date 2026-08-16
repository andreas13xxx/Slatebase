# Requirements Document

## Introduction

Dieses Feature poliert drei bestehende bzw. angrenzende UI-Bereiche von Slatebase, die im Obsidian-Vorbild deutlich reichhaltiger sind als der aktuelle Slatebase-Stand: **Bookmarks** (intern "Favoriten" genannt, aktuell eine flache, unsortierbare Liste ohne Kontextmenü), die **Statusleiste** (aktuell nur eine Uhr plus Plugin-Erweiterungspunkt, ohne Wort-/Zeichenanzahl oder Cursor-Position) und **CSS-Snippets** (aktuell nicht vorhanden — es existiert lediglich ein plugin-interner, auf `[data-plugin-id]` gescopter CSS-Injector, der für global wirkende Benutzer-Snippets ungeeignet ist). Ziel ist es, alle drei Bereiche auf ein Funktionsniveau zu heben, das Benutzer aus Obsidian kennen, ohne bestehende Datenmodelle unnötig zu brechen.

Dieses Feature baut auf der bestehenden Favoriten-Implementierung (`frontend/src/state/favoritesStore.ts`, Requirement 10 aus `.kiro/specs/tier2-daily-workflow/requirements.md`) und der bestehenden Statusleiste (`frontend/src/components/StatusBar.tsx`, `frontend/src/plugins/compat/status-bar-registry.ts`) auf und erweitert diese, statt sie zu ersetzen. CSS-Snippets sind ein neues Feature, das die bestehende Settings-Infrastruktur (`frontend/src/components/settings/AppearanceSection.tsx`) und das Speicherungsmuster von Plugin-Dateien (`backend/src/plugin/plugin-store.ts`) als Vorbild nutzt.

## Glossary

- **Favoriten_Store**: Bestehendes Modul (`favoritesStore.ts`), das favorisierte Dateien pro Vault verwaltet (localStorage + debounced Backend-Sync)
- **Favoriten_Eintrag**: Ein einzelner Favorit (Vault-ID, Pfad, Hinzufügezeitpunkt, optionale Zusatzfelder aus diesem Feature: Sortierposition, Anzeigename)
- **Favoriten_Ansicht**: Bestehende Sidebar-Panel-Komponente (`FavoritesView.tsx`), die alle Favoriten eines Vaults als Liste zeigt
- **Favoriten_Sektion**: Bestehende Sektion im `FileExplorer`, die Favoriten oberhalb des Dateibaums anzeigt
- **Status_Bar**: Bestehende Fußleisten-Komponente (`StatusBar.tsx`) am unteren Rand der Anwendung
- **Status_Bar_Item**: Ein einzelnes Element in der Statusleiste — entweder ein eingebautes Item (Uhr, Wortanzahl, Cursor-Position, Vault-Name) oder ein von einem Plugin registriertes Item
- **Wortstatistik_Provider**: Neue Komponente/Hook, der aus dem Zustand des aktiven Editors Wortanzahl, Zeichenanzahl, Cursor-Zeile/-Spalte und Selektionsgröße ableitet
- **CSS_Snippet**: Eine vom Benutzer erstellte oder hochgeladene CSS-Datei, die global (nicht auf ein Plugin gescopt) auf die Slatebase-Oberfläche angewendet werden kann
- **CSS_Snippet_Store**: Neues Frontend-Modul zur Verwaltung der Snippet-Liste (Metadaten, Aktivierungsstatus) und zur Kommunikation mit dem Backend
- **CSS_Snippet_Injector**: Neue Komponente, die aktivierte Snippet-Inhalte unscoped als `<style>`-Elemente in den Dokument-`<head>` einfügt
- **Snippet_Store (Backend)**: Neues Backend-Modul, das Snippet-Dateien und deren Aktivierungsstatus pro Vault persistiert (analog zu `backend/src/plugin/plugin-store.ts`)
- **Appearance_Section**: Bestehende Settings-Komponente (`AppearanceSection.tsx`), die um CSS-Snippet-Verwaltung erweitert wird
- **Aktive_Datei**: Die im aktuell fokussierten Editor-Tab geöffnete Datei
- **Bookmark_Typ**: Diskriminator (`file` | `heading` | `block` | `search`) auf dem Favoriten_Eintrag, der bestimmt, welche Zusatzfelder gefüllt sind und wie der Eintrag beim Klick aufgelöst wird
- **Block_Marker**: Bestehendes Obsidian-kompatibles `^block-id`-Suffix am Ende eines Absatzes/einer Listenzeile/Überschrift (`frontend/src/plugins/block-ref/marker-parser.ts`), das Blöcke referenzierbar macht

## Scope-Hinweis

Der ursprüngliche Roadmap-Eintrag (`.kiro/specs/implementation-plan.md`, Prio 3) nennt für "Bookmarks vervollständigen" explizit die vier aktuell als No-Op registrierten Commands `bookmarks:bookmark-current-heading`, `bookmarks:bookmark-current-section`, `bookmarks:bookmark-current-search` und `bookmarks:bookmark-all-tabs` (`frontend/src/plugins/compat/core-commands-app.ts`, Zeilen 400–403). Diese sind in Requirements 11–14 abgedeckt, zusätzlich zu den in Requirements 1–3 beschriebenen Polituren der bestehenden Datei-Favoriten (Sortierung, Kontextmenü, Labels).

## Requirements

### Requirement 1: Manuelles Neuordnen von Favoriten

**User Story:** Als Benutzer möchte ich meine Favoriten in einer selbst gewählten Reihenfolge anordnen können, damit die wichtigsten Einträge oben stehen — unabhängig davon, wann ich sie hinzugefügt habe.

#### Acceptance Criteria

1. THE Favoriten_Store SHALL jedem Favoriten_Eintrag ein numerisches Sortierfeld (`order`) zuweisen, das beim Hinzufügen auf den nächsthöheren verfügbaren Wert innerhalb des Vaults gesetzt wird
2. WHEN der Benutzer einen Eintrag in der Favoriten_Ansicht per Drag-and-Drop auf eine neue Position zieht, THE Favoriten_Ansicht SHALL die `order`-Werte der betroffenen Einträge im Favoriten_Store so aktualisieren, dass die neue Reihenfolge persistiert wird
3. THE Favoriten_Ansicht und die Favoriten_Sektion SHALL Favoriten anhand des `order`-Felds aufsteigend anzeigen, nicht mehr zwingend nach Hinzufügezeitpunkt
4. WHEN ein neuer Favorit hinzugefügt wird, THE Favoriten_Store SHALL ihn an das Ende der bestehenden Reihenfolge anhängen
5. IF ein bestehender Favoriten_Eintrag (aus einer Version vor diesem Feature) kein `order`-Feld besitzt, THEN THE Favoriten_Store SHALL beim nächsten Laden allen Einträgen ohne `order` fortlaufende Werte in ihrer bisherigen Anzeigereihenfolge (nach `addedAt` absteigend) zuweisen, ohne dass der Benutzer eingreifen muss
6. THE Favoriten_Ansicht SHALL während eines Drag-Vorgangs eine visuelle Einfüge-Markierung an der Zielposition anzeigen
7. WHEN ein Drag-Vorgang durch Drücken der Escape-Taste oder durch Loslassen außerhalb der Liste abgebrochen wird, THE Favoriten_Ansicht SHALL die ursprüngliche Reihenfolge beibehalten und keine Änderung am Favoriten_Store vornehmen

### Requirement 2: Kontextmenü in der Favoriten-Ansicht

**User Story:** Als Benutzer möchte ich einen Favoriten direkt in der Favoriten-Ansicht per Rechtsklick entfernen oder die zugehörige Datei im Datei-Explorer anzeigen können, damit ich nicht erst zum Datei-Explorer wechseln muss.

#### Acceptance Criteria

1. WHEN der Benutzer mit der rechten Maustaste auf einen Eintrag in der Favoriten_Ansicht klickt, THE Favoriten_Ansicht SHALL ein Kontextmenü mit den Optionen "Aus Favoriten entfernen", "Im Datei-Explorer anzeigen" und "Umbenennen" öffnen
2. WHEN der Benutzer "Aus Favoriten entfernen" wählt, THE Favoriten_Ansicht SHALL den Eintrag über `favoritesStore.remove()` entfernen und die Liste ohne Neuladen der Seite aktualisieren
3. WHEN der Benutzer "Im Datei-Explorer anzeigen" wählt, THE Slatebase_Frontend SHALL zur Datei-Explorer-Ansicht wechseln, den Ordnerpfad der Datei aufklappen und die Datei sichtbar hervorheben
4. WHEN der Benutzer das Kontextmenü über die Tastatur öffnet (Kontextmenü-Taste oder Shift+F10) während ein Eintrag fokussiert ist, THE Favoriten_Ansicht SHALL dasselbe Kontextmenü an der Position des fokussierten Eintrags öffnen
5. IF die referenzierte Datei eines Favoriten_Eintrags nicht mehr im Vault existiert, THEN THE Favoriten_Ansicht SHALL den Eintrag visuell als "fehlend" kennzeichnen und im Kontextmenü nur "Aus Favoriten entfernen" anbieten
6. WHEN der Benutzer außerhalb des Kontextmenüs klickt oder Escape drückt, THE Favoriten_Ansicht SHALL das Kontextmenü schließen ohne eine Aktion auszuführen

### Requirement 3: Eigener Anzeigename für Favoriten

**User Story:** Als Benutzer möchte ich einem Favoriten einen eigenen Anzeigenamen geben können, damit ich ihn auch dann wiedererkenne, wenn der Dateiname selbst nicht aussagekräftig ist.

#### Acceptance Criteria

1. THE Favoriten_Eintrag SHALL ein optionales Feld `label` (String, maximal 100 Zeichen) unterstützen
2. WHEN der Benutzer "Umbenennen" im Kontextmenü wählt, THE Favoriten_Ansicht SHALL ein Eingabefeld mit dem aktuellen Anzeigenamen (Label falls gesetzt, sonst Dateiname) anzeigen
3. WHEN der Benutzer einen neuen Namen bestätigt (Enter oder Bestätigen-Button) und der Name vom tatsächlichen Dateinamen abweicht, THE Favoriten_Store SHALL das `label`-Feld des Eintrags aktualisieren
4. IF der Benutzer den Namen leer lässt oder auf den ursprünglichen Dateinamen zurücksetzt, THEN THE Favoriten_Store SHALL das `label`-Feld entfernen, sodass wieder der Dateiname angezeigt wird
5. THE Favoriten_Ansicht und die Favoriten_Sektion SHALL, wenn ein `label` gesetzt ist, dieses anstelle des Dateinamens anzeigen, wobei der tatsächliche Dateiname weiterhin als Tooltip verfügbar bleibt
6. WHEN der Benutzer die Umbenennung durch Escape abbricht, THE Favoriten_Ansicht SHALL das Eingabefeld schließen ohne das `label`-Feld zu verändern

### Requirement 4: Wort- und Zeichenanzahl in der Statusleiste

**User Story:** Als Benutzer möchte ich die Wort- und Zeichenanzahl der aktuell geöffneten Datei in der Statusleiste sehen, damit ich die Länge meines Textes im Blick behalte, ohne ein separates Tool zu öffnen.

#### Acceptance Criteria

1. WHILE eine Markdown-Datei im aktiven Editor-Tab geöffnet ist, THE Status_Bar SHALL ein Status_Bar_Item anzeigen, das die aktuelle Wortanzahl und Zeichenanzahl des Dateiinhalts im Format "X Wörter, Y Zeichen" darstellt
2. WHEN der Benutzer Text im Editor eingibt oder löscht, THE Wortstatistik_Provider SHALL die angezeigte Wort- und Zeichenanzahl innerhalb von 300 Millisekunden nach der letzten Änderung aktualisieren (debounced)
3. WHEN der Benutzer Text im Editor markiert (Selektion), THE Status_Bar SHALL zusätzlich die Wort- und Zeichenanzahl der Selektion im Format "X von Y Wörtern ausgewählt" anzeigen, solange die Selektion nicht leer ist
4. IF kein Datei-Tab aktiv ist oder die aktive Datei keine Textdatei ist (z. B. Canvas, Bild), THEN THE Status_Bar SHALL das Wort-/Zeichenanzahl-Item ausblenden
5. THE Wortstatistik_Provider SHALL Wörter als durch Whitespace getrennte Zeichenfolgen zählen und Markdown-Syntaxzeichen (`#`, `*`, `_`, `` ` ``, `[`, `]`) nicht separat als Wörter zählen
6. THE Wortstatistik_Provider SHALL Zeichen inklusive Leerzeichen und Zeilenumbrüchen zählen (Rohlänge des Dateiinhalts)

### Requirement 5: Cursor-Position in der Statusleiste

**User Story:** Als Benutzer möchte ich die aktuelle Cursor-Position (Zeile und Spalte) in der Statusleiste sehen, damit ich mich beim Navigieren in langen Dokumenten orientieren kann.

#### Acceptance Criteria

1. WHILE der Editor fokussiert ist und eine Textdatei geöffnet ist, THE Status_Bar SHALL ein Status_Bar_Item mit der aktuellen Cursor-Position im Format "Zeile:Spalte" (1-indiziert) anzeigen
2. WHEN sich die Cursor-Position durch Tastatur- oder Mausnavigation ändert, THE Status_Bar SHALL die Anzeige innerhalb von 100 Millisekunden aktualisieren
3. WHEN eine mehrzeilige Selektion aktiv ist, THE Status_Bar SHALL zusätzlich die Anzahl der von der Selektion betroffenen Zeilen anzeigen
4. WHEN der Benutzer auf das Cursor-Positions-Item klickt, THE Status_Bar SHALL einen "Gehe zu Zeile"-Dialog öffnen, der beim Bestätigen den Cursor an die eingegebene Zeile im Editor bewegt
5. IF die eingegebene Zeilennummer im "Gehe zu Zeile"-Dialog außerhalb des gültigen Bereichs liegt (kleiner als 1 oder größer als die Gesamtzeilenzahl), THEN THE Status_Bar SHALL die Eingabe auf den nächstgültigen Wert begrenzen (1 bzw. letzte Zeile) statt einen Fehler anzuzeigen

### Requirement 6: Granulare Sichtbarkeit von Statusleisten-Items

**User Story:** Als Benutzer möchte ich einzelne Elemente der Statusleiste ein- und ausblenden können, damit ich nur die Informationen sehe, die mich interessieren.

#### Acceptance Criteria

1. THE Appearance_Section SHALL für jedes eingebaute Status_Bar_Item (Uhr, Wort-/Zeichenanzahl, Cursor-Position, Vault-Name) einen eigenen Sichtbarkeits-Toggle anzeigen, zusätzlich zum bestehenden globalen Statusleisten-Toggle
2. IF alle eingebauten Items deaktiviert sind, THEN THE Status_Bar SHALL weiterhin sichtbar bleiben (sofern der globale Toggle aktiv ist) und nur den Container für Plugin-Items sowie einen leeren linken Bereich zeigen
3. WHEN der globale Statusleisten-Toggle deaktiviert ist, THE Status_Bar SHALL vollständig ausgeblendet bleiben, unabhängig von den einzelnen Item-Toggles
4. WHEN der Benutzer den Toggle für ein einzelnes Item deaktiviert, THE Status_Bar SHALL dieses Item sofort ausblenden, ohne die übrigen Items oder Plugin-Items zu beeinflussen
5. THE Slatebase_Frontend SHALL die Sichtbarkeitseinstellung jedes eingebauten Items in localStorage unter einem Schlüssel je Item persistieren, sodass die Einstellung nach einem Seiten-Reload erhalten bleibt
6. THE Status_Bar SHALL den Vault-Namen des aktuell geöffneten Vaults als eigenes Status_Bar_Item anzeigen, wenn dieses Item aktiviert ist

### Requirement 7: Robuste Darstellung von Plugin-Statusleisten-Items

**User Story:** Als Entwickler möchte ich, dass Plugin-Statusleisten-Items ohne sichtbares Flackern aktualisiert werden, damit die Statusleiste auch bei häufigen Plugin-Updates ruhig wirkt.

#### Acceptance Criteria

1. WHEN sich die Menge der registrierten Plugin-Statusleisten-Items ändert (Hinzufügen oder Entfernen eines Items), THE Status_Bar SHALL nur die tatsächlich hinzugefügten oder entfernten DOM-Elemente anpassen, ohne den gesamten Plugin-Container zu leeren und neu zu befüllen
2. WHEN ein Plugin sein eigenes Status_Bar_Item-Element per `textContent` oder `innerHTML` verändert (ohne die Registry zu benachrichtigen), THE Status_Bar SHALL diese Änderung anzeigen ohne das Element aus dem DOM zu entfernen und neu einzufügen
3. THE Status_Bar SHALL die relative Reihenfolge der Plugin-Items gemäß ihrer Registrierungsreihenfolge beibehalten, auch wenn einzelne Items zwischenzeitlich entfernt und neue hinzugefügt wurden

### Requirement 8: CSS-Snippet-Verwaltung in den Einstellungen

**User Story:** Als Benutzer möchte ich eigene CSS-Dateien hochladen oder direkt in der App erstellen können, damit ich das Erscheinungsbild von Slatebase individuell anpassen kann, so wie ich es von Obsidian-CSS-Snippets kenne.

#### Acceptance Criteria

1. THE Appearance_Section SHALL einen Abschnitt "CSS-Snippets" anzeigen, der alle für den aktuellen Vault gespeicherten CSS_Snippets als Liste mit Dateiname, Aktivierungsstatus und Dateigröße darstellt
2. WHEN der Benutzer eine `.css`-Datei über einen Datei-Upload-Dialog auswählt, THE CSS_Snippet_Store SHALL die Datei als neues CSS_Snippet mit deaktiviertem Status speichern
3. WHEN der Benutzer auf "Neues Snippet erstellen" klickt und einen Dateinamen eingibt, THE CSS_Snippet_Store SHALL ein leeres CSS_Snippet mit diesem Namen anlegen und einen eingebetteten Editor zur Bearbeitung öffnen
4. IF der eingegebene oder hochgeladene Dateiname bereits als CSS_Snippet im aktuellen Vault existiert, THEN THE CSS_Snippet_Store SHALL die Aktion ablehnen und eine Fehlermeldung anzeigen, die den bereits vergebenen Namen benennt
5. WHEN der Benutzer ein CSS_Snippet über den eingebetteten Editor bearbeitet und speichert, THE CSS_Snippet_Store SHALL den geänderten Inhalt persistieren und, falls das Snippet aktiviert ist, die Anzeige ohne Seiten-Reload aktualisieren
6. WHEN der Benutzer ein CSS_Snippet löscht, THE CSS_Snippet_Store SHALL die Datei aus der Verwaltung entfernen, die zugehörigen injizierten Styles über den CSS_Snippet_Injector entfernen und eine Bestätigungsabfrage vor dem Löschen anzeigen
7. IF eine hochgeladene CSS-Datei die maximale Größe von 512 KB überschreitet, THEN THE CSS_Snippet_Store SHALL den Upload ablehnen und eine Fehlermeldung mit der Größenbeschränkung anzeigen
8. THE Appearance_Section SHALL einen leeren Zustand mit Hinweistext anzeigen, wenn im aktuellen Vault keine CSS_Snippets existieren

### Requirement 9: Aktivieren und Anwenden von CSS-Snippets

**User Story:** Als Benutzer möchte ich einzelne CSS-Snippets per Toggle aktivieren oder deaktivieren können, damit ich verschiedene Anpassungen unabhängig voneinander ein- und ausschalten kann.

#### Acceptance Criteria

1. WHEN der Benutzer den Aktivierungs-Toggle eines CSS_Snippet einschaltet, THE CSS_Snippet_Injector SHALL den Inhalt der Datei unverändert (ohne Selektor-Scoping) als `<style data-snippet-id="<snippetId>">`-Element in den Dokument-`<head>` einfügen
2. WHEN der Benutzer den Aktivierungs-Toggle eines CSS_Snippet ausschaltet, THE CSS_Snippet_Injector SHALL das zugehörige `<style>`-Element aus dem Dokument-`<head>` entfernen
3. THE CSS_Snippet_Store SHALL den Aktivierungsstatus jedes CSS_Snippet pro Vault persistent im Backend speichern, sodass er nach einem Seiten-Reload und geräteübergreifend erhalten bleibt
4. WHEN der Benutzer einen Vault öffnet, THE CSS_Snippet_Injector SHALL alle für diesen Vault als aktiv markierten CSS_Snippets in der Reihenfolge ihrer Erstellung anwenden, bevor der erste sichtbare Inhalt des Vaults gerendert wird
5. WHEN der Benutzer den Vault wechselt, THE CSS_Snippet_Injector SHALL alle zuvor angewendeten Snippets des vorherigen Vaults entfernen, bevor die Snippets des neuen Vaults angewendet werden
6. IF ein aktiviertes CSS_Snippet syntaktisch ungültiges CSS enthält, THEN THE CSS_Snippet_Injector SHALL den Inhalt dennoch einfügen (der Browser ignoriert ungültige Regeln) und eine Warnung in der Entwicklerkonsole mit dem Snippet-Namen ausgeben
7. THE CSS_Snippet_Injector SHALL beim Aktivieren mehrerer Snippets deren Reihenfolge im DOM so beibehalten, dass später aktivierte Snippets bei gleicher CSS-Spezifität die zuvor aktivierten überschreiben (Anwendung in Erstellungsreihenfolge)

### Requirement 10: Backend-Persistenz von CSS-Snippets

**User Story:** Als Benutzer möchte ich, dass meine CSS-Snippets serverseitig gespeichert werden, damit sie auf allen Geräten verfügbar sind, mit denen ich auf den Vault zugreife.

#### Acceptance Criteria

1. THE Snippet_Store (Backend) SHALL CSS-Snippet-Dateien unter `data/snippets/<vaultId>/<snippetId>.css` mittels atomarer Schreiboperationen (Temp-Datei → rename) speichern
2. THE Snippet_Store (Backend) SHALL den Aktivierungsstatus aller Snippets eines Vaults in einer Registry-Datei `data/snippets/<vaultId>/_registry.json` speichern
3. THE Slatebase_Backend SHALL einzelne Snippet-Dateien auf eine maximale Größe von 512 KB begrenzen und Uploads darüber mit einer Fehlermeldung ablehnen, die auf die Größenbeschränkung hinweist
4. IF ein nicht-authentifizierter oder nicht-berechtigter Benutzer auf Snippet-Daten eines Vaults zugreift, THEN THE Slatebase_Backend SHALL den Zugriff mit derselben Zugriffskontrolle wie bei Vault-Dateien ablehnen (nur Vault-Besitzer und Benutzer mit Vault-Freigabe erhalten Zugriff)
5. WHEN ein Vault gelöscht wird, THE Slatebase_Backend SHALL alle zugehörigen Snippet-Dateien und die Registry unter `data/snippets/<vaultId>/` vollständig entfernen
6. THE Snippet_Store (Backend) SHALL Snippet-Dateinamen auf das Muster `[a-zA-Z0-9_-]+\.css` validieren und Namen mit Pfadtrennzeichen oder `..`-Sequenzen ablehnen

### Requirement 11: Überschriften-Lesezeichen

**User Story:** Als Benutzer möchte ich eine bestimmte Überschrift innerhalb einer Datei als Lesezeichen speichern können, damit ich direkt zu diesem Abschnitt zurückspringen kann.

#### Acceptance Criteria

1. WHEN der Benutzer den Befehl "Bookmarks: Bookmark heading under cursor..." (`bookmarks:bookmark-current-heading`) ausführt und sich der Cursor unterhalb mindestens einer Markdown-Überschrift in der aktiven Datei befindet, THE Favoriten_Store SHALL einen Favoriten_Eintrag mit `Bookmark_Typ = 'heading'`, Vault-ID, Dateipfad und dem Text der nächstgelegenen vorangehenden Überschrift anlegen
2. IF sich der Cursor oberhalb jeder Überschrift befindet oder die Datei keine Überschrift enthält, THEN THE Befehl SHALL keinen Eintrag anlegen und eine Fehlermeldung per Toast-Notification anzeigen
3. WHEN der Benutzer auf einen Überschriften-Bookmark in der Favoriten_Ansicht klickt, THE Slatebase_Frontend SHALL die zugehörige Datei öffnen und zur referenzierten Überschrift scrollen
4. IF die referenzierte Überschrift beim Öffnen nicht mehr in der Datei gefunden wird, THEN THE Favoriten_Ansicht SHALL die Datei trotzdem öffnen ohne zu scrollen und den Eintrag visuell als "Überschrift nicht gefunden" markieren
5. THE Favoriten_Ansicht SHALL Überschriften-Bookmarks visuell von Datei-Bookmarks unterscheiden (eigenes Icon, Anzeige von Dateiname und Überschriftentext)

### Requirement 12: Block-Lesezeichen

**User Story:** Als Benutzer möchte ich einen bestimmten Absatz oder Listeneintrag als Lesezeichen speichern können, damit ich exakt zu dieser Textstelle zurückspringen kann, auch innerhalb langer Dokumente.

#### Acceptance Criteria

1. WHEN der Benutzer den Befehl "Bookmarks: Bookmark block under cursor..." (`bookmarks:bookmark-current-section`) ausführt und der Cursor sich in einem Absatz mit vorhandenem Block_Marker befindet, THE Favoriten_Store SHALL einen Favoriten_Eintrag mit `Bookmark_Typ = 'block'`, Vault-ID, Dateipfad und der Block-ID anlegen
2. IF der Absatz unter dem Cursor noch keinen Block_Marker besitzt, THEN THE Befehl SHALL eine neue eindeutige Block-ID generieren, sie als `^block-id`-Suffix an das Ende des Absatzes im Dateiinhalt einfügen und anschließend den Favoriten_Eintrag mit dieser ID anlegen
3. WHEN der Benutzer auf einen Block-Bookmark klickt, THE Slatebase_Frontend SHALL die Datei öffnen und zum referenzierten Block scrollen
4. IF kein aktiver Editor-Tab geöffnet ist, wenn der Befehl ausgeführt wird, THEN THE Befehl SHALL keine Aktion ausführen und keinen Fehler anzeigen
5. IF die referenzierte Block-ID beim Öffnen nicht mehr in der Datei gefunden wird, THEN THE Favoriten_Ansicht SHALL die Datei trotzdem öffnen ohne zu scrollen und den Eintrag visuell als "Block nicht gefunden" markieren

### Requirement 13: Such-Lesezeichen

**User Story:** Als Benutzer möchte ich eine häufig verwendete Suchanfrage als Lesezeichen speichern, damit ich sie mit einem Klick erneut ausführen kann, ohne sie neu einzutippen.

#### Acceptance Criteria

1. WHEN der Benutzer den Befehl "Bookmarks: Bookmark current search..." (`bookmarks:bookmark-current-search`) ausführt und das Suchpanel eine nicht-leere Suchanfrage enthält, THE Favoriten_Store SHALL einen Favoriten_Eintrag mit `Bookmark_Typ = 'search'` und der Suchanfrage inklusive der Flags `caseSensitive` und `regex` anlegen
2. IF das Suchpanel keine aktive Suchanfrage enthält oder nicht geöffnet ist, THEN THE Befehl SHALL keinen Eintrag anlegen und eine Fehlermeldung per Toast-Notification anzeigen
3. WHEN der Benutzer auf einen Such-Bookmark in der Favoriten_Ansicht klickt, THE Slatebase_Frontend SHALL das Suchpanel öffnen, die gespeicherte Anfrage samt Flags übernehmen und die Suche automatisch ausführen
4. THE Favoriten_Ansicht SHALL Such-Bookmarks mit einem eigenen Icon und der Suchanfrage als Anzeigetext darstellen, wobei aktivierte Flags (Regex, Groß-/Kleinschreibung) als kleine Badges neben dem Text erscheinen

### Requirement 14: Alle offenen Tabs bookmarken

**User Story:** Als Benutzer möchte ich alle aktuell geöffneten Datei-Tabs mit einem Befehl gesammelt als Lesezeichen speichern, damit ich eine Arbeitssitzung schnell wiederherstellen kann.

#### Acceptance Criteria

1. WHEN der Benutzer den Befehl "Bookmarks: Bookmark all tabs..." (`bookmarks:bookmark-all-tabs`) ausführt, THE Favoriten_Store SHALL für jede im Tab-System geöffnete Datei, die noch nicht als Datei-Bookmark existiert, einen neuen Favoriten_Eintrag mit `Bookmark_Typ = 'file'` anlegen
2. THE Befehl SHALL Tabs ohne zugehörige Vault-Datei (z. B. Einstellungs-Tabs, Plugin-Views ohne Datei-Bezug) beim Bookmarken überspringen
3. IF alle offenen Datei-Tabs bereits als Bookmark existieren, THEN THE Befehl SHALL keine neuen Einträge anlegen und einen Hinweis-Toast anzeigen, dass bereits alle offenen Tabs favorisiert sind
4. IF das Hinzufügen aller offenen Tabs das Limit von 50 Favoriten pro Vault überschreiten würde, THEN THE Befehl SHALL Tabs in ihrer Reihenfolge in der Tableiste hinzufügen, bis das Limit erreicht ist, die übrigen auslassen und einen Hinweis-Toast anzeigen, dass das Limit erreicht wurde

## Non-Functional Constraints

- Alle neuen UI-Texte folgen der bestehenden zweisprachigen Struktur (Deutsch als Primärsprache in Code-Kommentaren und UI-Strings, konsistent mit der bestehenden `AppearanceSection.tsx`)
- Bestehende Datenstrukturen (`FavoriteEntry`, `IApiClient.saveFavorites`/`getFavorites`) werden erweitert, nicht ersetzt; bestehende Aufrufer bleiben ohne Änderung lauffähig (additive, optionale Felder)
- CSS-Snippet-Injection darf die First-Contentful-Paint-Zeit beim Öffnen eines Vaults um maximal 50 Millisekunden verzögern (analog zur bestehenden Grenze für Plugin-Laden in `.kiro/specs/obsidian-plugin-compat/requirements.md`)
- Kein Feature in diesem Dokument führt neue Backend-Datenbank-Migrationen ein; CSS-Snippets nutzen ausschließlich Dateisystem-Persistenz analog zu `backend/src/plugin/plugin-store.ts`
