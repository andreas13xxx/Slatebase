# Requirements Document

## Introduction

Dieses Dokument beschreibt die Anforderungen für das Slatebase MVP (Minimum Viable Product). Das MVP baut auf der Gesamtvision auf, die in #[[file:../slatebase-overview/requirements.md]] beschrieben ist, und implementiert nur die absolut notwendigen Kernfunktionen: Vault vom lokalen Dateisystem laden, Dateien in einer Baumansicht anzeigen und Seiteninhalte als Klartext darstellen.

Das MVP bildet die architektonische Basis für alle zukünftigen Features. Designentscheidungen, die später wesentliche Umbauten erfordern würden, werden bewusst vermieden. Nicht im MVP enthalten sind: Benutzerverwaltung, Internationalisierung, AI-Features, Plugin-System, Knowledge Graph, Markdown-Rendering, Datei-Bearbeitung, Synchronisation und Export.

## Glossary

- **Slatebase**: Der selbst-gehostete Knowledge-Context-Server für Markdown-Vaults
- **Vault**: Eine Sammlung von Markdown-Dateien und zugehörigen Ressourcen in einer Verzeichnisstruktur auf dem lokalen Dateisystem
- **Vault_Verzeichnis**: Der Wurzelordner eines Vaults auf dem lokalen Dateisystem
- **Datei_Explorer**: Die Baumansicht der Dateien und Ordner innerhalb eines Vaults in der Weboberfläche
- **Klartext_Ansicht**: Die Darstellung einer Datei als unformatierter Text ohne Markdown-Rendering

## Requirements

### Anforderung 1: Vault vom Dateisystem laden

**User Story:** Als Benutzer möchte ich ein Vault-Verzeichnis vom lokalen Dateisystem in Slatebase laden können, damit ich meine bestehende Markdown-Sammlung im Browser betrachten kann.

#### Akzeptanzkriterien

1. WHEN der Server gestartet wird, THE Slatebase SHALL alle in der Konfiguration definierten Vault_Verzeichnisse (mindestens 1, maximal 20) vom lokalen Dateisystem einlesen und deren Verzeichnisstruktur im Speicher bereitstellen
2. THE Slatebase SHALL die vollständige Verzeichnisstruktur eines Vault_Verzeichnisses rekursiv bis zu einer maximalen Tiefe von 50 Ebenen erfassen, einschließlich aller Unterordner und Dateien
3. IF ein konfiguriertes Vault_Verzeichnis nicht existiert oder nicht lesbar ist, THEN THE Slatebase SHALL eine Fehlermeldung protokollieren, die den betroffenen Pfad benennt, und den Server ohne diesen Vault starten
4. THE Slatebase SHALL die Vault-Konfiguration über eine Konfigurationsdatei und Umgebungsvariablen ermöglichen, wobei Umgebungsvariablen Vorrang vor Werten in der Konfigurationsdatei haben
5. WHEN ein Vault geladen wird, THE Slatebase SHALL den Vault-Namen aus dem Verzeichnisnamen ableiten, begrenzt auf maximal 128 Zeichen
6. IF zwei oder mehr konfigurierte Vault_Verzeichnisse denselben Verzeichnisnamen haben, THEN THE Slatebase SHALL den Vault-Namen durch Anhängen eines numerischen Suffixes (z.B. „Vault", „Vault-2") eindeutig machen
7. IF keine Vault_Verzeichnisse konfiguriert sind, THEN THE Slatebase SHALL eine Warnmeldung protokollieren und den Server ohne geladene Vaults starten

### Anforderung 2: Vault-Übersicht anzeigen

**User Story:** Als Benutzer möchte ich eine Übersicht aller geladenen Vaults sehen, damit ich den gewünschten Vault auswählen kann.

#### Akzeptanzkriterien

1. THE Slatebase SHALL auf der Startseite eine Liste aller erfolgreich geladenen Vaults als auswählbare Einträge anzeigen
2. WHEN ein Benutzer einen Vault aus der Liste auswählt, THE Slatebase SHALL den Datei_Explorer für diesen Vault anzeigen und eine Navigationsmöglichkeit zur Vault-Übersicht bereitstellen
3. THE Slatebase SHALL für jeden Vault in der Übersicht den Vault-Namen anzeigen
4. IF kein Vault erfolgreich geladen wurde, THEN THE Slatebase SHALL auf der Startseite eine Meldung anzeigen, die darauf hinweist, dass keine Vaults verfügbar sind

### Anforderung 3: Datei-Explorer mit Baumansicht

**User Story:** Als Benutzer möchte ich die Dateien und Ordner eines Vaults in einer hierarchischen Baumansicht sehen, damit ich durch meine Wissenssammlung navigieren kann.

#### Akzeptanzkriterien

