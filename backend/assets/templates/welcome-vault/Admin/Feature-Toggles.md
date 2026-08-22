---
tags: [admin]
---

# Feature-Toggles

Feature-Toggles erlauben dir als Admin, einzelne Funktionen von Slatebase für alle Nutzer ein- oder auszuschalten — ohne Code-Änderungen. Manche wirken sofort, andere erfordern einen Server-Neustart (siehe [[#Hot-Toggles vs. Cold-Toggles]] weiter unten).

---

## Feature-Toggles öffnen

| Methode | Beschreibung |
|---------|--------------|
| Einstellungen (`Ctrl+,`) | Administration → Feature-Toggles |
| Command Palette (`Ctrl+P`) | "Feature-Toggles" suchen |

---

## Verfügbare Features

Slatebase hat aktuell drei registrierte Feature-Toggles:

| Feature | Standard | Typ | Beschreibung |
|---------|----------|-----|--------------|
| `chat` | aktiv | Hot | Echtzeit-Chat zwischen Nutzern |
| `mcp` | aktiv | Cold | Model Context Protocol Server (KI-Integration) |
| `obsidian-plugin-compat` | **inaktiv** | Cold | Obsidian-Plugin-Kompatibilitätsschicht |

---

## Feature aktivieren/deaktivieren

1. Öffne die Feature-Toggles in den Einstellungen
2. Klicke den Toggle-Schalter neben dem gewünschten Feature
3. Bei einem **Hot-Toggle** wirkt die Änderung **sofort**. Bei einem **Cold-Toggle** wirkt sie erst nach dem nächsten Server-Neustart

### Auswirkungen bei Deaktivierung

- Das Feature ist für **alle Nutzer** nicht mehr verfügbar
- Zugehörige UI-Elemente (Menüeinträge, Buttons, Seiten) verschwinden
- API-Endpunkte des Features geben `403 FEATURE_DISABLED` zurück
- Bestehende Daten werden **nicht gelöscht** — bei Re-Aktivierung ist alles wieder da

---

## Hot-Toggles vs. Cold-Toggles

| Typ | Beschreibung |
|-----|--------------|
| Hot-Toggle | Wirkt sofort, kein Neustart nötig |
| Cold-Toggle | Erfordert einen Server-Neustart, um zu wirken |

Von den drei aktuellen Toggles ist nur `chat` ein Hot-Toggle. `mcp` und `obsidian-plugin-compat` sind beide **Cold** — eine Änderung wird erst nach dem nächsten Server-Neustart wirksam.

---

## Feature-Details

### Chat (`chat`) — Hot, standardmäßig aktiv

- **Aktiviert:** Chat-Icon im Menü, Unread-Badges, Echtzeit-Nachrichten
- **Deaktiviert:** Kein Chat-Zugang, keine Benachrichtigungen
- **Daten:** Konversationen und Nachrichten bleiben erhalten

### MCP (`mcp`) — Cold, standardmäßig aktiv

- **Aktiviert:** MCP-Endpunkt aktiv, Token-Verwaltung verfügbar
- **Deaktiviert:** MCP-Endpunkt antwortet mit 403, bestehende Tokens bleiben gespeichert
- **Hinweis:** Experimentelles Feature; Änderung wirkt erst nach Server-Neustart

### Obsidian Plugin Compat (`obsidian-plugin-compat`) — Cold, standardmäßig **inaktiv**

- **Aktiviert:** Plugin-Verwaltung sichtbar, Plugins können installiert und geladen werden
- **Deaktiviert:** Keine Plugin-Funktionalität, Plugin-Commands nicht in Command Palette
- **Hinweis:** Experimentelles Feature — Plugins können Stabilität beeinflussen; Änderung wirkt erst nach Server-Neustart

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
| Kleine Installation (1–3 Nutzer) | Alle Features auf Standard belassen |
| Firmenumgebung ohne KI | `mcp` deaktivieren (Neustart nötig) |
| Plugins nicht benötigt | `obsidian-plugin-compat` deaktiviert lassen (Standard) |
| Kein Team-Bedarf | `chat` deaktivieren |

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
