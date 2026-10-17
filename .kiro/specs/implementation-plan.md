# Implementierungsplan — Slatebase Ausstehende Features

Dieses Dokument listet die **offene** Arbeit. Umgesetzte Features stehen in
`.kiro/steering/product.md`, die dabei getroffenen Entscheidungen in `.kiro/steering/`
und in der jeweiligen Spec unter `.kiro/specs/<feature>/`.

**Bereits ausgeliefert (nicht mehr im Backlog unten):** **Bases** inkl. Karten-/Kanban-View,
`registerBasesView()`-Plugin-API und MCP-`query_base` — der Rest sind bewusst zurückgestellte
Grenzen, siehe „Ausgelieferte Features mit zurückgestellten Resten" unten. **Workspaces &
Split-Panes** (Phasen 0–5 auf `master`) — offen sind nur die zwei zurückgestellten Reste. **Voice
Transcription** ist ausgeliefert (Feature-Toggle `voice-transcription`, siehe `product.md`).

**Strategie:** Features mit vorhandener Spec direkt umsetzen, komplexe Features erst
vollständig spezifizieren. Kleinere, thematisch verwandte Features werden zu gemeinsamen
Specs gebündelt statt einzeln spezifiziert.

## Umsetzungsreihenfolge

| Prio | Feature | Track | Aufwand | Spec-Stand |
|------|---------|-------|---------|------------|
| 1 | Obsidian Themes | B | ~15–20h | Keine Spec |
| 2 | Public Sharing | C | ~19–24h | Keine Spec |
| 3 | Responsive/Mobile | F/G | ~24–34h | Vollständig (Req + Design + Tasks) |
| 4 | Echte E2E-Test-Suite | F | ~30–45h | Req + Design vollständig |
| 5 | Server-Side Plugins | B | ~48–68h | Tasks vorhanden |
| 6 | Fremdformat-Importer | I | ~20–30h | Keine Spec |
| 7 | Semantische Suche / AI-Embeddings | E | ~38–58h | Keine Spec |
| 8 | Collaborative Editing | D | ~68–88h | Nur Requirements |

**Summe:** ~262–367h.

> **Zurückgestellte Reste ausgelieferter Features** (nicht in der Summe oben, siehe eigenen
> Abschnitt unten): Split-Panes — gespeicherte, benannte Workspace-Layouts + Workspace-Switcher;
> Bases — nur noch die erweiterte Ausdruckssprache (Lambdas/`map`/`filter`, custom `summaries`-Formeln, `file.embeds`); R1–R7 der Spec `bases-feature-completion` sind umgesetzt.

## Abhängigkeiten

```
Track B (Plugins):    Obsidian Themes → Server-Side Plugins
Track C (Sharing):    Public Sharing (unabhängig)
Track D (Editor):     Collaborative Editing (braucht Realtime + CM6, beide vorhanden)
Track E (AI):         Semantische Suche (unabhängig). Voice Transcription: ausgeliefert
Track F (Qualität):   Responsive/Mobile; E2E-Test-Suite (unabhängig, parallel möglich)
Track G (Layout):     Workspaces & Split-Panes: ausgeliefert (Phasen 0–5)
Track H (Daten):      Bases: ausgeliefert
Track I (Onboarding): Fremdformat-Importer (unabhängig)
```

---

## Prio 1 — Obsidian Themes (Track B)

Scope: ~15–20h. Vorarbeit: Spec erstellen (CSS-Variable-Mapping, Theme-Loader, Theme-Store).

- Obsidians ~200 `--color-*` Tokens auf Slatebase Design Tokens mappen
- Theme-Loader: CSS-Datei aus dem Plugin-Verzeichnis laden und geschopt injizieren
- Theme-Auswahl in Settings (Dark/Light-Varianten), Vorschau ohne Speichern
- Community-Theme-Erkennung aus `.obsidian/themes/` beim Import

---

## Prio 2 — Public Sharing (Track C)

Scope: ~4h Design + ~15–20h Implementierung.

- Öffentliche Share-Links für einzelne Dateien oder ganze Vaults (ohne Login)
- Token-basierter Zugang, Read-Only-Rendering (ViewMode ohne Editor/Sidebar)
- Optionale Ablaufzeit (1h, 24h, 7d, 30d, unbegrenzt), optionaler Passwortschutz
- Feature-Toggle `public-sharing` (cold, default: false)
- Audit-Log für Erstellung und Zugriff; Verwaltung + Widerruf pro Vault

Teilt die Read-Only-Rendering-Basis (`.view-mode`) mit dem PDF-Export.

---

## Prio 3 — Responsive/Mobile (Track F/G)

