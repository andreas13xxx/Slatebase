# Deep-Links (URL-Schema) — Requirements

Status: Entwurf (2026-11-13). Anlass: Obsidians Befehl `workspace:copy-url` ("Obsidian-URL der aktuellen
Datei kopieren") ist in Slatebase ein Stub (`unsupported: 'url-scheme'`, siehe `PLUGIN-COMPAT.md`). Es gibt kein
Schema, das Vault + Datei auf einen wiederverwendbaren Link abbildet; die App kennt heute nur die Landing-Pages
`/reset-password`, `/verify-email` und `/s/<token>` (öffentliche Freigabe).

## Ziel

Ein Link, der eine Notiz (optional: Überschrift oder Block) in Slatebase öffnet, wenn man ihn teilt, in ein
Lesezeichen legt oder in eine externe Anwendung einfügt. Der Link ist **kein Zugriffstoken**: Wer ihn öffnet, muss
angemeldet sein und Zugriff auf den Vault haben. Für Zugriff ohne Konto gibt es weiterhin Public Shares (`/s/<token>`).

## Abgrenzung

- Kein Ersatz für Public Shares; ein Deep-Link gewährt nie Zugriff.
- Kein `obsidian://`-Protokoll-Handler im Betriebssystem (Desktop-Konzept). Obsidian-URIs werden nicht geparst.
- Kein Routing der gesamten App (Back/Forward des Browsers pro Tab) — nur Einstiegslinks. Ein History-Router ist
  ein eigenes Feature.
- `registerObsidianProtocolHandler` (Plugin-API) bleibt unverändert; Anbindung ist ein möglicher Folgeschritt.

## Anforderungen

### R1 — Link-Format
1. Format: `<origin>/open?vault=<vaultId>&file=<pfad>`; `<origin>` ist `window.location.origin`.
2. `file` ist der vault-relative Pfad, URL-kodiert (`encodeURIComponent`), mit Dateiendung. Optional trägt er
   einen Anker im Wikilink-Stil: `Notiz.md#Überschrift` oder `Notiz.md#^block-id` (kodiert, `#` → `%23`). Damit
   deckt ein Parameter dieselben Ziele ab wie `[[Notiz#Überschrift]]` und entspricht Obsidians URI-Konvention.
3. `vault` ist die Vault-ID (deterministisch, SHA-256/12 Hex, ändert sich bei Umbenennung nicht). Beim Öffnen wird
   zusätzlich ein **eindeutiger** Vault-Name akzeptiert (Obsidian-Parität); bei Mehrdeutigkeit gilt: nicht gefunden.
4. Fehlt `file`, öffnet der Link nur den Vault (Vault wählen, Explorer aufklappen). Fehlt `vault`, ist der Link ungültig.
5. Unbekannte Parameter werden ignoriert (Vorwärtskompatibilität).

### R2 — Link erzeugen
1. `workspace:copy-url` kopiert den Link der aktiven Datei in die Zwischenablage und zeigt einen Toast. Der
   `unsupported`-Eintrag entfällt. Ohne aktive Datei: Hinweis-Toast, Link auf den Vault allein.
2. Aktiver Cursor in einer Überschrift/auf einem Block-Anker hängt den Anker NICHT automatisch an (Obsidian tut das
   auch nicht); Anker entstehen nur über explizite Aktionen (spätere Erweiterung: Kontextmenü „Link zu Überschrift“).
3. Zusätzlich ein Eintrag „Link kopieren“ im Tab-Kontextmenü und im Datei-Explorer-Kontextmenü (gleiche Funktion).
4. Schlägt das Kopieren fehl (Clipboard-API nicht verfügbar, unsicherer Kontext), zeigt ein Toast den Link zum
   manuellen Kopieren.

### R3 — Link öffnen
1. Der Link öffnet die Datei als Tab (aktiviert; ein vorhandener Tab wird wiederverwendet), im aktiven Pane.
2. Mit Anker springt die Ansicht zur Überschrift bzw. zum Block (dieselbe Mechanik wie ein Klick auf `[[Notiz#…]]`).
3. Nicht angemeldet: Der Link wird gemerkt (R4) und nach erfolgreichem Login abgearbeitet. Das gilt auch, wenn
   „Passwort ändern erzwungen“ dazwischen liegt.
4. Der Parameter-Teil wird nach dem Einlesen aus der Adresszeile entfernt (`history.replaceState`, wie die
   Landing-Pages), damit ein Reload nicht erneut springt und die Adresse sauber bleibt.
5. Der Link überschreibt den wiederhergestellten Workspace nicht: Der gespeicherte Zustand wird erst
   wiederhergestellt, dann kommt der Deep-Link-Tab hinzu und wird aktiv.
6. Ein Deep-Link auf eine Nicht-Markdown-Datei (Bild, PDF, Canvas, `.base`) öffnet sie wie ein Klick im Explorer.

### R4 — Zwischenspeicherung über den Login
1. Das Ziel liegt in `sessionStorage` (Schlüssel `slatebase:pending-deep-link`), nicht in `localStorage` und nicht im
   URL-Fragment des Login-Formulars. Es enthält nur Vault, Pfad, Anker — keine Tokens.
2. Ablauf: wird nach einem Login nicht binnen 10 Minuten verbraucht, verfällt es.
3. Es wird genau einmal verbraucht; ein zweiter Link ersetzt einen noch offenen.

### R5 — Fehlerfälle und Datenschutz
1. Vault unbekannt, Vault nicht zugänglich, Datei fehlt: **eine** gleichlautende Meldung („Link konnte nicht
   geöffnet werden: Ziel nicht gefunden oder kein Zugriff“) — der Link darf nicht verraten, ob ein Vault oder
   eine Datei existiert (kein Existenz-Orakel).
2. Es entsteht nirgends ein Fehlerzustand der App: nach der Meldung bleibt der normale Workspace erhalten.
3. Pfadprüfung im Frontend vor dem Öffnen: leere Pfade, absolute Pfade, `..`-Segmente, NUL-Bytes und Backslashes sind
   ungültig (Fehlerfall R5.1). Die maßgebliche Prüfung bleibt `validateFilePath()` im Backend; das Frontend öffnet nur
   über die bestehende `openTab`-Strecke, nie über einen eigenen Dateizugriff.
4. Der Link enthält keine Geheimnisse: kein Token, keine Session, kein CSRF-Wert.
5. Anzeige von Dateinamen aus dem Link nur als Text (React-Escaping), nie als HTML.

### R6 — Plattform
1. Nginx und Vite-Dev-Server liefern `/open` über den SPA-Fallback aus; es gibt keine neue Backend-Route.
   (Der Pfad `/open` darf nicht mit einer `/api`-Route kollidieren; `/.well-known/` bleibt unberührt.)
2. Barrierefreiheit: Toasts nutzen `role="status"` bzw. `role="alert"` (bestehende Toast-Komponente).
3. i18n: alle Texte in `de.ts` und `en.ts`.

## Nicht-Ziele (Folgeschritte)
- Kontextmenü „Link zu Überschrift/Block kopieren“.
- Pane-/Split-Ziel im Link (`&pane=`), Zeilenangabe (`&line=`).
- Anbindung von `registerObsidianProtocolHandler` an `/open`.
- Echte History-Navigation (Router).
