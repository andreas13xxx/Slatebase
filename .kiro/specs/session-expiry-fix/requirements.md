# Session-Expiry-Fix — Requirements

## Problembeschreibung

Aktive Sessions werden unerwartet beendet — Benutzer müssen sich häufig neu einloggen. Betroffen sind insbesondere:
- Page-Reload (F5 / Ctrl+R)
- Browser-Tab schließen und neu öffnen
- Backend-Neustart (Dev-Server, Docker-Container-Restart)
- Inaktivität über 24h (ohne Vorwarnung)

## Identifizierte Ursachen (Code-Analyse)

### Ursache 1: CSRF-Secret wird bei Backend-Neustart zufällig generiert
- **Datei:** `backend/src/index.ts`, Zeile 98
- **Code:** `const csrfSecret = process.env['SLATEBASE_CSRF_SECRET'] ?? crypto.randomBytes(32).toString('hex')`
- **Auswirkung:** Ohne gesetzte `SLATEBASE_CSRF_SECRET` Env-Var generiert jeder Neustart ein neues Secret. Alle bestehenden CSRF-Tokens werden ungültig. Jeder POST/PUT/DELETE-Request nach Backend-Restart schlägt mit 403 `CSRF_INVALID` fehl.
- **Nutzer-Erfahrung:** "Ich habe eben noch gearbeitet, jetzt kann ich nichts mehr speichern" → Session erscheint kaputt → Re-Login nötig.

### Ursache 2: Keine gleitende Session-Verlängerung (Sliding Expiry)
- **Datei:** `backend/src/auth/index.ts`, Zeile 461/547
- **Code:** `const SESSION_DURATION_MS = 24 * 60 * 60 * 1000` — expiresAt wird einmal bei Login gesetzt und nie aktualisiert
- **Auswirkung:** Session stirbt exakt 24h nach Login, unabhängig von Aktivität. Ein Nutzer der 8h arbeitet und am nächsten Tag nach 16h zurückkehrt muss sich neu einloggen — ohne Vorwarnung.
- **Nutzer-Erfahrung:** "Ich habe mich gestern eingeloggt, heute morgen bin ich plötzlich ausgeloggt."

### Ursache 3: `sessionStorage` statt `localStorage` für Token-Persistenz
- **Datei:** `frontend/src/state/authContext.ts`, Zeilen 8–10
- **Verhalten:** `sessionStorage` überlebt Page-Reload, wird aber bei Tab-Close gelöscht.
- **Auswirkung:** Nutzer schließt den Tab (nicht den Browser) und öffnet Slatebase in einem neuen Tab → Token weg → Login-Page.
- **Nutzer-Erfahrung:** "Ich habe den Tab geschlossen und muss mich neu einloggen."

### Ursache 4: Race-Condition bei Token-Restore nach Reload (potenziell)
- **Datei:** `frontend/src/App.tsx`, Zeilen 833–840
- **Verhalten:** `apiClient.setToken()` wird per `useEffect` gesetzt (asynchron nach Render). Wenn `loadVaults()` (Zeile 344) oder das Chat-Polling vor dem `useEffect`-Flush feuert, geht der Request ohne Token raus → 401 → `SESSION_EXPIRED` dispatched → Login-Page.
- **Nutzer-Erfahrung:** "Nach Reload sehe ich kurz die Login-Seite, dann muss ich mich neu einloggen."

## Requirements

### REQ-1: CSRF-Secret Auto-Persistierung
- Wenn `SLATEBASE_CSRF_SECRET` nicht als Env-Var gesetzt ist, soll das Backend beim ersten Start ein zufälliges Secret generieren UND in einer Datei persistieren (`data/.csrf-secret`).
- Bei nachfolgenden Starts wird das Secret aus der Datei geladen.
- Das Secret wird NIEMALS geloggt oder über die API exponiert.
- Nur wenn die Datei nicht existiert UND keine Env-Var gesetzt ist, wird ein neues Secret generiert.

