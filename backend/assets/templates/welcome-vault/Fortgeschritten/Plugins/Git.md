---
tags: [fortgeschritten, plugins]
---

# Git Plugin

Das Git-Plugin (obsidian-git) versioniert deinen Vault mit einem echten Git-Repository — Commits, Push/Pull zu einem Remote (z.B. GitHub) und ein Source-Control-Panel direkt in Slatebase. Anders als der eingebaute [[Features/Papierkorb und Versionen|Papierkorb]] arbeitet es mit vollständiger Git-Historie und externen Remotes.

> [!warning] Kein Live-Demo möglich
> Git braucht ein echtes Remote-Repository mit Zugangsdaten. Dieses Kapitel zeigt Einrichtung und Bedienung, aber es gibt keine eingebettete Live-Demo wie bei anderen Plugins — probiere es mit einem eigenen Test-Repository aus.

---

## Voraussetzungen

- Feature-Toggle `obsidian-plugin-compat` aktiviert
- Git-Plugin installiert und aktiviert
- Plugin-ZIP von GitHub: `obsidian-git`
- Ein Remote-Repository (z.B. auf GitHub) mit HTTPS-Zugriff
- Personal Access Token (PAT) des Remote-Anbieters

---

## Installation

1. Plugin-ZIP von GitHub herunterladen
2. Einstellungen → Vault → Plugins → "Plugin installieren"
3. ZIP hochladen → Aktivieren

---

## Einrichtung

Im Browser gibt es kein SSH-Schlüsselpaar und keinen lokalen Git-Client — das Plugin nutzt eine reine JavaScript-Git-Implementierung (isomorphic-git) und spricht Remotes ausschließlich über **HTTPS** an.

1. Plugin-Einstellungen öffnen
2. Remote-URL eintragen (HTTPS-Form, z.B. `https://github.com/nutzername/repo.git`)
3. Benutzername und Personal Access Token eintragen (kein Passwort — die meisten Anbieter verlangen für HTTPS-Zugriffe ein PAT mit `repo`-Scope)
4. "Verbindung testen" bzw. ersten Pull/Push auslösen

> [!tip] Token statt Passwort
> GitHub, GitLab und die meisten anderen Anbieter akzeptieren bei HTTPS-Zugriff kein Konto-Passwort mehr, sondern nur ein Personal Access Token. Erstelle eines in den Sicherheitseinstellungen deines Git-Anbieters mit möglichst engem Scope.

---

## Source-Control-Panel

Nach Aktivierung erscheint eine neue Ansicht ("Git: Open Source Control View"):

| Bereich | Beschreibung |
|---------|--------------|
| Geänderte Dateien | Liste aller Dateien mit Status (neu, geändert, gelöscht) |
| Commit-Nachricht | Eingabefeld, unterstützt Platzhalter wie `{{date}}` |
| Stage/Unstage | Einzelne Dateien vor dem Commit aus- oder abwählen |
| Diff-Ansicht | Zeilenweise Änderungen pro Datei |

---

## Wichtige Befehle

Über die Command Palette (`Ctrl+P` → "Git:"):

| Befehl | Beschreibung |
|--------|--------------|
| Commit all changes | Alle Änderungen committen |
| Push | Commits zum Remote hochladen |
| Pull | Änderungen vom Remote holen |
| Create backup | Commit + Push in einem Schritt |
| Discard all changes | Lokale Änderungen verwerfen (Vorsicht!) |
| Edit .gitignore | Ausschlussliste bearbeiten |

---

## Automatisches Backup

In den Plugin-Einstellungen lässt sich ein Intervall konfigurieren, nach dem automatisch committet (und optional gepusht) wird — praktisch als laufendes Backup im Hintergrund, ohne manuell "Commit" auszulösen.

```
Auto-Backup-Intervall: 15 Minuten
Auto-Pull-Intervall: 10 Minuten
```

> [!warning] Konflikte bei gleichzeitiger Bearbeitung
> Arbeitest du von mehreren Geräten am selben Vault, kann es bei Auto-Push zu Merge-Konflikten kommen. Git-Konflikte lassen sich im Browser nur eingeschränkt visuell auflösen — im Zweifel manuell im Dateiinhalt bereinigen.

---

## Beispiel: Commit-Nachrichten-Vorlage

```
Vault-Backup: {{date}} ({{numFiles}} Dateien)
```

Ergibt z.B.: `Vault-Backup: 2026-08-14 (3 Dateien)`

---

## Einschränkungen in Slatebase

| Feature | Status |
|---------|--------|
| Commit, Push, Pull über HTTPS + PAT | Funktioniert |
| Source-Control-Panel (Diff, Stage/Unstage) | Funktioniert |
| Automatisches Backup-Intervall | Funktioniert |
| Binärdateien (Bilder, PDFs) im Commit | Funktioniert |
| SSH-Remotes | Nicht unterstützt (kein SSH im Browser) |
| GPG-signierte Commits | Nicht unterstützt |
| Git-Submodule | Nicht unterstützt |
| Merge-Konflikt-UI | Eingeschränkt |

---

## Fehlerbehebung

| Problem | Lösung |
|---------|--------|
| "Authentication failed" | PAT statt Passwort verwenden, Scope prüfen |
| Push schlägt fehl (non-fast-forward) | Vorher "Pull" ausführen |
| Große Binärdateien sehr langsam | isomorphic-git arbeitet vollständig im Browser — bei sehr großen Vaults dauert Push/Pull entsprechend länger |
| CORS-/Netzwerkfehler | Domain des Git-Hosts muss auf der Proxy-Allowlist stehen (Admin) |

---

> [!tip] Git ergänzt, ersetzt aber nicht
> Der eingebaute [[Features/Papierkorb und Versionen|Papierkorb]] deckt versehentliches Löschen ab. Git eignet sich zusätzlich für externe Backups, Zusammenarbeit über Pull Requests oder das Synchronisieren mit einem bestehenden Obsidian-Vault-Repository.

> [!todo] Übung
> 1. Erstelle ein leeres HTTPS-Repository bei einem Git-Anbieter deiner Wahl
> 2. Erstelle ein Personal Access Token mit Schreibzugriff
> 3. Installiere und aktiviere das Git-Plugin, trage Remote-URL, Benutzername und Token ein
> 4. Ändere eine Notiz und führe "Commit all changes" aus
> 5. Führe "Push" aus und prüfe den Commit beim Anbieter
> 6. Konfiguriere ein Auto-Backup-Intervall von 15 Minuten

---

## Verwandte Features

- [[Features/Papierkorb und Versionen]] — Eingebaute Versionierung ohne externes Repository
- [[Fortgeschritten/Plugins/LiveSync]] — Alternative: Echtzeit-Sync über CouchDB
- [[Fortgeschritten/Obsidian Plugins]] — Plugin-Grundlagen
- [[Admin/Feature-Toggles]] — Plugin-Feature aktivieren
