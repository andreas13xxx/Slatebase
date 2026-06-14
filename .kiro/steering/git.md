# Slatebase — Git-Konventionen

## Vor jedem Commit

1. `git config user.name` und `git config user.email` anzeigen
2. Nutzer fragen ob korrekt — erst nach Bestätigung committen
3. Prüfen ob nicht-relevante Dateien ausgeschlossen sind (`.gitignore`)

## Vor jedem Push

1. `git status` — auf ungestagte Änderungen prüfen
2. Falls vorhanden: Nutzer darauf hinweisen, fragen ob committen oder bewusst zurücklassen
3. Erst nach Bestätigung pushen

## Branching

- Nie direkt auf `main` pushen
- `feature/<beschreibung>` oder `fix/<beschreibung>`
- `git push -u origin <branch>` für Tracking

## Commits

- Englisch, Conventional Commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`
- Max 70 Zeichen Titel, optionaler Body nach Leerzeile
- Spezifische Dateien stagen (nicht `git add .`)
- Keine Secrets, keine generierten Dateien committen

## Pull Requests

- Titel: kurz (max 70 Zeichen)
- Beschreibung: Was, warum, was getestet
- CLI: `gh pr create`

## Sicherheit

- Kein Force-Push, `reset --hard`, `clean -f` ohne Bestätigung
- Kein `--no-verify` — Hooks respektieren
- Keine interaktiven Flags (`-i`)
