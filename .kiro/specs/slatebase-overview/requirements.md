# Requirements Document

## Introduction

Slatebase ist ein selbst-gehosteter Knowledge-Context-Server für Markdown-Vaults. Das System ermöglicht Benutzern, ihre Markdown-basierten Wissensdatenbanken zentral zu verwalten, zu durchsuchen, zu bearbeiten und über einen integrierten Viewer zu betrachten. Slatebase ist kompatibel mit Obsidian-Vaults und unterstützt Multi-Vault-Verwaltung pro Benutzer. Darüber hinaus bietet Slatebase Kompatibilität mit Obsidian Community-Plugins, sodass bestehende Erweiterungen aus dem Obsidian-Ökosystem genutzt werden können. Markdown-Dateien können direkt im Vault_Viewer bearbeitet werden, ohne externe Editoren zu benötigen. Eine interaktive Knowledge-Graph-Visualisierung stellt die Verlinkungen zwischen Dateien graphisch dar. Slatebase fungiert als AI-Context-Server und stellt Vault-Inhalte strukturiert über das Model Context Protocol (MCP) für AI-Tools bereit. Synchronisationsfunktionen ermöglichen den Abgleich von Vault-Inhalten zwischen verschiedenen Instanzen, unter anderem über Obsidian LiveSync (CouchDB-basiert). Die Benutzeroberfläche unterstützt Internationalisierung (i18n) für mehrsprachige Nutzung sowie Barrierefreiheit (a11y) gemäß WCAG-Richtlinien.

## Glossary

- **Slatebase**: Der selbst-gehostete Knowledge-Context-Server
- **Vault**: Eine Sammlung von Markdown-Dateien und zugehörigen Ressourcen, die eine Wissensdatenbank bilden
- **Benutzer**: Eine authentifizierte Person, die auf Slatebase zugreift
- **Vault_Viewer**: Die Weboberfläche zur Anzeige und Navigation von Vault-Inhalten
- **Datei_Explorer**: Die Baumansicht der Dateien und Ordner innerhalb eines Vaults
- **Interner_Link**: Ein Verweis innerhalb einer Markdown-Datei auf eine andere Datei im selben Vault (z.B. `[[Seitenname]]`)
- **Tab**: Ein geöffnetes Dokument im Vault_Viewer, vergleichbar mit Browser-Tabs
- **Import**: Das Einlesen eines Vaults vom Dateisystem in Slatebase
- **Export**: Das Herausschreiben eines Vaults aus Slatebase auf das Dateisystem
- **Community_Plugin**: Eine von der Obsidian-Community entwickelte Erweiterung, die zusätzliche Funktionalität bereitstellt
- **Plugin_API**: Die Programmierschnittstelle, über die Community_Plugins mit Slatebase interagieren
- **Markdown_Editor**: Die integrierte Bearbeitungskomponente im Vault_Viewer mit Live-Preview-Funktionalität
- **Knowledge_Graph**: Eine visuelle Darstellung der Verlinkungen zwischen Dateien als interaktiver, navigierbarer Graph
- **AI_Context_Server**: Die Komponente von Slatebase, die Vault-Inhalte als strukturierten Kontext für AI-Modelle bereitstellt
- **MCP**: Model Context Protocol – ein standardisiertes Protokoll zur Bereitstellung von Kontext für AI-Tools
- **MCP_Server**: Die Slatebase-Komponente, die das Model Context Protocol implementiert und als Server für AI-Tools fungiert
- **Sync**: Die Synchronisationsfunktion zum Abgleich von Vault-Inhalten zwischen Instanzen
- **LiveSync**: Eine Obsidian Community-Erweiterung zur CouchDB-basierten Echtzeit-Synchronisation von Vaults
- **i18n**: Internationalisierung – die Fähigkeit, die Benutzeroberfläche in verschiedenen Sprachen anzubieten
- **Locale**: Eine Sprach- und Regionskombination (z.B. de-DE, en-US), die die Anzeigesprache bestimmt
- **a11y**: Accessibility/Barrierefreiheit – die Gestaltung der Benutzeroberfläche für Menschen mit Behinderungen gemäß WCAG-Richtlinien
- **WCAG**: Web Content Accessibility Guidelines – internationaler Standard für barrierefreie Webinhalte

## Requirements

### Anforderung 1: Benutzerverwaltung