Scope: ~4h Design + ~20–30h Implementierung. **Spec:** `.kiro/specs/responsive-mobile/`
(Requirements + Design + Tasks, basierend auf einem Ist-Zustands-Audit).

- Breakpoints: Mobile (<768px), Tablet (768–1024px), Desktop (>1024px)
- Sidebar als Overlay/Drawer, Touch-Interaktionen, Canvas Pinch-to-Zoom
- Optional: PWA-Manifest (nur Installation, kein Offline-Anspruch)

**Sequenzierung:** Split-Panes (Workspaces, Track G) sind bereits ausgeliefert. Das macht
Responsive/Mobile anspruchsvoller, weil ein bestehendes Split-Pane-Layout responsive zu machen
schwerer ist als ein Single-Pane-Layout — die Responsive-Spec muss das Pane-Layout von Anfang an
mitdenken.

---

## Prio 4 — Echte E2E-Test-Suite (Track F)

Scope: ~30–45h. **Spec:** `.kiro/specs/e2e-testing/` (Requirements + Design vollständig).

Playwright ist als Dependency/Config vorhanden, aber der einzige Spec
(`demo-recording.spec.ts`) hat keine Assertions (nur GIF-Aufnahme fürs Marketing) und
läuft nicht in CI — es gibt aktuell keinen Test, der Frontend und Backend als reales,
über HTTP verbundenes System prüft.

- Zwei Stufen: schneller Dev-Stack-Lauf bei jedem Push/PR, Docker-Stack-Lauf
  (`docker-compose.dev.yml`, echte Container/Nginx) nightly + vor Releases
- Testdaten-Isolation über ein dediziertes Datenverzeichnis pro Lauf, Seed per API im
  `globalSetup` statt eingecheckter Fixtures
- Page-Object-Modell + schrittweise `data-testid`-Einführung statt fragiler CSS-Selektoren
- Zwei-Browser-Kontext-Tests für Realtime/SSE-Szenarien
- 4 Phasen: Fundament (Login) → Kern-Workflow → Realtime/Sharing → Admin + Docker-Stufe

**Empfehlung:** reine Qualitätsinfrastruktur ohne Abhängigkeiten — je früher etabliert,
desto mehr profitieren die großen Features darunter von Regressionsschutz.

---

## Prio 5 — Server-Side Plugins (Track B)

Scope: ~8h Design + ~40–60h Implementierung. **Spec:** `.kiro/specs/server-side-plugins/`
(Task-Liste in 7 Phasen: Plugin-Klassifikation → Server-Side Sandbox (vm) → Runtime
Manager → API & Logs → Settings-Bridge → Frontend-Integration → Sicherheit & Hardening).

**Sicherheits-Nachsorge:** Diese Spec ist auch der richtige Ort für echte
Plugin-Sandbox-Isolation (Worker/VM statt Proxy-basierter Soft-Isolation) und den
Per-User-Rate-Limiter für `/proxy`/`/shares`/`/search` — beide im Fix-Backlog von
`SECURITY-AUDIT.md` vermerkt, bewusst hier statt in einem eigenen Nachfolge-Pass.

**Blockiert:** Shell Commands und andere Node.js-basierte Plugins.

---

## Prio 6 — Fremdformat-Importer (Track I)

Scope: ~20–30h. Keine Spec.

- Notion-Export (ZIP mit HTML/Markdown + CSV-Datenbanken) → Markdown + Frontmatter
- Evernote (`.enex`) → Markdown, generisches HTML → Markdown
- Mapping-Report nach Import (was wurde wie übersetzt, was ist fehlgeschlagen)

**Kein Ersatz durch das Obsidian-Importer-Plugin:** Das Community-Plugin deckt
Notion/Evernote/HTML zwar ab, läuft aber hinter dem experimentellen
`obsidian-plugin-compat`-Toggle und erfordert manuelle Installation — für die Zielgruppe
(neue Nutzer beim Onboarding) zu viel Reibung. Außerdem fehlt der Mapping-Report.

---

## Prio 7 — Semantische Suche / AI-Embeddings (Track E)

Scope: ~8h Design + ~30–50h Implementierung.

**Vorarbeit (zwingend):**

- Embedding-Provider entscheiden (Ollama lokal vs. OpenAI extern)
- Vector-Store wählen (In-Memory/hnswlib vs. SQLite-FTS vs. Qdrant)
- Design-Dokument mit Chunking-Strategie, Pipeline, Query-Flow, MCP-Integration

Optionales Feature hinter Feature-Toggle `semantic-search`, lokal-first (Ollama) als Standard.

---

