---
tags: [fortgeschritten]
---

# MCP Context Server

Slatebase implementiert das **Model Context Protocol (MCP)**, mit dem KI-Assistenten direkt auf deine Notizen zugreifen können. So kannst du KI-Tools wie Claude oder Cursor mit dem Kontext deiner Wissensbasis arbeiten lassen.

> [!warning] Experimentelles Feature
> Der MCP Context Server ist experimentell. Die API kann sich in zukünftigen Versionen ändern. Achte auf die Zugriffsrechte deiner API-Tokens.

---

## Was ist MCP?

Das **Model Context Protocol** ist ein offener Standard, der KI-Modellen strukturierten Zugriff auf externe Datenquellen gibt. Statt Notizen manuell in einen Chat zu kopieren, kann die KI direkt deine Vault-Inhalte lesen, durchsuchen und bearbeiten.

### Voraussetzungen

- Feature-Toggle `mcp` ist aktiviert (Admin-Einstellung)
- Mindestens ein Vault mit Inhalten
- KI-Client mit MCP-Unterstützung

---

## API-Token erstellen

1. Öffne **Einstellungen → Konto → MCP-Tokens**
2. Klicke auf **"Neuen Token erstellen"**
3. Vergib einen Namen (z.B. "Claude Desktop", "Cursor IDE")
4. Wähle die Berechtigungen:
   - **Lesen** — Dateien lesen, Suche, Vault-Struktur
   - **Schreiben** — Zusätzlich: Dateien erstellen, bearbeiten, löschen
5. Klicke "Erstellen"
6. **Kopiere den Token sofort** — er wird nur einmal angezeigt!

> [!warning] Token-Sicherheit
> Der Token gibt direkten Zugriff auf deine Vault-Inhalte. Behandle ihn wie ein Passwort. Widerrufe Tokens, die du nicht mehr brauchst.

**Limits:** Max 10 Tokens pro User, 60 Anfragen/Minute pro Token.

---

## KI-Clients konfigurieren

### Claude Desktop

Bearbeite die Konfigurationsdatei:
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "slatebase": {
      "url": "http://localhost:3000/api/v1/mcp",
      "headers": {
        "Authorization": "Bearer DEIN_TOKEN_HIER"
      }
    }
  }
}
```

Starte Claude Desktop nach der Konfiguration neu.

### Cursor IDE

1. Öffne Cursor-Einstellungen → "MCP Servers"
2. Klicke "Add MCP Server"
3. Type: `HTTP`, URL: `http://localhost:3000/api/v1/mcp`
4. Header: `Authorization: Bearer DEIN_TOKEN_HIER`

### Andere Clients

Jeder MCP-fähige Client kann sich verbinden:
- **Endpoint:** `http://<server>:3000/api/v1/mcp`
- **Auth:** `Authorization: Bearer <token>`
- **Discovery:** `http://<server>:3000/.well-known/mcp.json`

---

## Verfügbare Tools

### Lese-Tools (immer verfügbar)

| Tool | Beschreibung |
|------|--------------|
| `list_vaults` | Alle zugänglichen Vaults auflisten |
| `get_vault_structure` | Ordnerstruktur abrufen |
| `read_file` | Datei-Inhalt lesen |
| `search_vault` | Volltextsuche im Vault |

### Schreib-Tools (nur mit Write-Berechtigung)

| Tool | Beschreibung |
|------|--------------|
| `write_file` | Datei erstellen oder überschreiben |
| `create_directory` | Ordner erstellen |
| `delete_file` | Datei löschen |
| `move_file` | Datei verschieben/umbenennen |

---

## Praktisches Beispiel

Du fragst Claude: "Lies alle Dateien im Ordner 'Projekte' und erstelle eine Zusammenfassung als 'Projekte/Zusammenfassung.md'."

Claude kann dann selbstständig die Vault-Struktur erkunden, Dateien lesen und eine neue Datei erstellen — ohne dass du Inhalte kopieren musst.

---

## Token verwalten

- **Widerrufen:** Einstellungen → MCP-Tokens → "Widerrufen" (sofort ungültig)
- **Automatisch ungültig:** Bei Löschung oder Sperrung deines Kontos
- Tokens haben kein Ablaufdatum — manuell widerrufen wenn nicht mehr benötigt

> [!tip] Token-Benennung
> Benenne Tokens nach Gerät/Anwendung (z.B. "MacBook Claude", "Arbeits-PC Cursor"). So erkennst du sofort, welchen Token du widerrufen kannst.

---

## Verwandte Features

- [[Features/Einstellungen]] — Token-Verwaltung in den Einstellungen
- [[Features/Suche und Ersetzen]] — Die Suche, die auch MCP nutzt
- [[Fortgeschritten/Vault Sync einrichten]] — Alternative für Datenzugriff auf anderen Geräten
