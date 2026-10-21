# Öffentliche Freigabe-Links — Design

## Backend: `backend/src/public-share/`

```
Config → Logger → Vault → PublicShareService → publicShareRoutes
```

| Datei | Inhalt |
|---|---|
| `types.ts` | `PublicShare`, `CreatePublicShareInput`, `PublicShareView` |
| `errors.ts` | `PublicShareNotFoundError`, `PublicSharePasswordRequiredError`, `PublicShareDisabledError` |
| `public-share-store.ts` | `IPublicShareStore` + `createPublicShareStore()` über `shared/json-file-store.ts` → `data/public-shares.json` |
| `public-share-service.ts` | `IPublicShareService`: create / list / revoke / update, `resolve(token)`, `readNote`, `readAsset` |
| `embed-resolver.ts` | ermittelt die Einbettungen einer Notiz (Quelle: Link-Index), Basis für die Asset-Allowlist |
| `index.ts` | Barrel |

### Datenmodell

```ts
interface PublicShare {
  tokenHash: string      // SHA-256 des Tokens; der Klartext wird nur einmal angezeigt
  tokenHint: string      // letzte 4 Zeichen, für die Verwaltung
  vaultId: string
  fileId: string         // folgt der Datei bei Umbenennen/Verschieben (siehe unten)
  createdBy: string
  createdAt: string
  expiresAt?: string
  passwordHash?: string
  lastAccessAt?: string
}
```

Der Token wird nur gehasht gespeichert: Ein Leck von `public-shares.json` gibt keine nutzbaren Links preis.

### „Token folgt der Datei“

Der Link-Index kennt Umbenennen/Verschieben bereits (Link-Integrität). `PublicShareService` hört auf dieselben
Vault-Ereignisse und schreibt `filePath` um. Ist der Rewrite unzuverlässig (Datei außerhalb von Slatebase bewegt),
liefert der Link 404 — nie eine andere Datei. **Offen für die Umsetzung:** Prüfen, ob der Link-Index eine stabile
Datei-ID liefert oder ob der Rewrite über die Ereignisse laufen muss.

### Routen

Authentifiziert (hinter `requireVaultWrite`):

| Methode | Pfad | Zweck |
|---|---|---|
| POST | `/vaults/:vaultId/public-shares` | `{ path, expiresAt?, password? }` → `{ url, token }` (Token nur hier) |
| GET | `/vaults/:vaultId/public-shares` | Links des Vaults (ohne Token) |
| PUT | `/vaults/:vaultId/public-shares/:id` | Ablauf/Passwort ändern |
| DELETE | `/vaults/:vaultId/public-shares/:id` | widerrufen |
| GET | `/public-shares` | eigene Links über alle Vaults („Meine Links“) |

Öffentlich (neue Konstante `PUBLIC_SHARE_PREFIX = '/api/v1/public/'` in `auth/middleware.ts`, analog `VERSION_PATH`;
CSRF und Session entfallen, Rate-Limit greift stattdessen):

| Methode | Pfad | Zweck |
|---|---|---|
| GET | `/public/s/:token` | gerenderte Notiz (JSON: Titel, Markdown, Einbettungs-Map) |
| POST | `/public/s/:token/unlock` | Passwort prüfen → kurzlebiges, an den Token gebundenes Cookie |
| GET | `/public/s/:token/asset?ref=<verweis>` | eingebettete Datei |

`ref` ist der Verweis, wie er in der Notiz steht, **nicht** ein Vault-Pfad. Der Service löst ihn serverseitig auf und
liefert nur, was in der Einbettungsliste der Notiz steht.

### Rendering

Das Backend liefert den Markdown-Rohtext **ohne Frontmatter**; die Darstellung übernimmt das Frontend mit der
vorhandenen Reading-View-Pipeline (gleiche Remark-Plugins, gleiche HTML-Allowlist). Vorteil: kein zweiter Renderer,
der auseinanderläuft. Im öffentlichen Modus werden Wikilinks, Transklusionen und Plugin-Blöcke durch eine
`publicMode`-Option der Pipeline neutralisiert.

### Passwort-Sitzung

`/unlock` setzt ein signiertes, `HttpOnly`-Cookie mit Token-ID und Ablauf (30 min), In-Memory-Schlüssel genügt
(Single-Instance). Falsche Versuche zählen gegen ein eigenes, strengeres Limit pro IP und Token.

## Frontend

- `frontend/src/public-share/`: `PublicSharePage.tsx` (Route `/s/:token`, ohne `AuthProvider`/Shell),
  `PublicShareDialog.tsx`, `publicShareActions.ts` (standalone async), `PublicShareSettings.tsx`
  (Eintrag in `state/settingsRegistry.ts` mit `feature: 'public-shares'`).
- `IApiClient` bekommt die authentifizierten Methoden; die öffentliche Seite nutzt einen eigenen schlanken `fetch`-Aufruf,
  damit sie keine Session-Annahmen erbt.
- Texte deutsch, Code englisch.

## Risiken

| Risiko | Gegenmaßnahme |
|---|---|
| Pfad-Traversal über `ref` | Auflösung nur gegen die Einbettungsliste; zusätzlich `validateFilePath()` |
| Versehentlich öffentlicher Reverse-Proxy-Pfad | README-Abschnitt, Toggle standardmäßig aus |
| Inhaltsleck über Frontmatter/Wikilinks | 3.6/2.4: Frontmatter entfernt, Links neutralisiert |
| Token im Referer/Log | Seite setzt `Referrer-Policy: no-referrer`; Audit speichert nur den Hint |
| Live-Stand zeigt versehentlich Änderungen | im Dialog Hinweis „zeigt immer den aktuellen Stand“ |
