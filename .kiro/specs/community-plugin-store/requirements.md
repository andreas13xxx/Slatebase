# Requirements Document

## Introduction

Dieses Feature ermöglicht die direkte Installation und Aktualisierung von Obsidian Community Plugins aus dem offiziellen Obsidian Plugin Store innerhalb von Slatebase. Benutzer können den gesamten Community-Plugin-Katalog (~6000 Plugins) durchsuchen und filtern, Plugins direkt installieren und installierte Plugins auf neue Versionen prüfen und aktualisieren. Desktop-only Plugins werden als nicht kompatibel gekennzeichnet. Das Feature integriert sich in die bestehende Plugin-Management-Seite im Settings-Panel und nutzt den existierenden Plugin-Installer für die Installation. Es liegt hinter dem bestehenden Feature-Toggle `obsidian-plugin-compat`.

## Glossary

- **Community_Plugin_List**: Die offizielle Plugin-Liste von `obsidianmd/obsidian-releases/community-plugins.json` auf GitHub (enthält ID, Name, Autor, Beschreibung, Repo-URL pro Plugin)
- **Plugin_Manifest_Remote**: Die `manifest.json` eines Plugins aus dessen GitHub-Repository (enthält Version, minAppVersion, isDesktopOnly)
- **GitHub_Release_Assets**: Die Dateien eines Plugin-Releases auf GitHub (main.js, manifest.json, optional styles.css)
- **Plugin_Store_Cache**: Serverseitiger Cache der Community-Plugin-Liste mit konfigurierbarer TTL
- **Update_Check**: Abruf der Remote-Manifeste für alle installierten Plugins um Versionsunterschiede zu erkennen
- **Desktop_Only_Plugin**: Plugin dessen manifest.json `isDesktopOnly: true` setzt — kann im Browser nicht ausgeführt werden
- **Plugin_Category**: Von Obsidian definierte Kategorie eines Plugins (z.B. "Note organization", "Data visualization")
- **Bulk_Update**: Sequentielle Aktualisierung aller Plugins für die eine neuere Version verfügbar ist

## Requirements

### Requirement 1: Community-Plugin-Liste anzeigen

**User Story:** Als Benutzer möchte ich alle verfügbaren Obsidian Community Plugins in einer durchsuchbaren Liste sehen, damit ich neue Plugins entdecken und installieren kann.

#### Acceptance Criteria

1. WHEN der Benutzer den Tab "Verfügbare Plugins" in der Plugin-Management-Seite öffnet, THE System SHALL die Community-Plugin-Liste vom Backend laden und als scrollbare Liste anzeigen, wobei pro Plugin Name, Autor und Beschreibung sichtbar sind
2. WHEN die Community-Plugin-Liste geladen wird, THE Backend SHALL die Liste von GitHub (`obsidianmd/obsidian-releases/community-plugins.json`) abrufen und serverseitig cachen (TTL: 1 Stunde), sodass nachfolgende Anfragen den Cache nutzen
3. IF ein Plugin in seiner Remote-Manifest-Datei `isDesktopOnly: true` gesetzt hat, THEN THE Frontend SHALL dieses Plugin visuell ausgegraut darstellen mit dem Hinweis "Nur Desktop" und den Installieren-Button deaktivieren
4. WHEN die Plugin-Liste angezeigt wird, THE Frontend SHALL die Gesamtanzahl der verfügbaren Plugins und die Anzahl der gefilterten Ergebnisse anzeigen
5. IF der GitHub-Abruf fehlschlägt (Netzwerkfehler, Rate-Limit), THEN THE Backend SHALL den letzten gültigen Cache-Stand zurückgeben (falls vorhanden) oder einen Fehler mit spezifischer Meldung zurückliefern
6. WHEN die Plugin-Liste zum ersten Mal geladen wird und kein Cache vorhanden ist, THE Frontend SHALL einen Lade-Spinner anzeigen bis die Daten verfügbar sind

### Requirement 2: Plugin-Suche und Filter

**User Story:** Als Benutzer möchte ich die Plugin-Liste nach Name, Beschreibung und Kategorie filtern können, damit ich schnell relevante Plugins finde.

#### Acceptance Criteria

1. WHEN der Benutzer Text in das Suchfeld eingibt, THE Frontend SHALL die Plugin-Liste in Echtzeit (debounced, max 200ms) nach Übereinstimmungen in Name, Autor und Beschreibung filtern (case-insensitive)
2. WHEN Kategorien verfügbar sind, THE Frontend SHALL ein Dropdown/Filter-Element bereitstellen das nach Kategorien filtert, wobei mehrere Kategorien gleichzeitig ausgewählt werden können
3. IF sowohl Textsuche als auch Kategorie-Filter aktiv sind, THEN THE Frontend SHALL nur Plugins anzeigen die BEIDE Kriterien erfüllen (UND-Verknüpfung)
4. WHEN der Benutzer den Filter "Bereits installiert" aktiviert, THE Frontend SHALL nur Plugins anzeigen die im aktuellen Vault installiert sind
5. WHEN der Benutzer den Filter "Kompatibel" aktiviert, THE Frontend SHALL nur Plugins anzeigen die NICHT als `isDesktopOnly` markiert sind
6. WHEN keine Plugins dem Filter entsprechen, THE Frontend SHALL eine leere-Zustands-Meldung anzeigen ("Keine Plugins gefunden") mit der Option die Filter zurückzusetzen

