# Requirements Document

## Introduction

Neue Benutzer erhalten bei der Account-Erstellung automatisch einen "Welcome Vault", der eine Einführung in Slatebase enthält. Der Vault demonstriert die wichtigsten Features anhand praktischer Beispiele (Wikilinks, Callouts, Tags, Embeds, Ordnerstruktur) und bietet eine schrittweise Anleitung.

## Glossary

- **Welcome_Vault**: Ein vorkonfigurierter Vault mit Tutorial-Inhalten der automatisch für neue Benutzer erstellt wird
- **Template_Verzeichnis**: Ein Verzeichnis im Backend (`data/templates/welcome-vault/`) das die Vorlagendateien für den Welcome Vault enthält
- **User_Service**: Der bestehende Service der Benutzer erstellt und verwaltet

## Requirements

### Requirement 1: Welcome Vault bei Account-Erstellung

**User Story:** Als neuer Benutzer möchte ich nach der Account-Erstellung einen vorbereiteten Vault mit Anleitungen vorfinden, damit ich Slatebase sofort produktiv nutzen kann.

#### Acceptance Criteria

1. WHEN ein neuer Benutzer-Account erstellt wird (via Admin oder Registrierung), THE Welcome_Vault SHALL automatisch als neuer Vault mit dem Namen "Willkommen" für diesen Benutzer erstellt werden
2. THE Welcome_Vault SHALL alle Dateien und Ordner aus dem Template_Verzeichnis in den neuen Vault kopieren, wobei die Ordnerstruktur beibehalten wird
3. IF das Template_Verzeichnis nicht existiert oder leer ist, THEN THE Welcome_Vault SHALL einen leeren Vault ohne Inhalt erstellen und den Fehler loggen (kein Abbruch der Account-Erstellung)
4. IF die Vault-Erstellung fehlschlägt (Dateisystem-Fehler), THEN THE Account-Erstellung SHALL trotzdem erfolgreich abgeschlossen werden und der Fehler geloggt werden
5. THE Welcome_Vault SHALL dem neuen Benutzer als Owner zugewiesen werden
6. IF ein Feature-Toggle `welcome-vault` existiert und deaktiviert ist, THEN THE Welcome_Vault SHALL nicht erstellt werden

### Requirement 2: Inhalt des Welcome Vaults

**User Story:** Als neuer Benutzer möchte ich im Welcome Vault eine praxisnahe Einführung in alle wichtigen Slatebase-Features finden, damit ich die Möglichkeiten der Anwendung schnell verstehe.

#### Acceptance Criteria

1. THE Welcome_Vault SHALL eine Startdatei `Start hier.md` enthalten, die als Einstiegspunkt dient und Wikilinks zu allen anderen Anleitungsdateien enthält
2. THE Welcome_Vault SHALL Beispieldateien enthalten die folgende Features demonstrieren: Wikilinks (`[[Ziel]]`-Syntax), Tags (`#beispiel`), Callouts (Tip, Warning, Info), Embeds (Bild-Embed, Notiz-Embed), Ordnerstruktur (mindestens 2 Unterordner)
3. THE Welcome_Vault SHALL eine Ordnerstruktur verwenden die ein realistisches Knowledge-Management-Szenario abbildet (z.B. `Projekte/`, `Referenz/`, `Täglich/`)
4. THE Welcome_Vault SHALL insgesamt mindestens 5 und maximal 15 Markdown-Dateien enthalten
5. THE Welcome_Vault SHALL alle Textinhalte in Deutsch verfassen (UI-Sprache des Produkts)
6. THE Welcome_Vault SHALL mindestens ein Beispielbild enthalten (z.B. das Slatebase-Logo als PNG) um die Bild-Embed-Funktion zu demonstrieren

### Requirement 3: Konfigurierbarkeit

**User Story:** Als Administrator möchte ich steuern können ob und welcher Welcome Vault erstellt wird, damit ich die Inhalte an meine Organisation anpassen kann.

#### Acceptance Criteria

1. THE Welcome_Vault SHALL die Template-Dateien aus dem Verzeichnis `data/templates/welcome-vault/` lesen, sodass ein Administrator die Inhalte durch Ersetzen der Dateien anpassen kann
2. THE Welcome_Vault SHALL per Feature-Toggle `welcome-vault` (Typ: `hot`, Standard: `true`) aktivierbar/deaktivierbar sein
3. IF der Administrator das Template_Verzeichnis durch eigene Dateien ersetzt, THEN THE Welcome_Vault SHALL die benutzerdefinierten Inhalte für alle danach erstellten Accounts verwenden
4. THE Welcome_Vault SHALL den Vault-Namen über die Server-Konfiguration (`config.welcomeVault.name`, Standard: `"Willkommen"`) konfigurierbar machen