### REQ-2: Sliding Session Expiry
- Bei jedem validierten Request wird die Session-Lebensdauer um die konfigurierte Dauer verlängert (`expiresAt = now + sessionDuration`).
- Die Session-Dauer soll konfigurierbar sein (Env-Var `SLATEBASE_SESSION_DURATION_HOURS`, Default: 24).
- Die Maximal-Lebensdauer einer Session soll begrenzt sein (z.B. 7 Tage ab Erstellung), um Endlos-Sessions zu vermeiden.
- `lastActivity` UND `expiresAt` werden bei jedem validierten Request aktualisiert.

### REQ-3: Token-Persistierung in localStorage (Optional, konfigurierbar)
- Der Frontend-Auth-Token soll in `localStorage` statt `sessionStorage` gespeichert werden.
- Das erlaubt Session-Erhalt über Tab-Close hinaus (bis zur serverseitigen Expiry).
- Bei Logout: Token wird aus `localStorage` gelöscht.
- Sicherheitshinweis: localStorage ist per Origin isoliert. Das Sicherheitsniveau bleibt gleich wie bei sessionStorage (kein Cross-Origin-Zugriff möglich).

### REQ-4: Token-Restore vor erstem API-Call (Race-Condition eliminieren)
- Der ApiClient muss seinen Token synchron beim Konstruktor oder vor dem ersten Render-Cycle setzen — nicht per `useEffect`.
- Alternativ: `loadVaults()` und andere initiale API-Calls dürfen erst ausgelöst werden NACHDEM der Token im ApiClient gesetzt ist.
- Kein API-Call darf ohne gültigen Token abgesetzt werden wenn der Auth-State `isAuthenticated: true` ist.

### REQ-5: Graceful Session-Expiry-Handling im Frontend
- Wenn eine Session serverseitig abgelaufen ist, soll das Frontend eine verständliche Meldung zeigen ("Sitzung abgelaufen — bitte erneut anmelden") statt direkt die Login-Page ohne Kontext zu zeigen.
- Der aktuelle Zustand (offene Tabs, unsaved Changes) soll NICHT verloren gehen wenn möglich — nach Re-Login soll der Zustand wiederhergestellt werden.

### REQ-6: Robustheit bei CSRF-Mismatch
- Wenn ein 403 mit Code `CSRF_INVALID` empfangen wird, soll das Frontend NICHT sofort `SESSION_EXPIRED` dispatchen.
- Stattdessen: eine erneute Session-Validierung versuchen (GET auf einen geschützten Endpoint) um zu prüfen ob die Session noch lebt.
- Nur wenn die Validierung ebenfalls fehlschlägt (401), wird der Nutzer ausgeloggt.

## Nicht im Scope

- Refresh-Tokens (OAuth-Pattern) — zu komplex für die aktuelle Architektur, opake Tokens + Sliding Expiry reichen.
- "Remember Me"-Checkbox — kann als separates Feature nachgerüstet werden.
- Multi-Tab-Synchronisation (BroadcastChannel) — nice-to-have, aber nicht für den Fix nötig.

## Akzeptanzkriterien

1. Nach Backend-Neustart (ohne SLATEBASE_CSRF_SECRET Env-Var) bleiben bestehende Sessions gültig.
2. Ein aktiver Nutzer wird NICHT nach 24h ausgeloggt wenn er innerhalb der letzten 24h aktiv war.
3. Tab schließen und Slatebase in neuem Tab öffnen → Nutzer bleibt eingeloggt.
4. Page-Reload (F5) → Nutzer bleibt eingeloggt, kein Flicker der Login-Page.
5. Inaktiver Nutzer wird nach konfigurierter Dauer (Default: 24h) ausgeloggt.
6. Eine Session kann nie länger als 7 Tage leben (Maximal-Lebensdauer).
