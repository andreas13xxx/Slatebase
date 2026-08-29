---
tags: [features]
---

# Git-Sync

Git-Sync hält einen Vault serverseitig mit einem oder mehreren Git-Remotes synchron — mit dem echten `git`-Programm, nicht mit einer Browser-Nachbildung. Das läuft headless im Hintergrund, auch ohne geöffneten Browser-Tab, und unterstützt sowohl HTTPS-Tokens als auch SSH-Schlüssel.

> [!tip] Unterschied zum Git-Plugin
> Slatebase kann zusätzlich das Community-Plugin [[Fortgeschritten/Plugins/Git|obsidian-git]] im Browser ausführen. Git-Sync ist die native Alternative dazu: sie läuft auf dem Server statt im Browser, braucht keinen CORS-Proxy für den Remote-Host und unterstützt auch SSH-Remotes — dafür ohne eigenes Source-Control-Panel mit Diff-Ansicht.

---

## Voraussetzungen

- Feature-Toggle `git-sync` aktiviert (siehe [[Admin/Feature-Toggles]]; standardmäßig an)
- Ein Vault ist ausgewählt
- Ein Git-Remote-Repository (z.B. auf GitHub, GitLab oder selbst gehostet)
- Zugangsdaten: ein Personal Access Token (HTTPS) oder ein privater SSH-Schlüssel

---

## Git-Sync öffnen

1. Öffne die Einstellungen (`Ctrl+,`)
2. Navigiere zu **Vault → Git-Synchronisation**

Ist das Feature serverweit deaktiviert, erscheint der Eintrag ausgegraut mit einem Hinweis, dich an einen Administrator zu wenden.

---

## Branch festlegen

Alle Remotes eines Vaults teilen sich denselben lokalen Branch, da ein Arbeitsverzeichnis nur auf einem Branch gleichzeitig stehen kann. Trage im Abschnitt **Branch** den gewünschten Branch-Namen ein (Standard: `main`) und speichere.

---

## Einen Remote hinzufügen

1. Klicke auf **Remote hinzufügen**
2. Vergib einen Namen (frei wählbar, z.B. "GitHub")
3. Trage die Remote-URL ein (z.B. `https://github.com/nutzername/repo.git`)
4. Wähle die Auth-Methode:
   - **HTTPS-Token** — Personal Access Token deines Git-Anbieters
   - **SSH-Schlüssel** — privater Schlüssel im PEM-Format
5. Lege das Sync-Intervall in Minuten fest
6. Speichern

> [!tip] Token statt Passwort
> GitHub, GitLab und die meisten anderen Anbieter akzeptieren bei HTTPS kein Konto-Passwort mehr, sondern nur ein Personal Access Token mit `repo`-Scope. Erstelle eines in den Sicherheitseinstellungen deines Git-Anbieters.

Token und SSH-Schlüssel werden verschlüsselt gespeichert und nie im Klartext an den Browser zurückgegeben — auch beim Bearbeiten eines Remotes bleibt das Feld leer, bis du ein neues Credential einträgst.

---

## Synchronisieren

| Aktion | Beschreibung |
|--------|--------------|
| Automatisch | Läuft im Hintergrund gemäß dem konfigurierten Intervall pro Remote |
| **Jetzt synchronisieren** | Löst sofort einen Sync-Lauf für diesen Remote aus |
| Schalter am Remote | Aktiviert/deaktiviert den automatischen Sync für diesen Remote |

Jeder Lauf committet zunächst lokale Änderungen, holt dann den Remote-Stand, führt einen Merge durch und pusht das Ergebnis. Der Status-Badge zeigt das Ergebnis des letzten Laufs: **Erfolgreich**, **Fehler** oder **Konflikt**.

---

## Konflikte lösen

Anders als ein klassisches Merge-Tool bricht Git-Sync bei einem Konflikt nichts ab: Die betroffene Datei enthält danach normale Git-Konfliktmarker (`<<<<<<<`, `=======`, `>>>>>>>`) und lässt sich direkt im Markdown-Editor bearbeiten.

1. Öffne die im Konflikt-Hinweis genannte Datei
2. Entferne die Konfliktmarker und entscheide dich für den gewünschten Inhalt
3. Speichere die Datei
4. Der nächste Sync-Lauf (automatisch oder per "Jetzt synchronisieren") committet die Auflösung und synchronisiert normal weiter

---

## Praktisches Beispiel

1. Erstelle ein leeres Repository bei einem Git-Anbieter deiner Wahl
2. Erstelle ein Personal Access Token mit Schreibzugriff
3. Öffne Einstellungen → Vault → Git-Synchronisation → **Remote hinzufügen**
4. Trage Name, Remote-URL, Auth-Methode "HTTPS-Token" und das Token ein, Intervall z.B. 15 Minuten
5. Klicke **Jetzt synchronisieren**
6. Prüfe beim Git-Anbieter, dass der Vault-Inhalt als Commit angekommen ist

---

> [!todo] Übung
> Richte einen Remote mit einem eigenen Test-Repository ein, löse einen manuellen Sync aus und ändere anschließend dieselbe Notiz sowohl lokal als auch direkt beim Git-Anbieter, um einen Konflikt zu provozieren. Löse ihn danach im Editor auf.

---

## Verwandte Features

- [[Fortgeschritten/Plugins/Git]] — Browserbasierte Alternative über das Community-Plugin
- [[Features/Papierkorb und Versionen]] — Eingebaute Versionierung ohne externes Repository
- [[Features/Mail-Import]] — Ein weiteres serverseitiges Feature mit ähnlichem Aufbau
- [[Admin/Feature-Toggles]] — Feature serverweit aktivieren/deaktivieren
