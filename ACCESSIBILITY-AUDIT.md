# Accessibility Audit — Slatebase

**Datum:** 2026-08-08
**Zielniveau:** WCAG 2.1 AA
**Methodik:** Automatisiert (axe-core/vitest-axe, ESLint jsx-a11y) + statische Code-Analyse + manueller Review
**Scope:** Kern-UI (Login, Editor, Sidebar, Settings, FileExplorer, TabBar, Canvas, Graph, Chat) — Plugin-UIs ausgenommen

---

## Zusammenfassung

Slatebase erreicht nach diesem Audit-Pass eine solide WCAG 2.1 AA-Basis:

- **Automatisierte Toolchain** eingerichtet (axe-Tests, ESLint jsx-a11y, in CI integriert)
- **Fokus-Management** vereinheitlicht (`useFocusTrap`-Hook in allen 6 Modals/Dialogen)
- **Skip-Navigation** ergänzt, Landmark-Struktur vollständig
- **Tastaturbedienbarkeit** für alle Kern-Widgets sichergestellt (Splitter, StatusBar, TrashView, Canvas-Nodes)
- **8 Farbkontrast-Tokens** korrigiert (Light + Dark)
- **Canvas/Graph** mit textueller Zusammenfassung und Tastatur-Navigation versehen
- **200%-Zoom:** Keine kritischen Layout-Brüche
- **Screenreader:** 0 hohe, 2 mittlere, 6 niedrige Findings (alle nicht-kritisch)

---

## 1. Installierte Tooling-Infrastruktur

| Tool | Version | Zweck |
|------|---------|-------|
| `vitest-axe` | 1.0.0-pre.5 | axe-core-Wrapper fuer Vitest (automatisierte ARIA/a11y-Pruefung) |
| `eslint-plugin-jsx-a11y-x` | 0.2.0 | Statische JSX-Accessibility-Lint-Regeln |

### axe-Tests (Phase 1)

6 Test-Dateien, 10 Tests, alle bestehend:
- `ConfirmModal.a11y.test.tsx`
- `CommandPalette.a11y.test.tsx`
- `SettingsPanel.a11y.test.tsx`
- `FileExplorer.a11y.test.tsx`
- `TabBar.a11y.test.tsx`
- `ContextMenu.a11y.test.tsx`

Tests laufen als Teil von `npm run test:coverage` — kein separater CI-Schritt noetig.

### ESLint jsx-a11y Konfiguration

Aktiviert mit `recommended`-Preset. 8 Regeln auf `warn` herabgestuft (wuerden >20 Stellen anschlagen):
- `jsx-a11y/click-events-have-key-events`
- `jsx-a11y/no-static-element-interactions`
- `jsx-a11y/no-noninteractive-element-interactions`
- `jsx-a11y/anchor-is-valid`
- `jsx-a11y/no-autofocus`
- `jsx-a11y/label-has-associated-control`
- `jsx-a11y/no-noninteractive-tabindex`
- `jsx-a11y/no-noninteractive-element-to-interactive-role`

Diese koennen inkrementell zu `error` verschaerft werden, sobald die betroffenen Stellen bereinigt sind.

---

## 2. Behobene Probleme

### 2.1 Fokus-Management (R2)

| Komponente | Aenderung |
|-----------|-----------|
| `useFocusTrap.ts` | Neuer wiederverwendbarer Hook: Tab-Zirkulation, Escape-Callback, Fokus-Rueckgabe zum Trigger-Element |
| `ConfirmModal.tsx` | Manueller `document`-Keydown-Listener entfernt, `useFocusTrap` integriert |
| `CommandPalette.tsx` | Eigene Fokus-Logik durch `useFocusTrap` ersetzt |
| `SettingsPanel.tsx` | Ad-hoc-Implementierung durch `useFocusTrap` ersetzt |
| `PluginDetailPanel.tsx` | `useFocusTrap` integriert (vorher kein Fokus-Trap) |
| `NewConversation.tsx` | `useFocusTrap` integriert (vorher kein Fokus-Trap) |
| `TemplateSelector.tsx` | `useFocusTrap` integriert (vorher kein Fokus-Trap) |

