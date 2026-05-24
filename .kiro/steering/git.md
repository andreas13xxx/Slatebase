# Slatebase — Git & GitHub Konventionen

## Vor jedem Commit

**WICHTIG:** Vor dem Erstellen eines Commits MUSS der Nutzer aufgefordert werden, Autor und E-Mail-Adresse zu prüfen:

1. Aktuelle Git-Identität anzeigen: `git config user.name` und `git config user.email`
2. Den Nutzer fragen, ob diese Angaben korrekt sind
3. Erst nach Bestätigung den Commit erstellen

Falls der Nutzer die Identität ändern möchte, die gewünschten Werte setzen:
```bash
git config user.name "Gewünschter Name"
git config user.email "gewuenschte@email.de"
```

Außerdem vor dem Commit prüfen, ob alle Dateien, die nicht in ein Commit gehören ausgeschlossen sind und es entsprechende Regeln in .gitignore gibt.

## Branching

- Niemals direkt auf `main` pushen
- Feature-Branches: `feature/<kurze-beschreibung>`
- Bugfix-Branches: `fix/<kurze-beschreibung>`
- Beim Push: `git push -u origin <branch>` für Remote-Tracking

## Commits

- Commit-Messages auf Deutsch mit Typ-Prefix: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`
- Kurzer Titel (max. 70 Zeichen), optionaler Body nach Leerzeile
- Nach jedem abgeschlossenen logischen Schritt committen, nicht erst am Session-Ende
- Spezifische Dateien stagen (`git add <datei>`) statt `git add .`
- Keine Secrets committen (`.env`, Credentials, Tokens)
- Keine generierten Dateien committen (`dist/`, `node_modules/`)
- Bei neuen Tools/Dependencies prüfen ob `.gitignore`-Einträge fehlen

## Pull Requests

- PR-Titel: kurz und prägnant (max. 70 Zeichen)
- PR-Beschreibung: Zusammenfassung der Änderungen, was getestet wurde
- CLI: `gh pr create` für GitHub PRs

## Sicherheit

- Keine Force-Pushes ohne explizite Nutzer-Erlaubnis
- Kein `git reset --hard` oder `git clean -f` ohne Bestätigung
- Kein `--no-verify` — Git-Hooks respektieren
- Keine interaktiven Git-Befehle (`-i` Flags)