### Requirement 3: Plugin aus dem Store installieren

**User Story:** Als Benutzer möchte ich ein Plugin direkt aus der Plugin-Liste installieren können, ohne manuell ZIP-Dateien herunterladen zu müssen.

#### Acceptance Criteria

1. WHEN der Benutzer den "Installieren"-Button bei einem kompatiblen Plugin klickt, THE Backend SHALL die Release-Assets (main.js, manifest.json, optional styles.css) vom neuesten GitHub-Release des Plugins herunterladen und über den bestehenden Plugin-Installer installieren
2. WHILE ein Plugin installiert wird, THE Frontend SHALL einen Lade-Spinner auf dem betreffenden Plugin-Eintrag anzeigen und den Installieren-Button deaktivieren
3. AFTER eine erfolgreiche Installation, THE Frontend SHALL den Installieren-Button durch "Installiert ✓" ersetzen und den Kompatibilitätsstatus des Plugins anzeigen (full/partial/unsupported/unknown basierend auf der bestehenden CompatibilityAnalyzer-Analyse)
4. IF die Installation fehlschlägt (Download-Fehler, ungültiges Bundle, etc.), THEN THE Frontend SHALL eine Fehlermeldung am Plugin-Eintrag anzeigen mit dem spezifischen Grund
5. WHEN ein bereits installiertes Plugin in der Liste angezeigt wird, THE Frontend SHALL die installierte Version neben dem Plugin-Namen anzeigen und den Installieren-Button durch einen Status-Indikator ersetzen
6. THE Backend SHALL die Plugin-Settings (`data.json`) bei einer Neuinstallation nicht überschreiben wenn bereits Einstellungen existieren (Upgrade-Verhalten des bestehenden Installers)

### Requirement 4: Nach Updates suchen

**User Story:** Als Benutzer möchte ich prüfen können ob für meine installierten Plugins neue Versionen verfügbar sind, damit ich meine Plugins aktuell halten kann.

#### Acceptance Criteria

1. WHEN der Benutzer den Button "Nach Updates suchen" klickt, THE Backend SHALL für jedes installierte Plugin die Remote-manifest.json von GitHub abrufen und die Versionen vergleichen
2. AFTER der Update-Check abgeschlossen ist, THE Frontend SHALL die Anzahl der verfügbaren Updates prominent anzeigen (z.B. "3 Updates verfügbar")
3. FOR EACH Plugin mit verfügbarem Update, THE Frontend SHALL die installierte Version und die neueste Version nebeneinander anzeigen (z.B. "1.2.0 → 1.3.1")
4. IF kein Update verfügbar ist, THEN THE Frontend SHALL die Meldung "Alle Plugins sind aktuell" anzeigen
5. WHILE der Update-Check läuft, THE Frontend SHALL einen Lade-Spinner beim Button anzeigen und den Button deaktivieren
6. IF der Update-Check für einzelne Plugins fehlschlägt (Repo gelöscht, Rate-Limit), THEN THE Backend SHALL diese Plugins überspringen und für die übrigen das Ergebnis zurückliefern, mit einer Warnung die die fehlgeschlagenen Plugins benennt
7. THE Backend SHALL die Update-Check-Ergebnisse für 15 Minuten cachen, sodass wiederholtes Klicken innerhalb des Zeitraums den Cache nutzt

### Requirement 5: Automatischer periodischer Update-Check

**User Story:** Als Benutzer möchte ich automatisch über verfügbare Plugin-Updates benachrichtigt werden, ohne manuell danach suchen zu müssen.

#### Acceptance Criteria

1. WHEN der Benutzer authentifiziert ist und mindestens ein Plugin installiert hat, THE Backend SHALL alle 24 Stunden automatisch einen Update-Check für alle installierten Plugins aller Vaults durchführen
2. IF Updates verfügbar sind, THEN THE Frontend SHALL bei Seitenöffnung einen dezenten Hinweis anzeigen (z.B. Badge an der Plugin-Sektion im Settings-Panel oder Toast-Notification)
3. THE Backend SHALL den automatischen Check nur einmal pro 24h-Fenster durchführen, unabhängig wie oft der Server neugestartet wird (Timestamp persisten in `data/plugin-store/last-update-check.json`)
4. IF der Benutzer die Plugin-Management-Seite öffnet und ein automatischer Check seit >24h nicht stattgefunden hat, THEN THE Backend SHALL den Check auslösen und das Ergebnis anzeigen