**User Story:** Als Administrator möchte ich Benutzer anlegen und verwalten können, damit nur autorisierte Personen auf Slatebase zugreifen.

#### Akzeptanzkriterien

1. THE Slatebase SHALL eine Registrierung und Anmeldung von Benutzern mit Benutzername (3–64 Zeichen) und Passwort (mindestens 8 Zeichen) bereitstellen
2. WHEN ein Benutzer gültige Anmeldedaten übermittelt, THE Slatebase SHALL die Identität des Benutzers verifizieren und einen zeitlich begrenzten Zugangstoken (maximal 24 Stunden gültig) ausstellen
3. IF ein nicht-authentifizierter Zugriff auf eine geschützte Ressource erfolgt, THEN THE Slatebase SHALL den Zugriff verweigern und eine Anmeldeaufforderung zurückgeben
4. WHEN ein Benutzer sich abmeldet, THE Slatebase SHALL die aktive Sitzung beenden und den Zugangstoken invalidieren
5. IF ein Benutzer ungültige Anmeldedaten übermittelt, THEN THE Slatebase SHALL die Anmeldung ablehnen und eine Fehlermeldung anzeigen, die auf ungültige Zugangsdaten hinweist

### Anforderung 2: Multi-Vault-Unterstützung

**User Story:** Als Benutzer möchte ich mehrere Vaults verwalten können, damit ich meine Wissenssammlungen thematisch trennen kann.

#### Akzeptanzkriterien

1. THE Slatebase SHALL jedem Benutzer die Erstellung und Verwaltung von bis zu 50 Vaults ermöglichen
2. WHEN ein Benutzer einen neuen Vault erstellt, THE Slatebase SHALL den Vault mit einem innerhalb des Benutzerkontos eindeutigen Namen (1–128 Zeichen) dem Benutzer zuordnen
3. IF ein Benutzer einen Vault-Namen wählt, der innerhalb seines Kontos bereits existiert, THEN THE Slatebase SHALL die Erstellung ablehnen und eine Fehlermeldung anzeigen, die auf den Namenskonflikt hinweist
4. THE Slatebase SHALL die Vaults eines Benutzers voneinander isolieren, sodass Dateizugriffe, Suchanfragen und Metadaten stets auf einen einzelnen Vault beschränkt bleiben
5. WHEN ein Benutzer einen Vault löscht, THE Slatebase SHALL eine Bestätigung anfordern und nach Bestätigung alle zugehörigen Dateien und Metadaten unwiderruflich entfernen

### Anforderung 3: Vault Import und Export

**User Story:** Als Benutzer möchte ich Vaults vom Dateisystem importieren und auf das Dateisystem exportieren können, damit ich bestehende Markdown-Sammlungen nutzen und Backups erstellen kann.

#### Akzeptanzkriterien

1. WHEN ein Benutzer einen Vault-Import startet, THE Slatebase SHALL eine Verzeichnisstruktur vom Dateisystem einlesen und als neuen Vault anlegen
2. WHEN ein Benutzer einen Vault-Export startet, THE Slatebase SHALL den gesamten Vault-Inhalt als Verzeichnisstruktur auf das Dateisystem schreiben
3. WHEN ein Vault-Import durchgeführt wird, THE Slatebase SHALL die relative Ordnerstruktur und Dateinamen des Quellverzeichnisses im angelegten Vault beibehalten
4. WHEN ein Vault-Export durchgeführt wird, THE Slatebase SHALL die im Vault gespeicherte Ordnerstruktur und Dateinamen im Zielverzeichnis wiederherstellen
5. IF ein Import fehlschlägt, THEN THE Slatebase SHALL eine Fehlermeldung anzeigen, die den Grund des Fehlschlags benennt, und keine unvollständigen Daten im System speichern
6. IF ein Export fehlschlägt, THEN THE Slatebase SHALL eine Fehlermeldung anzeigen, die den Grund des Fehlschlags benennt, und bereits geschriebene unvollständige Daten im Zielverzeichnis bereinigen
7. THE Slatebase SHALL beim Import alle Dateien innerhalb des Quellverzeichnisses einlesen, wobei mindestens Markdown-Dateien (.md) und eingebettete Medien-Dateien (Bilder, PDFs) unterstützt werden

### Anforderung 4: Vault Viewer

**User Story:** Als Benutzer möchte ich meine Vault-Inhalte über eine Weboberfläche betrachten und navigieren können, damit ich schnell auf mein Wissen zugreifen kann.