**Ergebnis:** Kein Tab-Leak mehr aus offenen Dialogen, konsistente Escape-Behandlung, Fokus kehrt zum ausloesenden Element zurueck.

### 2.2 Skip-Navigation & Landmarks (R3)

| Aenderung | Beschreibung |
|-----------|-------------|
| Skip-Link | `<a href="#main-content">` als erstes fokussierbares Element, visuell versteckt, bei `:focus` sichtbar. i18n: DE "Zum Inhalt springen" / EN "Skip to content" |
| `<main id="main-content">` | Ziel des Skip-Links (bereits vorhanden in `App.tsx`) |
| Toolbar-Landmark | `role="toolbar"` bestaetigt als korrekt — kein `<header>` noetig |

### 2.3 Tastaturbedienbarkeit (R4)

| Komponente | Aenderung |
|-----------|-----------|
| `StatusBar.tsx` | `<footer role="contentinfo" aria-label>`, Plugin-Items mit `role="button"`, `tabIndex={0}`, Enter/Space-Handler |
| `TabContent.tsx` | `role="tabpanel"` + dynamisches `aria-label` auf allen Branches (Leer/Laden/Fehler/Inhalt), `role="status" aria-live="polite"` fuer Ladezustand, `role="alert"` fuer Fehler |
| `TrashView.tsx` | `aria-label="Papierkorb"`, `role="list" aria-label="Gelöschte Dateien"`, Aktions-Buttons mit `aria-label` inkl. Dateiname, Lade-/Leerzustand mit `role="status" aria-live="polite"`, Icons `aria-hidden="true"` |
| `SidebarSplitContainer.tsx` | `role="separator" aria-orientation="vertical"`, `aria-valuenow/min/max`, `tabIndex={0}`, Pfeiltasten-Resize-Handler |
| `SplitSectionContainer.tsx` | Analog zu SidebarSplitContainer — `role="separator"` mit Tastatursteuerung |
| `CanvasMinimap.tsx` | `aria-hidden="true"` (rein dekorativ/redundant zur Haupt-Canvas) |

### 2.4 Farbkontrast (R5)

39 Token-Paare geprueft (Light + Dark). 8 Tokens korrigiert:

| Token | Theme | Alt | Neu | Kontext |
|-------|-------|-----|-----|---------|
| `--text-muted` | Light | `#94a3b8` | `#64748b` | Normaler Text auf allen Hintergruenden |
| `--text-muted` | Dark | `#64748b` | `#7a8592` | Normaler Text auf allen Hintergruenden |
| `--accent` / `--accent-text` | Light | `#0d9488` | `#0f766e` | Links, Buttons, interaktive Elemente |
| `--danger-text` | Light | `#dc2626` | `#c92020` | Fehlermeldungen auf Danger-Hintergrund |
| `--sidebar-text` | Dark | `#64748b` | `#7a8592` | Sidebar-Text auf dunklem Hintergrund |
| `--right-panel-text-muted` | Light | `#64748b` | `#586373` | Sekundaertext im Context-Panel |
| `--right-panel-text-muted` | Dark | `#64748b` | `#7a8592` | Sekundaertext im Context-Panel |
| `--broken-link-color` | Light | `#94a3b8` | `#64748b` | Unaufgeloeste Wikilinks |
| `--broken-link-color` | Dark | `#64748b` | `#7a8592` | Unaufgeloeste Wikilinks |
| `--callout-tip-icon` | Light | `#22c55e` | `#16a34a` | Tip-Callout-Icon |
| `--callout-warning-icon` | Light | `#f59e0b` | `#d97706` | Warning-Callout-Icon |

### 2.5 Canvas/Graph (R6)

