# Deep-Links — Design

## Entscheidungen

| Frage | Entscheidung | Grund |
|-------|--------------|-------|
| Pfad- oder Query-Schema? | Query: `/open?vault=…&file=…` | Dateipfade enthalten `/`, Leerzeichen und Umlaute; ein Pfad-Schema bräuchte Escaping pro Segment und kollidiert mit künftigen Routen. Query ist eindeutig und entspricht Obsidians URI. |
| Vault-Schlüssel | ID, Name als Fallback bei Eindeutigkeit | IDs bleiben bei Umbenennung stabil; Obsidian-Links nutzen Namen. |
| Überschrift/Block | Anker im `file`-Wert (`#…`, `#^…`) | Identisch zur Wikilink-Syntax; ein Parameter, Auflösung teilt sich Code mit dem Wikilink-Klick. |
| Wo parsen? | Modul-Level vor dem ersten Render, wie `initializeWorkspace()` | Der Login-Gate rendert vor `AppContent`; das Ziel muss vorher gesichert und die Adresse bereinigt sein. |
| Wo abarbeiten? | `DeepLinkHandler` (rendert nichts) innerhalb von `AppContent`, nach Workspace-Restore | Braucht Tab-/App-Kontext (`openTab`, `vaultTrees`). Gleiches Muster wie `SnippetLifecycle`/`ThemeLifecycle`. |
| Backend? | Keine neue Route | Zugriff und Existenz klärt die bestehende Vault-Liste + `openTab`/`fetchFileContent`; ein Pfad-Auflöser im Backend wäre ein Existenz-Orakel mehr. |

## Module (frontend)

```
src/deep-link/
  deepLink.ts          -- reine Funktionen (kein React, kein DOM außer window.location in dünnem Wrapper)
  deepLink.test.ts
  pendingDeepLink.ts   -- sessionStorage-Speicher (Ablauf 10 min, einmal verbrauchbar)
  pendingDeepLink.test.ts
  DeepLinkHandler.tsx  -- Effekt-Komponente, rendert null
  DeepLinkHandler.test.tsx
```

### `deepLink.ts`
```ts
export interface DeepLinkTarget { vault: string; path: string | null; anchor: DeepLinkAnchor | null }
export type DeepLinkAnchor = { kind: 'heading'; text: string } | { kind: 'block'; id: string }

parseDeepLink(search: string): DeepLinkTarget | null      // null = ungültig
buildDeepLink(origin: string, vaultId: string, path?: string, anchor?: DeepLinkAnchor): string
isSafeVaultPath(path: string): boolean                    // R5.3
resolveVaultRef(ref: string, vaults: {id,name}[]): string | null   // ID zuerst, dann eindeutiger Name
```
`parseDeepLink` trennt den Anker am ersten `#` ab, das direkt auf `.md` folgt (sonst gehört `#` zum Dateinamen, `C#.md`); beginnt der Rest mit `^`, ist es ein Block-Anker (`[A-Za-z0-9-]+`). Ein leerer oder ungültiger Anker verwirft den ganzen Link. Der Anker wird
nicht normalisiert (Auflösung übernimmt die Heading-Sprunglogik).

### `DeepLinkHandler`
1. Mount: `consumePendingDeepLink()` (liefert Ziel oder null).
2. Wartet auf: authentifiziert, Vault-Liste geladen, Workspace-Restore abgeschlossen (`isRestoringRef`-Pendant
   aus `useWorkspaceRestore`).
3. `resolveVaultRef` → sonst Fehlerfall. `SELECT_VAULT` + Baum sicherstellen (`fetchVaultTree`, `cancelled`-Guard —
   Vault-Wechsel-Race, siehe lessons-learned).
4. Datei gegen den Baum prüfen (`directoryTree`), existiert sie nicht → Fehlerfall (gleiche Meldung, R5.1).
5. `openTab(...)`; danach Anker: Event/Bridge der Wikilink-Navigation wiederverwenden (**Phase 0 klärt, welche**).
6. Fehler → `showToast` mit der einen Meldung; nie werfen.

### Einlesen
`main.tsx`/Modul-Level in `App.tsx`: `if (location.pathname === '/open')` → `parseDeepLink(location.search)`; bei Treffer
`storePendingDeepLink(target)`, dann `history.replaceState(null,'', '/')`. Ungültig: nur bereinigen + Toast nach dem Login.
`/open` rendert NICHT eine eigene Seite — die normale App (inkl. Login) läuft weiter; der Handler greift erst im
eingeloggten Zustand.

### `workspace:copy-url`
`core-commands-app.ts`: Handler bekommt `activeTab` + `selectedVaultId` (beides bereits im Handler-Ref);
`unsupported: 'url-scheme'` entfernt, Eintrag in `UNSUPPORTED_REASONS` und die Tabelle „Geplant, aber noch nicht
umgesetzt“ in `PLUGIN-COMPAT.md` gestrichen. Kopieren über `navigator.clipboard.writeText`, Fallback (R2.4) Toast mit Link.
Sentinel-Tabs (`__graph`, `__view::…`, `__webview::…`) haben keinen Dateipfad → Vault-Link.

## Sicherheit
- Link = Adresse, nicht Berechtigung. Zugriff entscheidet allein die bestehende Session + Vault-Autorisierung.
- Gleiche Antwort für „nicht vorhanden“ und „nicht berechtigt“ (kein Orakel).
- Kein Token im Link, `sessionStorage` statt `localStorage` (Tab-lokal, Ablauf 10 min).
- Parameter nur als Text gerendert; Pfad geht nie direkt an `fetch`, sondern durch `openTab`/`validateFilePath()`.
- Offene Weiterleitung ausgeschlossen: `/open` navigiert nie zu einer URL aus dem Link.
- Kein Referrer-Leck: Die App setzt `Referrer-Policy: strict-origin-when-cross-origin`; der Query-String mit Dateipfad
  verlässt die Origin daher nicht. Vor Release prüfen, dass `replaceState` VOR externen Requests läuft.

## Tests
- `deepLink.test.ts`: Round-Trip (Umlaute, Leerzeichen, `#`, `%`, `&`, Emoji), Anker heading/block, ungültige Pfade
  (`..`, absolut, NUL, `\`), Vault nach ID/Name/mehrdeutig, unbekannte Parameter.
- `pendingDeepLink.test.ts`: Ablauf, einmaliger Verbrauch, Ersetzen.
- `DeepLinkHandler.test.tsx`: Erfolg (Tab geöffnet), unbekannter Vault, fehlende Datei, fehlender Zugriff →
  identische Meldung; Vault-Wechsel mitten im Laden (Race); Workspace-Restore zuerst.
- `core-commands-app`-Test: `workspace:copy-url` kopiert den erwarteten Link; Sentinel-Tab → Vault-Link.
- Manuell/E2E: abgemeldet `/open?…` → Login → Notiz offen; Reload bleibt auf `/`.
