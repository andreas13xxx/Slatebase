# Implementierungsplan — Slatebase Ausstehende Features

**Stand:** August 2026 (v0.25.x). Die Kernfeatures sind umgesetzt. Es verbleiben 8 ausstehende Features in unterschiedlichen Reifegraden.

**Strategie:** Hybrid — Features mit bestehender Spec direkt umsetzen, komplexe Features erst vollständig spezifizieren.

---

## Ausstehende Features — Umsetzungsreihenfolge

| Prio | Feature | Track | Aufwand | Status |
|------|---------|-------|---------|--------|
| 1 | Obsidian Themes | B | ~15–20h | Geplant (keine Spec) |
| 2 | Public Sharing | C | ~15–20h | Geplant (keine Spec) |
| 3 | Semantische Suche / AI-Embeddings | E | ~38–58h | Geplant (keine Spec) |
| 4 | Server-Side Plugins | B | ~48–68h | Tasks vorhanden |
| 5 | Security Hardening | F | ~20–30h | Geplant (keine Spec) |
| 6 | Accessibility Audit | F | ~24–34h | Geplant (keine Spec) |
| 7 | Responsive/Mobile | F | ~24–34h | Geplant (keine Spec) |
| 8 | Collaborative Editing | D | ~68–88h | Requirements vorhanden |

---

## Abhängigkeiten

```
Track B (Plugins):     Community Plugin Store ✅ → Obsidian Themes → Server-Side Plugins
Track C (Sharing):     Public Sharing (unabhängig)
Track D (Editor):      Collaborative Editing (braucht Realtime + CM6)
Track E (AI):          Semantische Suche (unabhängig)
Track F (Polish):      Security → Accessibility → Responsive/Mobile
```

---

## Erledigt — Community Plugin Store (Track B) ✅

**Spec:** `.kiro/specs/community-plugin-store/` — alle 34 Tasks abgeschlossen.

Browse der vollen Community-Liste im Settings-Panel (Text-/Kompatibel-/Installiert-Filter), Installation direkt aus GitHub-Releases, Einzel- + Bulk-Update, Update-Check manuell und automatisch (24h), Download-Zahlen. Sicherheit: Domain-Allowlist (auf jedem Redirect-Hop revalidiert), Size-Limits, Desktop-Only-Gate, Rate-Limit-Tracking, optionaler `SLATEBASE_GITHUB_TOKEN`.

**Nachträgliche Korrektur:** Statistiken kommen aus Obsidians aggregiertem `community-plugin-stats.json` (ein CDN-Request) statt aus `releases/latest` pro Repo — der Fanout hätte das GitHub-Rate-Limit bei ~6000 Plugins sofort erschöpft.

---

## Prio 1 — Obsidian Themes (Track B)

Scope: ~15–20h. Keine Spec vorhanden.

**Vorarbeit:** Spec erstellen (CSS-Variable-Mapping, Theme-Loader, Theme-Store).

**Zusammenfassung:**

- CSS-Variable-Mapping: Obsidians ~200 `--color-*` Tokens auf Slatebase Design Tokens mappen
- Theme-Loader: CSS-Datei aus Plugin-Verzeichnis laden und injizieren (scoped)
- Theme-Auswahl in Settings (Dark/Light-Varianten)
- Theme-Vorschau (Live-Anwendung ohne Speichern)
- Community-Theme-Erkennung aus `.obsidian/themes/` bei Import

**Abhängigkeiten:** Braucht `obsidian-plugin-compat` ✅ + `unified-settings` ✅.

---

## Prio 2 — Public Sharing (Track C)

Scope: ~4h Design + ~15–20h Implementierung.

**Zusammenfassung:**

- Öffentliche Share-Links für einzelne Dateien oder ganze Vaults (ohne Login)
- Token-basierter Zugang (kryptografisch sicherer Share-Token in URL)
- Read-Only-Rendering (ViewMode ohne Editor, ohne Sidebar)
- Optionale Ablaufzeit (1h, 24h, 7d, 30d, unbegrenzt)
- Optionaler Passwortschutz
- Feature-Toggle `public-sharing` (cold, default: false)
- Audit-Log: Wer hat wann welchen Share erstellt/zugegriffen
- Verwaltung: Liste aktiver Public-Links pro Vault, Widerruf jederzeit

**Abhängigkeiten:** Braucht `auth-and-user-management` ✅ + `obsidian-markdown-compat` ✅.

---

## Prio 3 — Semantische Suche / AI-Embeddings (Track E)

Scope: ~8h Design + ~30–50h Implementierung.

**Vorarbeit (zwingend):**

- Technologie-Entscheidung: Embedding-Provider (Ollama lokal vs. OpenAI extern)
- Vector-Store-Wahl: In-Memory (hnswlib) vs. SQLite-FTS vs. externer Service (Qdrant)
- Design-Dokument mit Chunking-Strategie, Pipeline, Query-Flow, MCP-Integration