## Prio 8 — Collaborative Editing (Track D)

Scope: ~8h Design + ~60–80h Implementierung. **Spec:**
`.kiro/specs/collaborative-editing/` (nur Requirements).

**Vorarbeit (zwingend):** Technologie-Entscheidung (OT vs. CRDT/Yjs),
WebSocket-Integration, Cursor-Presence-Protokoll, Netzwerk-Resilienz.

Technisch anspruchsvollstes und riskantestes Feature im Backlog — bewusst zuletzt.

---

## Ausgelieferte Features mit zurückgestellten Resten

Diese Features sind auf `master` ausgeliefert (siehe `product.md`); hier stehen nur die
bewusst zurückgestellten Reste, damit sie nicht aus dem Blick geraten.

### Workspaces & Split-Panes (Track G) — ausgeliefert (Phasen 0–5)

Spec: `.kiro/specs/split-panes/` (+ `slash-commands/`). Umgesetzt: Pane-Baum-Reducer,
Rendering/Resize, Splits + Tab-Drag + Kanten-Split, Persistenz/Migration pro Vault,
Plugin-Workspace-Shim (`createLeafBySplit`/`splitActiveLeaf`/`getLeaf('split')` erzeugen echte
Panes). **Zurückgestellt:** Keyboard-Pane-Fokus und „in Split öffnen" per Modifikator sind
inzwischen ebenfalls vorhanden (`pane-focus-direction.ts`, `openInSplitBridge.ts`); offen bleiben
nur gespeicherte, benannte Workspace-Layouts + Workspace-Switcher.

### Bases (Track H) — ausgeliefert

Spec: `.kiro/specs/bases/` (+ `bases-plugin-api/`, `bases-expression-language/`). Umgesetzt:
`.base`-Parser/Serializer im echten Obsidian-Format, Query-Engine auf dem Link-Index,
Ausdrucks-Engine für Filter und Formeln (in `shared-contracts/`), editierbare Tabellen-View,
Karten-/Kanban-View inkl. Drag zwischen Spalten, Feature-Toggle `bases` (cold/default-aus),
Plugin-API `registerBasesView()`, MCP-Werkzeug `query_base`, Welcome-Vault-Guides DE/EN.
**Umgesetzt (Spec `bases-feature-completion`, R1–R7):** Kandidaten-Obergrenze auf 5000 angehoben
mit konservativem Prädikat-Pushdown (Property-Gleichheit/`file.hasTag`/`file.inFolder` vor der
Kappung) + sichtbarem `truncated`-Hinweis; Property-Typ Liste/Skalar (beobachtet + Registry);
`summaries`-Aggregation (Tabelle, Kanban-Header, MCP); `file.size`/`file.backlinks`; `bases:insert`
(`![[file.base]]`-Embed) + `bases:add-item`; sortierbare Formelspalten (clientseitig); Welcome-Vault-
Guides + Beispiele DE/EN erweitert.
**Noch zurückgestellt:** Lambdas/`map`/`filter` in der Ausdruckssprache, custom `summaries`-Formeln
über `values`, `file.embeds` (bräuchte getrennte Embed-Markierung im Index).
Plugin-Views laufen nur im Browser (Architekturgrenze, kein Serverpfad).

---

## Bewusst nicht implementierte Features

| Idee | Grund |
|------|-------|
| Mehrere native Fenster / OS-Fensterverwaltung | Browser-App-Architektur schließt das aus. Tabs + ausgelieferte Split-Panes decken den Bedarf innerhalb eines Browser-Fensters ab. |
| Native Mobile-Apps (iOS/Android) | Bewusst web-only. Responsive/Mobile (Prio 3) deckt den Mobile-Anwendungsfall ohne zweite Codebasis ab. |
| Generisches HTML-Rendering | XSS-Risiko. Eine enge Allowlist für Inline-Tags plus `<center>`-Blöcke ist umgesetzt (`plugins/inline-html.ts`); alles außerhalb bleibt literaler Text. Volles HTML-Rendering bleibt verworfen. |
| Offline-Modus (volles PWA-Offline) | Self-Hosted = Server nötig. Vault-Sync mit Obsidian-Desktop deckt Offline ab. (Ein reines PWA-Installations-Manifest ohne Offline-Anspruch ist als Option in Prio 3 vorgesehen.) |
| AI-Agent im Editor | MCP deckt AI-Zugang ab. Ein eingebauter Copilot wäre ein eigenes Produkt. |
| Multi-Sprachen/RTL | Spezieller Use-Case. Bei konkretem Bedarf im Rahmen der responsive-mobile- oder einer eigenen i18n-Spec aufgreifen. |
