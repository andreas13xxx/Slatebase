# Accessibility — Slatebase

**Zielniveau:** WCAG 2.1 AA
**Methodik:** Automatisiert (axe-core/vitest-axe, ESLint jsx-a11y) + statische Code-Analyse + manueller Review
**Scope:** Kern-UI (Login, Editor, Sidebar, Settings, FileExplorer, TabBar, Canvas, Graph, Chat) — Plugin-UIs sind Drittanbieter-Code und ausgenommen

Dieses Dokument beschreibt den aktuellen Stand: was an Infrastruktur steht, was offen ist
und welche Abweichungen bewusst akzeptiert sind. Behobene Findings werden entfernt, nicht
abgehakt.

## Stand

Solide WCAG-2.1-AA-Basis. Keine hohen Findings, zwei mittlere im Backlog. Bei 200 % Zoom
gibt es keinen kritischen Layout-Bruch — Flex-Layouts, einklappbare Panels, Container
Queries und proportionale Skalierung verhindern Unbedienbarkeit.

## Tooling

| Tool | Zweck |
|------|-------|
| `vitest-axe` | axe-core-Wrapper für Vitest. `jest-axe` funktioniert hier nicht — es setzt den Jest-Expect-Kontext voraus; die Matcher werden über `vitest-axe/extend-expect` in `test-setup.ts` registriert |
| `eslint-plugin-jsx-a11y-x` | Statische JSX-Lint-Regeln. Der `-x`-Fork von `es-tooling` statt des Originals, weil dessen `peerDependency` bei ESLint 9 endet — gleiche Regeln, gleiche API |

axe-Tests laufen als Teil von `npm run test:coverage`, kein separater CI-Schritt.
Vorhandene Suites: `ConfirmModal`, `CommandPalette`, `SettingsPanel`, `FileExplorer`,
`TabBar`, `ContextMenu` (je `*.a11y.test.tsx`). Neue Kern-Komponenten (Modals, Panels,
Listen) sollen eine bekommen.

Acht jsx-a11y-Regeln stehen auf `warn` statt `error`, weil sie an über 20 Stellen
anschlagen würden — sie sollen schrittweise auf `error` hochgezogen werden:
`click-events-have-key-events`, `no-static-element-interactions`,
`no-noninteractive-element-interactions`, `no-redundant-roles`,
`interactive-supports-focus`, `no-autofocus`, `label-has-associated-control`,
`no-noninteractive-tabindex`.

## Geltende Regeln

- Neue Modals/Dialoge nutzen `useFocusTrap` (`hooks/useFocusTrap.ts`) — kein eigener
  `document`-Keydown-Listener, keine manuellen `previousFocus`-Refs. Ad-hoc-Lösungen
  driften auseinander (Fokus-Rückgabe mal ja, mal nein; Tab kann aus dem Dialog leaken).
- Interaktive Elemente auf nicht-interaktiven Tags brauchen `role="button"`,
  `tabIndex={0}` und einen `onKeyDown`-Handler (Enter/Space).
- Resize-Handles brauchen **alle vier** ARIA-Werte: `role="separator"`, `aria-valuenow`,
  `aria-valuemin`, `aria-valuemax` plus `aria-orientation` und Pfeiltasten-Handler. Ohne
  `aria-valuenow` sagt NVDA nur „Trennlinie" ohne den aktuellen Wert an.
