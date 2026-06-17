# Requirements Document

## Introduction

Das Feature „Unified Settings" konsolidiert alle verstreuten Einstellungsseiten (Profil, Sitzungen, Passwort, Sync-Konfiguration, Plugin-Verwaltung, Admin-Konfiguration, Feature-Toggles, Benutzerverwaltung) in ein einziges, kohärentes Settings-Panel mit kategorisierter Navigation. Ziel ist eine einheitliche, übersichtliche Benutzeroberfläche für reguläre Benutzer und Administratoren.

## Glossary

- **Settings_Panel**: Die zentrale UI-Komponente, die alle Einstellungen in einer Seitenleisten-Navigation mit Inhaltsbereichen darstellt
- **Settings_Category**: Eine Gruppierung verwandter Einstellungen (z. B. „Konto", „Vault", „Administration")
- **Settings_Section**: Ein einzelner Inhaltsbereich innerhalb einer Kategorie (z. B. „Profil" innerhalb „Konto")
- **Settings_Router**: Die Navigationslogik, die zwischen Kategorien und Sektionen umschaltet
- **Benutzer**: Ein authentifizierter Slatebase-Nutzer mit Standard-Rolle
- **Administrator**: Ein Benutzer mit Admin-Rolle und Zugriff auf erweiterte Einstellungen
- **Vault_Kontext**: Der aktuell ausgewählte Vault, der den Kontext für vault-spezifische Einstellungen bestimmt

## Requirements

### Requirement 1: Settings-Panel-Struktur

**User Story:** Als Benutzer möchte ich alle meine Einstellungen an einem zentralen Ort finden, damit ich nicht zwischen verschiedenen Seiten navigieren muss.

#### Acceptance Criteria

1. WHEN der Benutzer die Einstellungen öffnet, THE Settings_Panel SHALL eine Seitenleisten-Navigation mit Kategorien und einen Inhaltsbereich anzeigen
2. THE Settings_Panel SHALL die folgenden Kategorien in fester Reihenfolge für alle Benutzer anzeigen: „Konto", „Vault"
3. WHILE der Benutzer die Rolle Administrator besitzt, THE Settings_Panel SHALL zusätzlich die Kategorie „Administration" als letzten Eintrag nach „Vault" anzeigen
4. WHEN eine Kategorie in der Seitenleiste ausgewählt wird, THE Settings_Panel SHALL die zugehörigen Sektionen in der Seitenleiste als Untereinträge anzeigen und zuvor angezeigte Sektionen einer anderen Kategorie ausblenden
5. WHEN eine Sektion ausgewählt wird, THE Settings_Panel SHALL den entsprechenden Inhaltsbereich rechts neben der Navigation laden
6. IF kein gespeicherter Navigationsstand existiert, THEN THE Settings_Panel SHALL die erste Kategorie („Konto") und deren erste Sektion („Profil") als Standardauswahl anzeigen

### Requirement 2: Konto-Kategorie

**User Story:** Als Benutzer möchte ich meine persönlichen Kontoeinstellungen (Profil, Passwort, Sitzungen, MCP-Tokens) in einer Kategorie zusammengefasst sehen, damit ich meinen Account zentral verwalten kann.

#### Acceptance Criteria

1. THE Settings_Panel SHALL in der Kategorie „Konto" die Sektionen „Profil", „Passwort ändern", „Sitzungen", „MCP-Tokens" und „Konto löschen" in dieser Reihenfolge enthalten
2. WHEN die Sektion „Profil" aktiv ist, THE Settings_Panel SHALL die bestehenden Profilfelder (Anzeigename, E-Mail, Avatar-URL, bevorzugte Sprache, Farbschema) im Inhaltsbereich darstellen
3. WHEN die Sektion „Passwort ändern" aktiv ist, THE Settings_Panel SHALL das Formular zur Passwortänderung (aktuelles Passwort, neues Passwort mit Mindestlänge 8 Zeichen) im Inhaltsbereich darstellen
4. WHEN die Sektion „Sitzungen" aktiv ist, THE Settings_Panel SHALL die bestehende Sitzungsverwaltung (Liste aktiver Sitzungen mit IP, User-Agent und Zeitstempel; Einzelsitzung-Beenden; Alle-anderen-Beenden-Aktion) im Inhaltsbereich darstellen
5. WHEN die Sektion „MCP-Tokens" aktiv ist, THE Settings_Panel SHALL die bestehende Token-Verwaltung (Erstellen, Widerrufen, Auflisten von API-Tokens) im Inhaltsbereich darstellen
6. WHEN die Kategorie „Konto" erstmals ausgewählt wird und kein gespeicherter Navigationsstand existiert, THE Settings_Panel SHALL die Sektion „Profil" als Standard-Sektion aktivieren
7. WHEN die Sektion „Konto löschen" aktiv ist, THE Settings_Panel SHALL das bestehende Formular zur unwiderruflichen Account-Löschung (Passwortbestätigung, zweistufige Bestätigung) im Inhaltsbereich darstellen

### Requirement 3: Vault-Kategorie

**User Story:** Als Benutzer möchte ich vault-spezifische Einstellungen (Sync, Plugins) kontextbezogen konfigurieren, damit ich pro Vault individuelle Einstellungen vornehmen kann.

#### Acceptance Criteria

1. THE Settings_Panel SHALL in der Kategorie „Vault" die Sektionen „Synchronisation" und „Plugins" enthalten
2. THE Settings_Panel SHALL in der Vault-Kategorie ein Vault-Auswahlfeld anzeigen, das alle Vaults auflistet, deren Besitzer der aktuelle Benutzer ist
3. WHILE kein Vault ausgewählt ist, THE Settings_Panel SHALL in der Vault-Kategorie einen Hinweis anzeigen, dass ein Vault ausgewählt werden muss, und die Sektionen „Synchronisation" und „Plugins" als nicht-interaktiv (deaktiviert) darstellen
4. WHILE ein Vault ausgewählt ist, THE Settings_Panel SHALL den Vault-Namen als Kontextanzeige oberhalb der Vault-Sektionen darstellen und die Sektionen als interaktiv (aktiviert) darstellen
5. WHILE ein Vault ausgewählt ist, WHEN die Sektion „Synchronisation" aktiviert wird, THE Settings_Panel SHALL die bestehende Sync-Konfiguration für den gewählten Vault im Inhaltsbereich darstellen
6. WHILE ein Vault ausgewählt ist, WHEN die Sektion „Plugins" aktiviert wird, THE Settings_Panel SHALL die bestehende Plugin-Verwaltung für den gewählten Vault im Inhaltsbereich darstellen
7. WHEN der Benutzer einen anderen Vault im Auswahlfeld wählt, THE Settings_Panel SHALL den Inhaltsbereich der aktiven Sektion mit den Daten des neu gewählten Vaults aktualisieren

### Requirement 4: Administrations-Kategorie

**User Story:** Als Administrator möchte ich alle administrativen Einstellungen (Serverkonfiguration, Benutzerverwaltung, Feature-Toggles) in einer dedizierten Kategorie finden, damit ich das System effizient verwalten kann.

#### Acceptance Criteria

1. WHILE der Benutzer die Rolle Administrator besitzt, THE Settings_Panel SHALL in der Kategorie „Administration" die Sektionen „Serverkonfiguration", „Benutzerverwaltung", „Vault-Verwaltung" und „Feature-Toggles" in dieser Reihenfolge enthalten
2. WHILE der Benutzer KEINE Admin-Rolle besitzt, THE Settings_Panel SHALL die Kategorie „Administration" nicht anzeigen und keinen Navigationseintrag dafür rendern
3. WHEN die Sektion „Serverkonfiguration" aktiv ist, THE Settings_Panel SHALL die bestehende Server-Konfiguration (Ports, Host, Limits) im Inhaltsbereich darstellen
4. WHEN die Sektion „Benutzerverwaltung" aktiv ist, THE Settings_Panel SHALL die bestehende Benutzerübersicht mit Anlegen/Bearbeiten/Sperren im Inhaltsbereich darstellen
5. WHEN die Sektion „Vault-Verwaltung" aktiv ist, THE Settings_Panel SHALL die admin-seitige Vault-Übersicht (alle Vaults, Löschoptionen) im Inhaltsbereich darstellen
6. WHEN die Sektion „Feature-Toggles" aktiv ist, THE Settings_Panel SHALL die bestehende Feature-Toggle-Verwaltung im Inhaltsbereich darstellen
7. IF die Admin-Rolle des Benutzers entzogen wird während die Kategorie „Administration" aktiv ist, THEN THE Settings_Panel SHALL automatisch zur ersten verfügbaren Kategorie navigieren und die Administrations-Kategorie aus der Navigation entfernen
8. IF ein Benutzer ohne Admin-Rolle über einen Deep-Link eine Administrations-Sektion aufruft, THEN THE Settings_Panel SHALL die Navigation zur ersten verfügbaren Kategorie umleiten und die Administrations-Sektion nicht laden

### Requirement 5: Navigation und URL-Persistenz

**User Story:** Als Benutzer möchte ich Einstellungsseiten per Tastaturkürzel erreichen und meinen Navigationsstand beibehalten, damit die Bedienung effizient bleibt.

#### Acceptance Criteria

1. THE Settings_Panel SHALL den zuletzt aktiven Navigationsstand (Kategorie + Sektion) in `sessionStorage` unter dem Schlüssel `slatebase-settings-nav` persistieren
2. WHEN das Settings_Panel erneut geöffnet wird, THE Settings_Router SHALL den zuvor gespeicherten Navigationsstand aus `sessionStorage` wiederherstellen
3. IF der gespeicherte Navigationsstand ungültig ist (z. B. gelöschte Kategorie oder fehlende Admin-Rolle), THEN THE Settings_Router SHALL auf die Standard-Auswahl („Konto" → „Profil") zurückfallen
4. WHEN der Benutzer die Tastenkombination Ctrl+Komma betätigt, THE Settings_Panel SHALL geöffnet oder in den Vordergrund gebracht werden
5. WHEN der Benutzer eine Sektion über einen programmatischen Navigationsaufruf mit Kategorie- und Sektionskennung öffnet, THE Settings_Router SHALL direkt zur entsprechenden Sektion navigieren

### Requirement 6: Responsives Layout

**User Story:** Als Benutzer möchte ich das Settings-Panel auf verschiedenen Bildschirmbreiten komfortabel nutzen, damit die Einstellungen auch bei reduziertem Platz bedienbar bleiben.

#### Acceptance Criteria

1. WHILE die Panelbreite mindestens 700px beträgt, THE Settings_Panel SHALL die Seitenleisten-Navigation links neben dem Inhaltsbereich als dauerhaft sichtbare vertikale Liste anzeigen
2. WHILE die Panelbreite unter 700px liegt, THE Settings_Panel SHALL die Navigation als einklappbares Menü oberhalb des Inhaltsbereichs darstellen, das standardmäßig eingeklappt ist und über einen Toggle-Button mit sichtbarem Label oder Icon ein- und ausgeklappt werden kann
3. WHEN der Benutzer im eingeklappten Navigationsmenü einen Bereich auswählt, THE Settings_Panel SHALL das Menü automatisch einklappen und den gewählten Inhaltsbereich anzeigen
4. THE Settings_Panel SHALL ausschließlich CSS Custom Properties aus `index.css` für Farben, Abstände, Schriftgrößen und Schatten verwenden und keine hartcodierten Farbwerte enthalten
5. THE Settings_Panel SHALL im Dark Mode alle Text- und Hintergrundelemente über die in `:root[data-theme="dark"]` und `@media (prefers-color-scheme: dark)` definierten Token-Werte darstellen, sodass kein Element unsichtbar wird oder den Light-Mode-Wert behält
6. WHEN die Panelbreite den Schwellenwert von 700px über- oder unterschreitet, THE Settings_Panel SHALL den aktuell ausgewählten Navigationsbereich beibehalten und nur das Layout der Navigation ändern

### Requirement 7: Integration bestehender Komponenten

**User Story:** Als Entwickler möchte ich die bestehenden Einstellungskomponenten (ProfilePage, SessionsPage, AdminConfigPage, etc.) innerhalb des neuen Panels wiederverwenden, damit keine doppelte Logik entsteht.

#### Acceptance Criteria

1. THE Settings_Panel SHALL die bestehenden Einstellungskomponenten (ProfilePage, SessionsPage, AdminConfigPage, SyncConfigPage, PluginManagementPage) als Inhalte der jeweiligen Sektionen einbetten, ohne deren State-Management, API-Aufrufe oder Validierungslogik neu zu implementieren
2. THE Settings_Panel SHALL jeder eingebetteten Einstellungskomponente die Singleton-ApiClient-Instanz als Prop übergeben
3. IF eine bestehende Komponente einen Fehler anzeigt, THEN THE Settings_Panel SHALL die Fehlerdarstellung innerhalb des Inhaltsbereichs der aktiven Sektion darstellen, ohne andere Sektionen zu beeinflussen
4. THE Settings_Panel SHALL die eingebetteten Komponenten ohne deren seiteneigene Layout-Container (Seitentitel, äußere Wrapper-Elemente) rendern, sodass nur der Formular-Inhalt im Inhaltsbereich erscheint
5. WHILE die bestehenden Einstellungskomponenten im Settings_Panel eingebettet sind, THE Settings_Panel SHALL die bisherigen separaten Routen weiterhin funktionsfähig halten und diese mit einem internen Deprecated-Marker versehen

### Requirement 8: Barrierefreiheit

**User Story:** Als Benutzer mit Screenreader möchte ich das Settings-Panel per Tastatur bedienen und die Struktur akustisch erfassen, damit die Einstellungen für alle zugänglich sind.

#### Acceptance Criteria

1. THE Settings_Panel SHALL ARIA-Landmark-Rollen verwenden: `role="navigation"` für die Seitenleiste und `role="main"` für den Inhaltsbereich, wobei die Navigationseinträge als geordnete Liste (`<ul>`/`<li>` oder entsprechende ARIA-Rollen) strukturiert sein SHALL
2. THE Settings_Panel SHALL die Tastaturbedienung der Navigation wie folgt ermöglichen: Tab wechselt den Fokus zwischen Seitenleisten-Navigation und Inhaltsbereich, Pfeiltasten (Oben/Unten) bewegen den Fokus zwischen Navigationseinträgen innerhalb der Seitenleiste, und Enter aktiviert den fokussierten Navigationseintrag
3. WHEN eine Sektion gewechselt wird, THE Settings_Panel SHALL den Fokus auf die Überschrift (Heading-Element, `h2`) des neuen Inhaltsbereichs setzen, wobei die Überschrift programmatisch fokussierbar sein SHALL (tabindex="-1")
4. THE Settings_Panel SHALL `aria-current="page"` auf dem aktiven Navigationseintrag setzen und von allen inaktiven Navigationseinträgen entfernen

### Requirement 9: Einstellungssuche

**User Story:** Als Benutzer möchte ich innerhalb der Einstellungen nach bestimmten Optionen suchen, damit ich schnell zur gewünschten Einstellung navigieren kann.

#### Acceptance Criteria

1. THE Settings_Panel SHALL ein Suchfeld oberhalb der Kategorieliste in der Seitenleiste anzeigen
2. WHEN der Benutzer mindestens 1 Zeichen in das Suchfeld eingibt, THE Settings_Panel SHALL nach einer Verzögerung von 150ms die Sektionsliste auf Einträge filtern, deren Sektions-Label den Suchbegriff als Teilstring enthält (case-insensitiv), und die Treffer unter ihren jeweiligen Kategorie-Überschriften gruppiert anzeigen
3. WHEN der Suchbegriff keine Treffer liefert, THE Settings_Panel SHALL anstelle der Sektionsliste eine „Keine Ergebnisse"-Meldung in der Seitenleiste anzeigen
4. WHEN der Benutzer das Suchfeld leert, THE Settings_Panel SHALL die vollständige Kategorie-/Sektionsstruktur wiederherstellen
5. WHEN der Benutzer einen gefilterten Eintrag in der Seitenleiste auswählt, THE Settings_Panel SHALL zur entsprechenden Sektion navigieren und den Suchbegriff im Suchfeld beibehalten