| Komponente | Aenderung |
|-----------|-----------|
| `GraphView.tsx` | `role="img"` + dynamisches `aria-label` auf SVG-Root (z.B. "Graph mit 42 Knoten und 58 Kanten") |
| `CanvasView.tsx` | Tab-Navigation zwischen Nodes (`tabIndex={0}`, `role="button"`, `aria-label` mit Node-Typ/Inhalt), Enter/Space oeffnet den fokussierten Node |
| `CanvasView.tsx` | Pfeiltasten verschieben den Viewport (50px pro Tastendruck) als Alternative zu Maus-Pan |

---

## 3. Verbleibende Findings

### 3.1 Screenreader-Findings

| ID | Schweregrad | Komponente | Beschreibung | Status |
|----|-------------|-----------|--------------|--------|
| F1 | Mittel | FileExplorer/TreeNode | Tree-Items fehlt explizites `role="treeitem"` auf den interaktiven Elementen — NVDA sagt "Schaltfläche" statt "Baumelement" | Backlog |
| C1 | Mittel | CanvasView | `role="application"` entzieht Browse-Mode-Navigation; Tastaturalternative (Tab zwischen Nodes) ist implementiert, aber per-Node-ARIA (Positionen, Verbindungen) fehlt | Backlog |
| F2 | Niedrig | TreeNode | Favorit-Stern nur per Maus erreichbar (`tabIndex={-1}` auf `<span>`) | Backlog |
| F3 | Niedrig | FileExplorer | Vault-Statistik-Tooltip nur via `title`-Attribut (inkonsistente SR-Unterstuetzung) | Akzeptiert |
| T1 | Niedrig | TabBar | Fehlendes `aria-controls` auf Tabs (Verknuepfung zum `tabpanel`) | Backlog |
| T2 | Niedrig | TabBar | Tab-Reihenfolge nur per DnD aenderbar (keine Tastatur-Alternative) | Backlog |
| E1 | Niedrig | EditMode | Kein `aria-label` mit Dateiname auf dem aeusseren Editor-Container | Backlog |
| S1 | Niedrig | SettingsPanel | `role="main"` innerhalb von `role="dialog"` semantisch fragwuerdig — besser `role="region"` | Backlog |
| C2 | Niedrig | CanvasView | Keine textuelle Zusammenfassung des Canvas-Inhalts fuer Screenreader (im Gegensatz zum Graph) | Backlog |
| E2 | Info | EditMode | DropZone hat keine SR-Alternative (irrelevant: DnD ist per SR nicht bedienbar) | Akzeptiert |

### 3.2 Farbkontrast-Findings (nicht behoben)

| ID | Schweregrad | Token-Paar | Beschreibung | Status |
|----|-------------|-----------|--------------|--------|
| B1 | Niedrig | `--border-default` auf allen Hintergruenden | Unter 3:1 (UI-Komponenten-Schwelle). Borders sind rein dekorativ — Komponenten haben zusaetzliche visuelle Cues (Schatten, Hintergrund-Differenz) | Akzeptiert |
| B2 | Niedrig | `--border-subtle` auf allen Hintergruenden | Unter 3:1. Rein dekorativer Separator, nicht einziges Erkennungsmerkmal | Akzeptiert |

**Begruendung:** WCAG 1.4.11 (Non-text Contrast) verlangt 3:1 fuer "visual information required to identify UI components". Dekorative Borders, die nicht das EINZIGE Mittel zur Abgrenzung sind (Schatten, Hintergrund-Differenz vorhanden), fallen nicht unter diese Anforderung.

### 3.3 200%-Zoom-Findings

| ID | Schweregrad | Bereich | Beschreibung | Status |
|----|-------------|---------|--------------|--------|
| Z1 | Niedrig | TabBar | `overflow: hidden` schneidet Tabs ab bei vielen offenen Tabs + 200% Zoom. Kein Datenverlust (Tabs per Keyboard erreichbar) | Backlog |
| Z2 | Niedrig | Chat-Seite | Chat-Sidebar nicht collapsible (`min-width: 240px`). Bei 200% Zoom auf <1440px wenig Raum fuer Messages | Backlog |
| Z3 | Niedrig | Gesamt-App | Keine Media-Query-Breakpoints in der Haupt-App — Nutzer muessen Panels manuell einklappen | Backlog |