#### Akzeptanzkriterien

1. THE Vault_Viewer SHALL einen Datei_Explorer mit Baumansicht anzeigen, die alle Ordner und Dateien der Vault-Struktur hierarchisch darstellt
2. WHEN ein Benutzer eine Markdown-Datei im Datei_Explorer auswählt, THE Vault_Viewer SHALL den Inhalt als gerenderten Markdown in einem neuen Tab anzeigen
3. THE Vault_Viewer SHALL bis zu 20 gleichzeitig geöffnete Tabs unterstützen
4. WHEN ein Benutzer einen Internen_Link in einem Dokument anklickt, THE Vault_Viewer SHALL die verlinkte Datei in einem neuen Tab öffnen, sofern sie nicht bereits in einem Tab geöffnet ist, andernfalls SHALL der existierende Tab aktiviert werden
5. WHEN ein Benutzer einen Tab schließt und mindestens ein weiterer Tab geöffnet ist, THE Vault_Viewer SHALL den Tab entfernen und den zuletzt aktiven Tab anzeigen
6. WHEN ein Benutzer den letzten geöffneten Tab schließt, THE Vault_Viewer SHALL den Tab entfernen und eine leere Ansicht mit dem Datei_Explorer anzeigen
7. IF ein Benutzer einen Internen_Link anklickt, dessen Zieldatei nicht existiert, THEN THE Vault_Viewer SHALL eine Fehlermeldung anzeigen, die den nicht aufgelösten Dateinamen enthält
8. IF ein Benutzer versucht, mehr als 20 Tabs zu öffnen, THEN THE Vault_Viewer SHALL eine Hinweismeldung anzeigen, dass das Tab-Limit erreicht ist, und keinen weiteren Tab öffnen

### Anforderung 5: Obsidian-Kompatibilität

**User Story:** Als Obsidian-Nutzer möchte ich meine bestehenden Vaults in Slatebase verwenden können, damit ich meine Arbeitsabläufe beibehalten kann.

#### Akzeptanzkriterien

1. THE Slatebase SHALL die Obsidian-Wikilink-Syntax (`[[Seitenname]]` und `[[Seitenname|Anzeigename]]`) erkennen und als klickbare Links rendern, die zur referenzierten Seite innerhalb des Vaults navigieren
2. IF ein Wikilink-Ziel innerhalb des Vaults nicht existiert, THEN SHALL Slatebase den Link visuell als nicht-aufgelöst kennzeichnen und dennoch als klickbares Element darstellen
3. THE Slatebase SHALL Obsidian-Frontmatter im YAML-Format parsen und die darin definierten Schlüssel-Wert-Paare als durchsuchbare und filterbare Metadaten der jeweiligen Seite bereitstellen
4. IF das YAML-Frontmatter einer Datei syntaktisch ungültig ist, THEN SHALL Slatebase den Seiteninhalt dennoch anzeigen und einen Hinweis auf das fehlerhafte Frontmatter darstellen
5. THE Slatebase SHALL eingebettete Inhalte mit der Obsidian-Syntax (`![[Dateiname]]`) erkennen und den referenzierten Inhalt (Markdown-Dateien, Bilder, Audio- und PDF-Dateien) inline innerhalb der einbettenden Seite darstellen
6. THE Slatebase SHALL die Obsidian-Ordnerstruktur einschließlich des `.obsidian`-Konfigurationsverzeichnisses beim Import vollständig erhalten, wobei das `.obsidian`-Verzeichnis gespeichert aber nicht von Slatebase interpretiert wird

### Anforderung 6: Obsidian Community Plugin Kompatibilität

**User Story:** Als Obsidian-Nutzer möchte ich meine gewohnten Community-Plugins auch in Slatebase nutzen können, damit ich meine bestehenden Workflows beibehalten kann.

#### Akzeptanzkriterien

1. THE Slatebase SHALL eine Plugin_API bereitstellen, die es Community_Plugins ermöglicht, mit dem Vault-Inhalt zu interagieren
2. THE Slatebase SHALL eine Kompatibilitätsschicht implementieren, die Obsidian-Plugin-APIs soweit möglich auf Slatebase-Funktionen abbildet
3. WHEN ein Benutzer ein Community_Plugin installiert, THE Slatebase SHALL das Plugin in einer isolierten Umgebung laden und ausführen
4. IF ein Community_Plugin eine nicht unterstützte API-Funktion aufruft, THEN SHALL Slatebase eine Warnung protokollieren und den Aufruf graceful ignorieren, ohne den Betrieb zu unterbrechen
5. THE Slatebase SHALL eine Liste kompatibler Community_Plugins bereitstellen, die getestet und als funktionsfähig bestätigt wurden