### Requirement 6: Einzelnes Plugin aktualisieren

**User Story:** Als Benutzer möchte ich ein einzelnes Plugin auf die neueste Version aktualisieren können, wobei meine Einstellungen erhalten bleiben.

#### Acceptance Criteria

1. WHEN ein Plugin ein verfügbares Update hat, THE Frontend SHALL einen "Aktualisieren"-Button bei dem Plugin anzeigen
2. WHEN der Benutzer den "Aktualisieren"-Button klickt, THE Backend SHALL die Release-Assets der neuen Version herunterladen und über den bestehenden Installer als Upgrade installieren (data.json bleibt erhalten)
3. WHILE das Update läuft, THE Frontend SHALL einen Lade-Spinner beim Plugin anzeigen
4. AFTER einem erfolgreichen Update, THE Frontend SHALL die angezeigte Version aktualisieren und den Update-Button entfernen
5. IF das Update fehlschlägt, THEN THE Frontend SHALL eine Fehlermeldung anzeigen und die alte Version beibehalten (kein teilweiser Zustand)
6. THE Backend SHALL Release-Notes-URLs (GitHub Release URL) zu verfügbaren Updates bereitstellen, sodass das Frontend einen Link "Release Notes" anzeigen kann

### Requirement 7: Alle Plugins aktualisieren (Bulk-Update)

**User Story:** Als Benutzer möchte ich alle aktualisierbaren Plugins mit einem Klick aktualisieren können, damit ich nicht jedes Plugin einzeln updaten muss.

#### Acceptance Criteria

1. WHEN mindestens ein Plugin-Update verfügbar ist, THE Frontend SHALL einen Button "Alle aktualisieren" anzeigen
2. WHEN der Benutzer "Alle aktualisieren" klickt, THE Backend SHALL die Plugins sequentiell aktualisieren (nicht parallel, um Rate-Limits zu vermeiden)
3. WHILE das Bulk-Update läuft, THE Frontend SHALL einen Spinner anzeigen der den Fortschritt andeutet
4. IF einzelne Plugins beim Bulk-Update fehlschlagen, THEN THE Backend SHALL die übrigen Plugins weiter aktualisieren und am Ende eine Zusammenfassung zurückliefern (Erfolge + Fehler)
5. AFTER dem Bulk-Update, THE Frontend SHALL eine Zusammenfassung anzeigen ("5 aktualisiert, 1 fehlgeschlagen: [Plugin-Name]: [Grund]")

### Requirement 8: Settings-Panel-Anpassung

**User Story:** Als Benutzer möchte ich den Plugin-Store komfortabel in der bestehenden Settings-Oberfläche nutzen können, ohne dass die Darstellung zu eng ist.

#### Acceptance Criteria

1. WHEN die Plugin-Management-Seite im Settings-Panel aktiv ist, THE Frontend SHALL die `max-width`-Beschränkung des Content-Bereichs aufheben, sodass die volle verfügbare Breite genutzt wird
2. THE Frontend SHALL die Plugin-Management-Seite in zwei Tabs unterteilen: "Installierte Plugins" (bestehende Ansicht) und "Verfügbare Plugins" (Store-Browser)
3. WHEN der Tab "Verfügbare Plugins" aktiv ist, THE Frontend SHALL das Suchfeld, Kategorie-Filter und die Plugin-Liste in einem optimierten Layout anzeigen das auch bei breiten Bildschirmen gut lesbar bleibt (Plugin-Cards oder kompakte Liste)

### Requirement 9: Sicherheit und Rate-Limiting

**User Story:** Als Administrator möchte ich sicherstellen, dass die GitHub-API-Zugriffe des Plugin-Stores kontrolliert und sicher ablaufen.

#### Acceptance Criteria

1. THE Backend SHALL alle GitHub-API-Zugriffe über einen zentralen Service routen der Rate-Limits respektiert (max 50 Requests/Stunde unauthentifiziert, oder höher mit konfiguriertem GitHub-Token)
2. IF ein GitHub Personal Access Token in der Konfiguration hinterlegt ist (`SLATEBASE_GITHUB_TOKEN`), THEN THE Backend SHALL diesen für API-Zugriffe verwenden um das Rate-Limit auf 5000 req/h zu erhöhen
3. THE Backend SHALL Download-Größen limitieren: Einzelne Release-Assets dürfen maximal 10 MB groß sein, Gesamtgröße eines Plugin-Downloads maximal 15 MB
4. THE Backend SHALL SSRF-Schutz anwenden: Downloads nur von `github.com` und `raw.githubusercontent.com` Domains erlauben
5. THE Backend SHALL keine sensiblen Informationen (GitHub-Token, interne Pfade) in API-Responses an das Frontend zurückgeben
