---
tags: [admin]
---

# Audit-Log

Das Audit-Log protokolliert sicherheitsrelevante Ereignisse auf deiner Slatebase-Instanz. Es hilft dir, unbefugte Zugriffe zu erkennen, Probleme nachzuvollziehen und Compliance-Anforderungen zu erfüllen.

---

## Audit-Log öffnen

| Methode | Beschreibung |
|---------|--------------|
| Einstellungen (`Ctrl+,`) | Administration → Audit-Log |
| Command Palette (`Ctrl+P`) | "Audit-Log" suchen |

---

## Was wird protokolliert?

Das Audit-Log erfasst automatisch alle sicherheitsrelevanten Aktionen:

### Authentifizierung

| Ereignis | Beschreibung |
|----------|--------------|
| Login erfolgreich | Nutzer hat sich angemeldet |
| Login fehlgeschlagen | Falscher Benutzername oder Passwort |
| Logout | Nutzer hat sich abgemeldet |
| Session abgelaufen | Automatische Session-Invalidierung |

### Benutzerverwaltung

| Ereignis | Beschreibung |
|----------|--------------|
| Nutzer erstellt | Neuer Account angelegt |
| Nutzer gelöscht | Account permanent entfernt |
| Nutzer gesperrt | Account gesperrt |
| Nutzer entsperrt | Sperrung aufgehoben |
| Rolle geändert | Admin ↔ User |
| Passwort geändert | Nutzer oder Admin hat Passwort geändert |

### Vault-Operationen

| Ereignis | Beschreibung |
|----------|--------------|
| Vault erstellt | Neuer Vault angelegt |
| Vault gelöscht | Vault permanent entfernt |
| Freigabe erstellt | Vault mit Nutzer geteilt |
| Freigabe entfernt | Zugriff entzogen |
| Besitz übertragen | Vault-Eigentümer gewechselt |

---

## Aufbau eines Log-Eintrags

Jeder Eintrag enthält folgende Informationen:

| Feld | Beschreibung |
|------|--------------|
| Zeitstempel | Exakter Zeitpunkt (ISO 8601) |
| Nutzer | Wer die Aktion ausgeführt hat |
| Aktion | Was passiert ist (z.B. `user.login`, `vault.delete`) |
| Ziel | Betroffenes Objekt (z.B. Nutzername, Vault-Name) |
| IP-Adresse | Von welcher IP die Aktion kam |
| Ergebnis | Erfolg oder Fehlschlag |

---

## Log-Ansicht

Die Audit-Log-Seite zeigt die Einträge in einer filterbaren Tabelle:

### Filteroptionen

- **Zeitraum** — Nach Datum filtern
- **Nutzer** — Einträge eines bestimmten Nutzers
- **Aktion** — Bestimmte Aktionstypen (Login, Vault-Ops, etc.)
- **Ergebnis** — Nur Erfolge oder nur Fehler

### Sortierung

- Standardmäßig: neueste Einträge zuerst
- Klick auf Spaltenheader zum Umsortieren

---

## Speicherung

Das Audit-Log wird als Append-Only-Datei gespeichert:

- **Format:** JSONL (eine Zeile pro Eintrag)
- **Rotation:** Täglich eine neue Datei (`YYYY-MM-DD.jsonl`)
- **Speicherort:** `data/audit/` im Backend-Verzeichnis
- **Unveränderlich:** Einträge werden nie überschrieben oder gelöscht

> [!tip] Backup des Audit-Logs
> Da das Audit-Log append-only ist und nie rotiert wird, wächst es stetig. Bei längerer Nutzung empfiehlt sich ein regelmäßiges Backup der älteren Dateien auf externem Speicher.

---

## Typische Szenarien

### Verdächtigen Login erkennen

1. Öffne das Audit-Log
2. Filtere nach "Login fehlgeschlagen"
3. Prüfe, ob es viele fehlgeschlagene Versuche für einen Nutzer gibt
4. Prüfe die IP-Adressen — unbekannte IPs können auf Angriffe hinweisen
5. Bei Verdacht: Nutzer sperren und Passwort zurücksetzen

### Vault-Löschung nachvollziehen

1. Filtere nach "Vault gelöscht"
2. Der Eintrag zeigt wer, wann und welchen Vault
3. Prüfe, ob die Löschung autorisiert war

### Berechtigungsänderungen prüfen

1. Filtere nach "Rolle geändert" oder "Freigabe erstellt"
2. Stelle sicher, dass nur autorisierte Admins Rollen ändern
3. Prüfe unerwartete Freigabe-Erstellungen

---

## Sicherheitshinweise

- Das Audit-Log enthält **keine Passwörter oder Tokens** — nur Metadaten
- Login-Fehler zeigen bewusst nicht, ob der Benutzername oder das Passwort falsch war (Schutz gegen Enumeration)
- IP-Adressen werden erfasst — bei Reverse-Proxy korrekte Trusted-Proxy-Konfiguration sicherstellen

---

> [!tip] Regelmäßige Prüfung
> Plane eine wöchentliche Routine:
> 1. Audit-Log öffnen
> 2. Fehlgeschlagene Logins der letzten Woche prüfen
> 3. Ungewöhnliche Admin-Aktionen identifizieren
> 4. Bei Auffälligkeiten: Betroffene Nutzer informieren und Passwörter rotieren

> [!todo] Übung
> 1. Öffne das Audit-Log
> 2. Finde deinen eigenen letzten Login-Eintrag
> 3. Filtere nach fehlgeschlagenen Logins
> 4. Prüfe, ob unbekannte IP-Adressen auftauchen

---

## Verwandte Features

- [[Admin/Benutzerverwaltung]] — Nutzer sperren bei verdächtigen Aktivitäten
- [[Admin/Server-Konfiguration]] — Trusted-Proxy-Einstellungen
- [[Features/Einstellungen]] — Sessions verwalten (Nutzersicht)