### Anforderung 7: Datei-Bearbeitung

**User Story:** Als Benutzer möchte ich Markdown-Dateien direkt im Vault_Viewer bearbeiten können, damit ich mein Wissen ohne externe Tools pflegen kann.

#### Akzeptanzkriterien

1. WHEN ein Benutzer eine Markdown-Datei im Vault_Viewer geöffnet hat, THE Markdown_Editor SHALL einen Bearbeitungsmodus bereitstellen, der zwischen Lese- und Bearbeitungsansicht umschalten lässt
2. WHEN ein Benutzer im Bearbeitungsmodus Text eingibt, THE Markdown_Editor SHALL eine Live-Preview des gerenderten Markdowns anzeigen
3. WHEN ein Benutzer Änderungen speichert, THE Slatebase SHALL die Datei im Vault persistent aktualisieren
4. IF ein Benutzer den Bearbeitungsmodus verlässt ohne zu speichern, THEN SHALL Slatebase den Benutzer auf ungespeicherte Änderungen hinweisen und eine Bestätigung anfordern
5. THE Markdown_Editor SHALL die Obsidian-Markdown-Syntax einschließlich Wikilinks, Frontmatter und Embeds im Bearbeitungsmodus unterstützen

### Anforderung 8: Knowledge Graph

**User Story:** Als Benutzer möchte ich die Verlinkungen zwischen meinen Dateien als interaktiven Graphen visualisieren können, damit ich Zusammenhänge in meinem Wissen erkennen kann.

#### Akzeptanzkriterien

1. THE Knowledge_Graph SHALL alle Dateien eines Vaults als Knoten und alle Internen_Links als Kanten in einem interaktiven Graphen darstellen
2. WHEN ein Benutzer einen Knoten im Knowledge_Graph anklickt, THE Vault_Viewer SHALL die entsprechende Datei in einem Tab öffnen
3. THE Knowledge_Graph SHALL Zoom- und Pan-Funktionalität bereitstellen, um große Graphen navigierbar zu machen
4. WHEN ein Benutzer eine Datei im Vault_Viewer geöffnet hat, THE Knowledge_Graph SHALL optional eine lokale Ansicht anzeigen, die nur die direkt verlinkten Nachbar-Dateien darstellt
5. THE Knowledge_Graph SHALL verwaiste Dateien (ohne ein- oder ausgehende Links) visuell kennzeichnen

### Anforderung 9: AI Context Server

**User Story:** Als Entwickler möchte ich Vault-Inhalte als strukturierten Kontext für AI-Modelle bereitstellen können, damit AI-Anwendungen auf mein Wissen zugreifen können.

#### Akzeptanzkriterien

1. THE AI_Context_Server SHALL Vault-Inhalte über eine API als strukturierten Kontext für AI-Modelle bereitstellen
2. THE AI_Context_Server SHALL eine semantische Suche über Vault-Inhalte ermöglichen, um relevante Dokumente für eine gegebene Anfrage zu identifizieren
3. WHEN ein AI-Tool Kontext anfordert, THE AI_Context_Server SHALL die relevantesten Vault-Inhalte basierend auf der Anfrage auswählen und in einem für AI-Modelle optimierten Format zurückgeben
4. THE AI_Context_Server SHALL die Benutzer-Authentifizierung respektieren und nur Inhalte bereitstellen, auf die der anfragende Benutzer Zugriff hat
5. THE AI_Context_Server SHALL Metadaten (Frontmatter, Tags, Verlinkungen) als zusätzlichen Kontext zu den Dokumentinhalten bereitstellen

### Anforderung 10: MCP (Model Context Protocol)

**User Story:** Als AI-Tool-Entwickler möchte ich über das standardisierte Model Context Protocol auf Slatebase-Inhalte zugreifen können, damit meine Tools nahtlos mit dem Wissensserver interagieren.

#### Akzeptanzkriterien

