---
tags: [admin]
---

# Feature-Toggles

Feature-Toggles erlauben dir als Admin, einzelne Funktionen von Slatebase für alle Nutzer ein- oder auszuschalten — ohne Server-Neustart und ohne Code-Änderungen.

---

## Feature-Toggles öffnen

| Methode | Beschreibung |
|---------|--------------|
| Einstellungen (`Ctrl+,`) | Administration → Feature-Toggles |
| Command Palette (`Ctrl+P`) | "Feature-Toggles" suchen |

---

## Verfügbare Features

| Feature | Standard | Beschreibung |
|---------|----------|--------------|
| `chat` | aktiv | Chat-Funktion zwischen Nutzern |
| `knowledge-graph` | aktiv | Wissens-Graph-Visualisierung |
| `welcome-vault` | aktiv | Anleitungs-Vault bei neuen Nutzern erstellen |
| `mcp` | aktiv | Model Context Protocol Server (KI-Integration) |
| `obsidian-plugin-compat` | aktiv | Obsidian-Plugin-Kompatibilitätsschicht |
| `live-preview` | aktiv | Live-Preview-Editor (CodeMirror 6) |

---

## Feature aktivieren/deaktivieren

1. Öffne die Feature-Toggles in den Einstellungen
2. Klicke den Toggle-Schalter neben dem gewünschten Feature
3. Die Änderung wirkt **sofort** (Hot-Toggle)

### Auswirkungen bei Deaktivierung

- Das Feature ist für **alle Nutzer** nicht mehr verfügbar
- Zugehörige UI-Elemente (Menüeinträge, Buttons, Seiten) verschwinden
- API-Endpunkte des Features geben `403 FEATURE_DISABLED` zurück
- Bestehende Daten werden **nicht gelöscht** — bei Re-Aktivierung ist alles wieder da

---

## Hot-Toggles vs. Cold-Toggles

Alle aktuellen Feature-Toggles sind **Hot-Toggles**:

| Typ | Beschreibung |
|-----|--------------|
| Hot-Toggle | Wirkt sofort, kein Neustart nötig |
| Cold-Toggle | Erfordert Server-Neustart (aktuell keine) |

---

## Feature-Details

### Chat (`chat`)

- **Aktiviert:** Chat-Icon im Menü, Unread-Badges, Echtzeit-Nachrichten
- **Deaktiviert:** Kein Chat-Zugang, keine Benachrichtigungen
- **Daten:** Konversationen und Nachrichten bleiben erhalten

### Knowledge Graph (`knowledge-graph`)

- **Aktiviert:** Graph-Tab im Tab-Bar, Graph-Befehle in Command Palette
- **Deaktiviert:** Graph nicht erreichbar
- **Daten:** Link-Index wird weiterhin gepflegt (für Backlinks im Context Panel)

### Welcome Vault (`welcome-vault`)

- **Aktiviert:** Neue Nutzer erhalten automatisch ein Anleitungs-Vault; Nutzer können es manuell erstellen
- **Deaktiviert:** Kein automatisches Vault bei Nutzererstellung, kein Button in Einstellungen

### MCP (`mcp`)

- **Aktiviert:** MCP-Endpunkt aktiv, Token-Verwaltung verfügbar
- **Deaktiviert:** MCP-Endpunkt antwortet mit 403, bestehende Tokens bleiben gespeichert
- **Hinweis:** Experimentelles Feature

### Obsidian Plugin Compat (`obsidian-plugin-compat`)

- **Aktiviert:** Plugin-Verwaltung sichtbar, Plugins können installiert und geladen werden
- **Deaktiviert:** Keine Plugin-Funktionalität, Plugin-Commands nicht in Command Palette
- **Hinweis:** Experimentelles Feature — Plugins können Stabilität beeinflussen

### Live Preview (`live-preview`)

- **Aktiviert:** Editor bietet Source- und Live-Preview-Modus
- **Deaktiviert:** Nur Source-Modus verfügbar, Toggle-Button ausgeblendet

---

## Umgebungsvariablen-Override

Feature-Toggles können auch über Umgebungsvariablen gesteuert werden. Diese überschreiben die UI-Einstellung:

```
SLATEBASE_FEATURE_CHAT=false
```

> [!warning] Env-Override
> Wenn ein Feature über eine Umgebungsvariable gesetzt ist, kann es in der UI nicht geändert werden. Das ist nützlich für Deployments, bei denen bestimmte Features permanent deaktiviert sein sollen.

---

## Wann Features deaktivieren?

| Situation | Empfehlung |
|-----------|-----------|
| Kleine Installation (1–3 Nutzer) | Alle Features aktiv lassen |
| Firmenumgebung ohne KI | `mcp` deaktivieren |
| Stabilität priorisiert | `obsidian-plugin-compat` deaktivieren |
| Kein Team-Bedarf | `chat` deaktivieren |
| Performance-Optimierung | `knowledge-graph` bei sehr großen Vaults deaktivieren |

---

## Praktisches Beispiel

Teste die Auswirkung eines Feature-Toggles:

1. Öffne Feature-Toggles in den Einstellungen
2. Deaktiviere "Chat"
3. Prüfe: Der Chat-Eintrag im Nutzermenü ist verschwunden
4. Aktiviere "Chat" wieder
5. Prüfe: Der Chat-Eintrag ist sofort wieder da

---

> [!tip] Schrittweise Aktivierung
> Bei einer neuen Slatebase-Installation empfiehlt es sich, experimentelle Features (Plugins, MCP) zunächst deaktiviert zu lassen und sie nach und nach zu aktivieren, sobald du dich mit der Plattform vertraut gemacht hast.

> [!todo] Übung
> 1. Öffne die Feature-Toggles (`Ctrl+,` → Administration)
> 2. Deaktiviere ein Feature deiner Wahl
> 3. Prüfe im Nutzermenü und in der Command Palette, dass das Feature verschwunden ist
> 4. Aktiviere es wieder

---

## Verwandte Features

- [[Admin/Server-Konfiguration]] — Globale Server-Einstellungen
- [[Admin/Benutzerverwaltung]] — Nutzer und Rollen verwalten
- [[Features/Einstellungen]] — Einstellungs-Panel-Übersicht
- [[Fortgeschritten/MCP Context Server]] — MCP-Feature im Detail
- [[Fortgeschritten/Obsidian Plugins]] — Plugin-Feature im Detail