1. THE Datei_Explorer SHALL alle Ordner und Dateien eines Vaults in einer hierarchischen Baumstruktur darstellen, die die Verzeichnisstruktur des Dateisystems widerspiegelt, wobei beim erstmaligen Laden alle Ordner im zugeklappten Zustand angezeigt werden
2. WHEN ein Benutzer einen Ordner im Datei_Explorer anklickt, THE Datei_Explorer SHALL den Ordner auf- oder zuklappen, die enthaltenen Elemente ein- oder ausblenden und den Klapzustand durch ein visuelles Indikator-Symbol (z.B. Pfeil) kennzeichnen
3. WHEN ein Benutzer eine Datei im Datei_Explorer anklickt, THE Slatebase SHALL den Inhalt dieser Datei in der Klartext_Ansicht anzeigen und die ausgewählte Datei im Datei_Explorer visuell hervorheben
4. THE Datei_Explorer SHALL Ordner und Dateien alphabetisch ohne Berücksichtigung der Groß-/Kleinschreibung sortiert anzeigen, wobei Ordner vor Dateien aufgelistet werden
5. THE Datei_Explorer SHALL den Dateinamen und bei Ordnern die Anzahl der direkt enthaltenen Elemente (Dateien und Unterordner) anzeigen
6. IF ein Vault keine Dateien oder Ordner enthält, THEN THE Datei_Explorer SHALL einen Hinweistext anzeigen, der darauf hinweist, dass der Vault leer ist

### Anforderung 4: Klartext-Anzeige von Dateien

**User Story:** Als Benutzer möchte ich den Inhalt einer ausgewählten Datei als Klartext sehen, damit ich den Inhalt meiner Notizen lesen kann.

#### Akzeptanzkriterien

1. WHEN ein Benutzer eine Datei auswählt, THE Klartext_Ansicht SHALL den vollständigen Dateiinhalt als unformatierten Text anzeigen, wobei Zeilenumbrüche, Leerzeichen und Tabulatoren originalgetreu erhalten bleiben
2. THE Klartext_Ansicht SHALL den Dateinamen als Überschrift über dem Dateiinhalt anzeigen
3. THE Klartext_Ansicht SHALL den Text in einer Monospace-Schriftart darstellen, um die Formatierung des Quelltexts zu erhalten
4. IF eine Datei nicht gelesen werden kann, THEN THE Slatebase SHALL anstelle des Dateiinhalts eine Fehlermeldung anzeigen, die den Dateinamen und den Grund des Fehlers (z.B. fehlende Leseberechtigung, Datei nicht gefunden) benennt
5. THE Klartext_Ansicht SHALL Dateien mit UTF-8-Kodierung darstellen, sodass alle gültigen UTF-8-Zeichen einschließlich Sonderzeichen und Umlaute sichtbar sind
6. IF eine ausgewählte Datei eine Binärdatei ist (nicht als Text interpretierbar), THEN THE Slatebase SHALL anstelle des Dateiinhalts einen Hinweis anzeigen, dass die Datei nicht als Klartext darstellbar ist
7. IF eine ausgewählte Datei größer als 5 MB ist, THEN THE Slatebase SHALL nur die ersten 5 MB des Dateiinhalts anzeigen und einen Hinweis einblenden, dass der Inhalt abgeschnitten wurde

### Anforderung 5: Architektonische Erweiterbarkeit

**User Story:** Als Entwickler möchte ich, dass das MVP eine erweiterbare Architektur hat, damit zukünftige Features ohne wesentliche Umbauten hinzugefügt werden können.

#### Akzeptanzkriterien

1. THE Slatebase SHALL Backend (API-Server) und Frontend (Web-Client) als voneinander unabhängige Komponenten implementieren, die ausschließlich über eine definierte REST-API kommunizieren, sodass keine direkte Code-Abhängigkeit zwischen Frontend- und Backend-Quellcode besteht
2. THE Slatebase SHALL das Backend so strukturieren, dass Vault-Zugriff, API-Routing und Geschäftslogik in separaten Verzeichnissen organisiert sind, wobei kein Modul direkte Importe aus einem anderen Modul auf gleicher Ebene enthält, sondern Abhängigkeiten über definierte Schnittstellen aufgelöst werden
3. THE Slatebase SHALL das Frontend so strukturieren, dass UI-Komponenten, Zustandsverwaltung und API-Kommunikation in separaten Verzeichnissen organisiert sind, wobei UI-Komponenten nicht direkt auf die API-Kommunikationsschicht zugreifen, sondern ausschließlich über die Zustandsverwaltung
4. THE Slatebase SHALL alle API-Endpunkte unter einem versionierten Pfadpräfix (z.B. /api/v1/) bereitstellen, sodass zukünftige API-Versionen parallel unter einem neuen Präfix (z.B. /api/v2/) eingeführt werden können, ohne bestehende Endpunkte zu verändern
5. THE Slatebase SHALL mindestens folgende Einstellungen über Umgebungsvariablen oder eine Konfigurationsdatei externalisieren, ohne dass Code-Änderungen erforderlich sind: Vault-Pfade, Server-Port, Host-Adresse und Log-Level
6. THE Slatebase SHALL das API-Routing so gestalten, dass neue Endpunkte durch Hinzufügen eines neuen Routen-Moduls registriert werden können, ohne bestehende Routen-Module zu modifizieren