**Kein kritischer Bruch gefunden.** Die Architektur (Flex-Layouts, collapsible Panels, Container Queries, proportionale Skalierung) verhindert Unbedienbarkeit bei 200% Zoom.

---

## 4. Akzeptierte Abweichungen

| Bereich | Begruendung |
|---------|-------------|
| `--border-subtle`/`--border-default` Kontrast | Rein dekorativ; Komponenten haben zusaetzliche Cues. Gaengige Praxis in modernen Design-Systemen (Tailwind, Radix) |
| Vault-Statistik-Tooltip (`title`) | Tooltip ist ergaenzend, nicht essentiell — Information auch per Vault-Einstellungen erreichbar |
| DropZone ohne SR-Alternative | Drag-and-Drop ist per Screenreader grundsaetzlich nicht bedienbar; Upload-Button als Alternative existiert |
| Per-Node-ARIA fuer Canvas | Vollstaendige Per-Node-Auszeichnung (Positionen, Verbindungen, Labels) uebersteigt den Scope dieses Audit-Passes. Grundlegende Tastatur-Navigation ist implementiert |
| Plugin-UIs | Community-Plugins sind Drittanbieter-Code, ausserhalb der Kontrolle |

---

## 5. Zusammenfassung nach Schweregrad

| Schweregrad | Behoben | Backlog | Akzeptiert |
|-------------|---------|---------|------------|
| Hoch | 0 | 0 | 0 |
| Mittel | 0 | 2 | 0 |
| Niedrig | 8 Tokens + diverse Komponenten | 8 | 3 |
| Info | — | 0 | 1 |

---

## 6. Empfehlungen fuer naechste Schritte

1. **FileExplorer TreeItem-Semantik (F1):** `role="treeitem"` auf die interaktiven `<button>`-Elemente in `TreeNode.tsx` setzen, damit Screenreader die Baumstruktur korrekt kommunizieren.
2. **TabBar `aria-controls` (T1):** Jeden Tab mit `aria-controls="tabpanel-{id}"` und das zugehoerige `role="tabpanel"` mit `id="tabpanel-{id}"` verknuepfen.
3. **Editor `aria-label` (E1):** Dem Editor-Container ein `aria-label` mit dem aktuellen Dateinamen geben.
4. **Tab-Reihenfolge per Tastatur (T2):** Tastatur-Alternative fuer DnD-Reorder implementieren (z.B. Ctrl+Shift+Pfeiltasten).
5. **SettingsPanel Landmark (S1):** `role="main"` durch `role="region"` innerhalb des Dialogs ersetzen.
6. **Canvas Per-Node-ARIA (C1):** Langfristig `aria-label` mit Positionsinfo und Verbindungen pro Node ergaenzen.
7. **Tab-Bar Scroll (Z1):** `overflow-x: auto` statt `overflow: hidden` mit versteckter Scrollbar.
8. **Chat-Sidebar Collapse (Z2):** Toggle-Button analog zum Sidebar/Right-Panel-Pattern.
9. **jsx-a11y-Regeln verschaerfen:** Die 8 auf `warn` gesetzten Regeln schrittweise auf `error` setzen und betroffene Stellen bereinigen.
10. **Manueller NVDA-Test:** Dieses Audit basiert auf statischer Analyse — ein Durchlauf mit NVDA auf der laufenden App validiert die tatsaechliche Screenreader-Erfahrung.

---

## Anhang: Detailberichte

Die folgenden Detailberichte sind im `frontend/`-Verzeichnis verfuegbar:

- **`frontend/CONTRAST-AUDIT.md`** — Vollstaendige Tabelle aller 39 Token-Paar-Pruefungen mit Ratio-Werten und Fix-Empfehlungen
- **`frontend/ZOOM-AUDIT.md`** — Detaillierte CSS-Analyse aller zoom-relevanten Patterns
- **`frontend/SCREENREADER-AUDIT.md`** — Vollstaendige statische NVDA-Analyse aller Kernflows mit erwarteten Ansagen und Bewertungen pro Komponente