1. THE MCP_Server SHALL das Model Context Protocol vollständig implementieren und als MCP-kompatibler Server für AI-Tools fungieren
2. THE MCP_Server SHALL Vault-Inhalte als MCP-Ressourcen exponieren, die von MCP-Clients abgefragt werden können
3. THE MCP_Server SHALL MCP-Tools bereitstellen, die Suche, Navigation und Abruf von Vault-Inhalten ermöglichen
4. WHEN ein MCP-Client eine Verbindung herstellt, THE MCP_Server SHALL die verfügbaren Ressourcen und Tools gemäß MCP-Spezifikation bekannt geben
5. THE MCP_Server SHALL die Benutzer-Authentifizierung über MCP-konforme Mechanismen sicherstellen

### Anforderung 11: Sync

**User Story:** Als Benutzer möchte ich meine Vaults zwischen verschiedenen Instanzen synchronisieren können, damit ich auf mehreren Geräten mit aktuellen Inhalten arbeiten kann.

#### Akzeptanzkriterien

1. THE Slatebase SHALL eine Synchronisationsfunktion bereitstellen, die Vault-Inhalte zwischen verschiedenen Instanzen abgleicht
2. THE Slatebase SHALL kompatibel mit der Obsidian-Community-Erweiterung LiveSync (CouchDB-basiert) sein, sodass Vaults zwischen Obsidian-Clients und Slatebase synchronisiert werden können
3. WHEN ein Synchronisationskonflikt auftritt, THE Slatebase SHALL den Konflikt erkennen und dem Benutzer eine Auflösungsmöglichkeit anbieten
4. THE Slatebase SHALL den Synchronisationsstatus pro Vault anzeigen, sodass der Benutzer erkennen kann, ob alle Änderungen synchronisiert sind
5. IF die Verbindung zur Synchronisationsquelle unterbrochen wird, THEN SHALL Slatebase lokal weiterarbeiten und die Synchronisation automatisch fortsetzen, sobald die Verbindung wiederhergestellt ist

### Anforderung 12: Internationalisierung (i18n)

**User Story:** Als Benutzer möchte ich Slatebase in meiner bevorzugten Sprache nutzen können, damit ich die Oberfläche intuitiv bedienen kann.

#### Akzeptanzkriterien

1. THE Slatebase SHALL die Benutzeroberfläche in mindestens Deutsch und Englisch bereitstellen
2. WHEN ein Benutzer eine Locale in seinen Einstellungen auswählt, THE Slatebase SHALL alle UI-Texte, Fehlermeldungen und Systemnachrichten in der gewählten Sprache anzeigen
3. THE Slatebase SHALL ein erweiterbares Übersetzungssystem bereitstellen, das das Hinzufügen weiterer Sprachen ohne Code-Änderungen ermöglicht
4. IF für einen UI-Text keine Übersetzung in der gewählten Locale vorhanden ist, THEN SHALL Slatebase auf die Standard-Locale (Englisch) zurückfallen
5. THE Slatebase SHALL Datums-, Zeit- und Zahlenformate gemäß der gewählten Locale formatieren

### Anforderung 13: Barrierefreiheit (a11y)

**User Story:** Als Benutzer mit Einschränkungen möchte ich Slatebase barrierefrei nutzen können, damit ich gleichberechtigten Zugang zu meinem Wissen habe.

#### Akzeptanzkriterien

1. THE Slatebase SHALL die WCAG 2.1 Level AA Konformität für alle Benutzeroberflächen-Komponenten einhalten
2. THE Slatebase SHALL vollständige Tastaturnavigation für alle interaktiven Elemente bereitstellen, einschließlich Datei_Explorer, Tabs, Knowledge_Graph und Markdown_Editor
3. THE Slatebase SHALL semantische HTML-Strukturen und ARIA-Attribute verwenden, sodass Screenreader alle Inhalte und Interaktionselemente korrekt erfassen können
4. THE Slatebase SHALL ausreichende Farbkontraste (mindestens 4.5:1 für normalen Text, 3:1 für großen Text) in allen Ansichten gewährleisten
5. THE Slatebase SHALL Fokus-Indikatoren für alle interaktiven Elemente sichtbar darstellen, sodass die aktuelle Position bei Tastaturnavigation erkennbar ist
6. IF ein Benutzer eine Bildschirmvergrößerung bis 200% verwendet, THEN SHALL Slatebase alle Inhalte ohne horizontales Scrollen und ohne Informationsverlust darstellen