- SVG-Visualisierungen brauchen `role="img"` und ein beschreibendes `aria-label` (der
  Graph erzeugt es dynamisch: „Graph mit 42 Knoten und 58 Kanten").
- Ladezustände: `role="status" aria-live="polite"`; Fehler: `role="alert"`.
- Rein dekorative oder zur Hauptansicht redundante Widgets (Canvas-Minimap, Icons) tragen
  `aria-hidden="true"`, damit Screenreader sie nicht durchlaufen.
- Neue Farbtoken in `index.css`: 4.5:1 für Normaltext, 3:1 für großen Text und
  UI-Komponenten. **Bei jeder Token-Änderung auch `obsidian-compat.css` prüfen** — die
  Obsidian-Variablen (`--text-faint`, `--text-accent`, …) mappen auf dieselben Werte; eine
  Änderung nur in `index.css` lässt die Plugin-Seite auf dem alten Wert stehen.

## Offene Findings

| ID | Schwere | Komponente | Beschreibung |
|----|---------|-----------|--------------|
| F1 | Mittel | FileExplorer/TreeNode | Kein `role="treeitem"` auf den interaktiven Elementen — NVDA sagt „Schaltfläche" statt „Baumelement". Fix: das Attribut auf die `<button>`-Elemente in `TreeNode.tsx` setzen |
| C1 | Mittel | CanvasView | `role="application"` entzieht die Browse-Mode-Navigation. Tab-Navigation zwischen Nodes ist implementiert, aber per-Node-ARIA (Position, Verbindungen) fehlt |
| T1 | Niedrig | TabBar | Kein `aria-controls` auf den Tabs. Fix: `aria-controls="tabpanel-{id}"` plus passende `id` am `role="tabpanel"` |
| T2 | Niedrig | TabBar | Tab-Reihenfolge nur per Drag-and-Drop änderbar, keine Tastatur-Alternative (z.B. Ctrl+Shift+Pfeil) |
| E1 | Niedrig | EditMode | Kein `aria-label` mit Dateiname auf dem äußeren Editor-Container |
| S1 | Niedrig | SettingsPanel | `role="main"` innerhalb von `role="dialog"` ist semantisch fragwürdig — `role="region"` wäre richtig |
| C2 | Niedrig | CanvasView | Keine textuelle Zusammenfassung des Canvas-Inhalts für Screenreader, anders als beim Graph |
| F2 | Niedrig | TreeNode | Favoriten-Stern nur per Maus erreichbar (`tabIndex={-1}` auf einem `<span>`) |
| Z1 | Niedrig | TabBar | `overflow: hidden` schneidet bei vielen Tabs und 200 % Zoom ab. Kein Datenverlust (Tabs sind per Tastatur erreichbar). Fix: `overflow-x: auto` mit versteckter Scrollbar |
| Z2 | Niedrig | Chat-Seite | Chat-Sidebar ist nicht einklappbar (`min-width: 240px`); bei 200 % Zoom unter 1440 px bleibt wenig Raum für Nachrichten |
| Z3 | Niedrig | Gesamt-App | Keine Media-Query-Breakpoints in der Haupt-App — Nutzer müssen Panels manuell einklappen. Wird von der `responsive-mobile`-Spec abgedeckt |

Offen ist außerdem ein **manueller NVDA-Durchlauf** auf der laufenden App: die
Screenreader-Bewertung beruht bislang auf statischer Analyse.

## Akzeptierte Abweichungen

| Bereich | Begründung |
|---------|-------------|
| `--border-subtle`/`--border-default` unter 3:1 | WCAG 1.4.11 verlangt 3:1 für „visual information required to identify UI components". Diese Borders sind dekorativ und nie das einzige Abgrenzungsmerkmal (Schatten, Hintergrund-Differenz sind vorhanden). Gängige Praxis in Tailwind/Radix |
| Vault-Statistik-Tooltip nur per `title` | Ergänzend, nicht essentiell — dieselbe Information steht in den Vault-Einstellungen |
| DropZone ohne Screenreader-Alternative | Drag-and-Drop ist per Screenreader grundsätzlich nicht bedienbar; der Upload-Button ist die Alternative |
| Per-Node-ARIA im Canvas | Vollständige Auszeichnung (Positionen, Verbindungen, Labels) ist ein eigener Scope; die grundlegende Tastatur-Navigation steht |
| Plugin-UIs | Community-Plugins sind Drittanbieter-Code außerhalb unserer Kontrolle |
| Rechtschreib-Unterringelung wird nicht angesagt | Die Markierung ist nicht rein farblich (Wellenlinie = Form, erfüllt WCAG 1.4.1), CM6 rendert sie aber als Mark-Decoration ohne ARIA. Die Korrekturen sind per Tastatur erreichbar — der Befehl „Kontextmenü unter dem Cursor anzeigen" (`editor:context-menu`) öffnet dasselbe Menü inklusive Vorschlägen für das Wort am Cursor; das *Auffinden* der Stelle bleibt visuell. Vollständige Ansage bräuchte eine eigene Diagnose-Liste als Live-Region |

Akzeptierte Abweichungen gehören dokumentiert, nicht stillschweigend ignoriert — ohne
Begründung sieht ein späterer Audit-Durchlauf nur eine offene Verletzung und fängt von
vorne an.

## Detailberichte

- `frontend/CONTRAST-AUDIT.md` — alle 39 Token-Paar-Prüfungen mit Ratio-Werten
- `frontend/ZOOM-AUDIT.md` — CSS-Analyse aller zoom-relevanten Patterns
- `frontend/SCREENREADER-AUDIT.md` — statische NVDA-Analyse aller Kernflows