**Empfehlung:** Optionales Feature hinter Feature-Toggle (`semantic-search`). Lokal-First (Ollama) als Standard.

---

## Prio 4 — Server-Side Plugins (Track B)

Scope: ~8h Design + ~40–60h Implementierung. Task-Liste existiert (7 Phasen).

**Spec:** `.kiro/specs/server-side-plugins/`

**Phasen:** Plugin-Klassifikation → Server-Side Sandbox (vm) → Runtime Manager → API & Logs → Settings-Bridge → Frontend-Integration → Sicherheit & Hardening.

**Abhängigkeiten:** Braucht `obsidian-plugin-compat` ✅ (Plugin-Store, Registry, Installer).

**Blockiert:** IMAP-Importer, Git-Plugin, Shell Commands und andere Node.js-basierte Plugins.

---

## Prio 5 — Security Hardening (Track F)

Scope: ~20–30h.

- OWASP-Top-10-Checkliste, Race-Condition-Analyse, CSP-Header
- Input-Validierung vervollständigen, Dependency-Audit in CI
- Rate-Limit-Analyse aller Endpoints
- Ergebnis: Security-Report + Fix-Backlog

**Empfehlung:** Vor v1.0 oder bei wachsender Nutzerbasis.

---

## Prio 6 — Accessibility Audit (Track F)

Scope: ~4h Audit + ~20–30h Fixes.

- axe-core / Lighthouse (CI), manuelles Screenreader-Testing
- Tastaturnavigation, Farbkontrast (4.5:1 / 3:1), Fokus-Indikatoren
- ARIA-Landmarks, Zoom-Kompatibilität (200%), Skip-Navigation

**Empfehlung:** Nach den visuellen Features (Canvas, Live Preview) durchführen.

---

## Prio 7 — Responsive/Mobile (Track F)

Scope: ~4h Design + ~20–30h Implementierung.

- Breakpoints: Mobile (<768px), Tablet (768–1024px), Desktop (>1024px)
- Sidebar als Overlay/Drawer, Touch-Interaktionen, Canvas Pinch-to-Zoom
- Optional: PWA-Manifest

**Empfehlung:** Nach Accessibility Audit.

---

## Prio 8 — Collaborative Editing (Track D)

Scope: ~8h Design + ~60–80h Implementierung.

**Spec:** `.kiro/specs/collaborative-editing/` (Requirements vorhanden)

**Vorarbeit (zwingend):** Technologie-Entscheidung (OT vs. CRDT/Yjs), WebSocket-Integration, Cursor-Presence-Protokoll, Netzwerk-Resilienz.

**Abhängigkeiten:** Braucht `realtime-infrastructure` ✅ + `live-preview-editor` ✅ (CM6 erleichtert CRDT-Integration).

**Empfehlung:** Als eigenständiges Milestone nach Track F planen. Technisch anspruchsvollstes Feature.

---

## Gesamtaufwand (Schätzung)

Nur noch ausstehende Arbeit (Community Plugin Store ist raus):

| Track | Aufwand |
|-------|---------|
| B: Plugins (Themes + Server-Side) | ~63–88h |
| C: Sharing | ~19–24h |
| D: Editor (Collaborative) | ~68–88h |
| E: AI (Semantische Suche) | ~38–58h |
| F: Polish (Security + a11y + Mobile) | ~68–98h |
| **Summe** | **~256–356h** |

---

## Verworfene/Zurückgestellte Ideen

| Idee | Grund |
|------|-------|
| GitSync | CouchDB-Sync deckt Use-Case ab. Hohe Komplexität. |
| HTML-Rendering (Raw-HTML) | XSS-Risiko. Markdown + Mermaid + Embeds reichen. |
| Offline-Modus (PWA) | Self-Hosted = Server nötig. Vault-Sync mit Obsidian-Desktop deckt Offline ab. |
| AI-Agent im Editor | MCP deckt AI-Zugang ab. Eingebauter Copilot = eigenes Produkt. |
| Multi-Sprachen/RTL | Spezieller Use-Case. Bei Bedarf im accessibility-audit. |

---

## Bekannte Limitierungen

### vault-sync: Push ohne Chunking (>8MB-Limit)

- **Problem**: Slatebase pusht Dateien als einzelnes `data`-Feld. CouchDB `max_document_size` (default 8MB) limitiert Dateigröße.
- **Betrifft**: Nur sehr große Einzeldateien beim bidirektionalen Sync.
- **Workaround**: CouchDB `max_document_size` erhöhen oder große Dateien vom Sync ausschließen.
- **Langfristige Lösung**: Leaf-Dokumente + `children`-Array (wie livesync). Aufwand: Mittel.
- **Priorität**: Niedrig — typische Vault-Dateien sind weit unter 8MB.
