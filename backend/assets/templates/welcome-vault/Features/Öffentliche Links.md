---
tags: [features]
---

# Öffentliche Links

Mit einem öffentlichen Link kannst du eine Notiz mit Personen teilen, die **kein Slatebase-Konto** haben. Sie öffnen den Link im Browser und lesen die Notiz — mehr nicht.

> [!info] Nur mit aktivem Feature
> Öffentliche Links sind standardmäßig **ausgeschaltet**, weil dabei Inhalte den Server verlassen. Ein Administrator schaltet sie unter *Einstellungen → Administration → Feature-Toggles* ein (`public-shares`).

## Link erzeugen

1. Rechtsklick auf eine Notiz im Explorer → **„Öffentlichen Link verwalten“** (oder in der Befehlspalette: *Öffentlichen Link der Notiz verwalten*).
2. Optional ein **Passwort** (mindestens 8 Zeichen) und ein **Ablaufdatum** setzen.
3. **„Link erzeugen“** wählen und den Link kopieren.

Der Link wird **nur einmal** angezeigt. Verlierst du ihn, erzeugst du mit „Neuen Link erzeugen“ eine neue Adresse — die alte wird dabei ungültig, Passwort und Ablaufdatum bleiben erhalten.

## Was die Empfänger sehen

- Die Notiz, genau wie in der Leseansicht — **immer im aktuellen Stand**. Änderungen, die du später machst, sind sofort sichtbar.
- **Eingebettete Inhalte** (`![[Notiz]]`, Bilder, PDFs, Audio, Video) sind fest eingebunden. Der Dialog zeigt dir vor dem Teilen, was der Link zusätzlich enthält.
- **Nicht** enthalten: Bases, Canvas und Plugin-Blöcke (sie würden Daten aus dem restlichen Vault ziehen). Nicht auflösbare Einbettungen erscheinen als Hinweis „Eingebetteter Inhalt nicht verfügbar“.
- Wikilinks (`[[Notiz]]`) und Links auf andere Notizen erscheinen als **normaler Text**. Andere Notizen werden dadurch nicht freigegeben.
- Properties (Frontmatter) werden nicht angezeigt.

## Verwalten

- **Dialog:** Passwort und Ablaufdatum ändern oder entfernen, Link widerrufen.
- **Einstellungen → Öffentliche Links:** alle deine Links über alle Vaults, mit Ablauf, Passwortschutz und letztem Abruf.
- Wird die Notiz **umbenannt oder verschoben**, bleibt der Link gültig. Wird sie **gelöscht** (auch in den Papierkorb), endet der Link endgültig.

## Gut zu wissen

- Jede Person mit dem Link kann ihn weitergeben. Nutze ein Passwort und ein Ablaufdatum für sensible Inhalte.
- Zugriffe und Änderungen an Links stehen im Audit-Log der Administration.
- Gäste können nichts bearbeiten.
