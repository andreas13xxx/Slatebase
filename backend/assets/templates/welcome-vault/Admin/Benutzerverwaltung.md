---
tags: [admin]
---

# Benutzerverwaltung

Als Administrator verwaltest du alle Nutzerkonten auf deiner Slatebase-Instanz. Du kannst neue Nutzer anlegen, bestehende sperren oder löschen und Rollen zuweisen.

---

## Benutzerverwaltung öffnen

| Methode | Beschreibung |
|---------|--------------|
| Einstellungen (`Ctrl+,`) | Administration → Benutzerverwaltung |
| Command Palette (`Ctrl+P`) | "Benutzerverwaltung" suchen |
| Nutzermenü | Avatar → Admin → Benutzerverwaltung |

---

## Nutzer anlegen

1. Öffne die Benutzerverwaltung
2. Klicke auf "Neuer Nutzer"
3. Fülle die Pflichtfelder aus:

| Feld | Anforderung |
|------|-------------|
| Benutzername | Eindeutig, kann nachträglich nicht geändert werden |
| Passwort | Mindestens 8 Zeichen |
| Anzeigename | Frei wählbar, änderbar |
| Rolle | `user` oder `admin` |
| Sprache | Deutsch oder Englisch (bestimmt Welcome-Vault-Sprache) |

4. Klicke "Erstellen"

### Was passiert bei der Erstellung?

- Der Account wird sofort aktiv
- Falls das Feature "Welcome Vault" aktiviert ist, erhält der neue Nutzer automatisch ein Anleitungs-Vault in seiner gewählten Sprache
- Der Nutzer kann sich sofort mit Benutzername und Passwort anmelden

---

## Nutzer bearbeiten

1. Klicke auf den gewünschten Nutzer in der Liste
2. Änderbare Felder:
   - **Anzeigename** — Sichtbar für andere Nutzer
   - **Rolle** — `user` oder `admin`
   - **Passwort zurücksetzen** — Neues Passwort vergeben
3. Klicke "Speichern"

> [!tip] Passwort-Reset
> Beim Zurücksetzen des Passworts wird der Nutzer beim nächsten Login aufgefordert, ein neues Passwort zu setzen. Teile dem Nutzer das temporäre Passwort über einen sicheren Kanal mit.

---

## Nutzer sperren

Gesperrte Nutzer können sich nicht mehr anmelden, ihre Daten bleiben aber erhalten:

1. Wähle den Nutzer in der Liste
2. Klicke "Sperren"
3. Bestätige die Aktion

### Auswirkungen einer Sperrung

- Alle aktiven Sessions werden sofort ungültig
- Der Nutzer wird ausgeloggt
- Login ist nicht mehr möglich
- Vaults und Daten bleiben erhalten
- Freigaben des Nutzers bleiben bestehen (andere können weiter zugreifen)
- MCP-Tokens werden invalidiert

### Sperrung aufheben

1. Wähle den gesperrten Nutzer
2. Klicke "Entsperren"
3. Der Nutzer kann sich sofort wieder anmelden

---

## Nutzer löschen

Das Löschen eines Nutzers ist endgültig und entfernt alle zugehörigen Daten:

1. Wähle den Nutzer in der Liste
2. Klicke "Löschen"
3. Bestätige durch Eintippen des Benutzernamens

### Was wird gelöscht?

- Nutzerprofil und Login-Daten
- Alle Sessions
- Alle MCP-Tokens
- Nutzerpräferenzen (Tastenkürzel, Favoriten, letzte Dateien)

### Was passiert mit den Vaults?

- **Eigene Vaults** des Nutzers werden gelöscht (inkl. aller Dateien)
- **Freigaben an den Nutzer** werden entfernt
- **Freigaben durch den Nutzer** werden aufgehoben

> [!warning] Vor dem Löschen prüfen
> Prüfe vor dem Löschen, ob der Nutzer wichtige Vaults besitzt. Übertrage den Besitz ggf. vorher an einen anderen Nutzer (über "Meine Vaults" → "Besitz übertragen").

---

## Rollen

Slatebase kennt zwei Rollen:

| Rolle | Rechte |
|-------|--------|
| `user` | Eigene Vaults verwalten, geteilte Vaults nutzen, Chat, persönliche Einstellungen |
| `admin` | Alles von `user` + Benutzerverwaltung, Server-Konfiguration, Feature-Toggles, Audit-Log, Vault-Übersicht |

### Rolle ändern

1. Wähle den Nutzer → "Bearbeiten"
2. Ändere die Rolle im Dropdown
3. Speichern

Die Änderung wirkt sofort — der Nutzer sieht die Admin-Bereiche beim nächsten Laden der Seite.

---

## Nutzerliste

Die Benutzerverwaltung zeigt eine Tabelle aller Nutzer:

| Spalte | Inhalt |
|--------|--------|
| Benutzername | Login-Name |
| Anzeigename | Öffentlich sichtbarer Name |
| Rolle | `user` oder `admin` |
| Status | Aktiv, gesperrt |
| Erstellt | Erstellungsdatum |

---

## Schutzmaßnahmen

Slatebase verhindert bestimmte destruktive Aktionen:

- **Letzter Admin** — Der letzte verbleibende Admin kann nicht gesperrt, gelöscht oder zum User herabgestuft werden
- **Selbst-Sperrung** — Du kannst dich nicht selbst sperren
- **Bestätigung** — Lösch-Aktionen erfordern das Eintippen des Benutzernamens

---

## Praktisches Beispiel

Richte einen neuen Mitarbeiter ein:

1. Öffne die Benutzerverwaltung
2. Erstelle einen neuen Nutzer mit Rolle "user"
3. Teile dem Mitarbeiter die Zugangsdaten mit
4. Erstelle einen gemeinsamen Vault (über "Meine Vaults")
5. Teile den Vault mit dem neuen Nutzer (Schreibzugriff)

---

> [!tip] Onboarding-Workflow
> Für ein gutes Onboarding:
> 1. Nutzer anlegen mit Sprache des Mitarbeiters
> 2. Welcome-Vault wird automatisch erstellt
> 3. Gemeinsame Vaults teilen
> 4. Chat nutzen zur Begrüßung und Einführung

> [!todo] Übung
> 1. Öffne die Benutzerverwaltung
> 2. Erstelle einen Test-Nutzer mit Rolle "user"
> 3. Melde dich in einem anderen Browser mit dem Test-Nutzer an
> 4. Sperre den Test-Nutzer und prüfe, dass er ausgeloggt wird
> 5. Entsperre ihn wieder und lösche ihn anschließend

---

## Verwandte Features

- [[Admin/Audit-Log]] — Login-Versuche und Änderungen nachvollziehen
- [[Admin/Feature-Toggles]] — Features für alle Nutzer steuern
- [[Features/Vault-Verwaltung]] — Vaults und Freigaben aus Nutzersicht
- [[Features/Chat]] — Kommunikation zwischen Nutzern
