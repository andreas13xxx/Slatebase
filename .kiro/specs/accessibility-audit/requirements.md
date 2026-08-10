# Accessibility Audit — Requirements

## Motivation

Slatebase hat bereits eine solide ARIA-Basis (568 `aria-`/`role`-Vorkommen in 110 Dateien) — FileExplorer, TabBar, ContextMenu, CommandPalette und GraphView sind gut abgedeckt. Die Abdeckung ist aber sehr ungleich verteilt: mehrere zentrale Komponenten (StatusBar, TabContent, Sidebar-Splitter, TrashView, Canvas-Node-Renderer) haben kaum bis keine ARIA-Auszeichnung, es gibt kein gemeinsames Focus-Management (jeder Dialog reimplementiert Escape/Fokus separat, teils ohne Fokus-Trap oder Fokus-Rückgabe), keine automatisierte a11y-Testing-Infrastruktur (kein axe-core/jest-axe, kein `jsx-a11y`-Lint, kein CI-Schritt) und keinen Skip-Navigation-Link. Canvas- und Graph-View (SVG/Canvas-lastig) haben keine zugängliche Alternative für Screenreader-Nutzer.

Ziel: Ein Audit-Durchlauf (automatisiert + manuell) gefolgt von gezielten Fixes für die identifizierten Lücken, mit Fokus auf Tastaturbedienbarkeit, Fokus-Management und die am stärksten genutzten Kernkomponenten. Kein vollständiges WCAG-AAA-Rewrite.

## Ist-Zustand (Referenz für die Umsetzung)

- **Styling:** Plain CSS, Design-Tokens als CSS Custom Properties in `frontend/src/index.css` (Light/Dark via `[data-theme]`).
- **ARIA:** Gut abgedeckt — `FileExplorer.tsx` (tree/treeitem), `TabBar.tsx` (tablist/tab), `ContextMenu.tsx` (menu/menuitem), `CommandPalette.tsx` (dialog). Kaum/nicht abgedeckt — `StatusBar.tsx`, `TabContent.tsx`, `SidebarSplitContainer.tsx`/`SidebarPanelTabBar.tsx`, `TrashView.tsx`, Canvas-Node-Renderer (`ResizeHandles.tsx`, `NodeAnchors.tsx`, `GroupNodeRenderer.tsx`), `CanvasMinimap.tsx`.
- **Fokus-Management:** Kein gemeinsamer Hook/kein `focus-trap`-Lib. `ConfirmModal.tsx` fokussiert beim Öffnen, schließt per manuellem `document`-Keydown-Listener bei Escape, aber ohne Fokus-Trap (Tab kann aus dem Dialog herausspringen) und ohne Fokus-Rückgabe an das auslösende Element. `CommandPalette.tsx` und `SettingsPanel.tsx` reimplementieren dasselbe Muster unabhängig voneinander.
- **Testing:** Kein axe-core/jest-axe/Playwright-a11y-Check, kein `jsx-a11y`-ESLint-Plugin, kein a11y-Schritt in `.github/workflows/ci.yml`.
- **Landmarks:** `App.tsx` nutzt bereits `<main>`, `<aside>` (Sidebar + Right-Panel), `<section>`; `FileExplorer.tsx` hat `<nav aria-label="File explorer">`. Kein `<header>`-Landmark — Toolbar ist ein `<div role="toolbar">`.
- **Skip-Navigation:** Kein "skip to content"-Link im gesamten Frontend.
- **Canvas/Graph:** `GraphView.tsx` (SVG) hat Loading/Error-States mit `role="status"`/`role="alert"`, aber kein `aria-label` auf dem Graph selbst. `CanvasView.tsx` hat `role="application" aria-label="Canvas-Ansicht"` auf dem Wrapper, aber keine Per-Node-ARIA und keine dokumentierte Tastatur-Alternative — `role="application"` nimmt Screenreadern die normale Navigation ab, ohne Ersatz zu bieten.

## Funktionale Anforderungen

### R1: Automatisierte a11y-Test-Infrastruktur

- R1.1: `jest-axe` (bzw. `vitest-axe`, passend zum bestehenden Vitest-Setup) wird als Dev-Dependency ergänzt und für die wichtigsten interaktiven Komponenten (Modals, CommandPalette, SettingsPanel, FileExplorer) als Unit-Test eingebunden.
- R1.2: `eslint-plugin-jsx-a11y` wird in `frontend/eslint.config.js` aktiviert (empfohlene Regeln, keine Vollstrenge die bestehenden Code massenhaft brechen würde — inkrementell verschärfbar).
- R1.3: Ein a11y-Testschritt läuft in CI (`.github/workflows/ci.yml`) als Teil des bestehenden Frontend-Test-Jobs, kein separater Workflow.
- R1.4: Findings aus R1.1–R1.3 werden nicht automatisch alle in diesem Pass gefixt — kritische/hohe Findings (Kontrast, fehlende Labels auf interaktiven Elementen) werden priorisiert, der Rest geht in den Report (R9).

### R2: Gemeinsames Focus-Management

- R2.1: Ein wiederverwendbarer `useFocusTrap`-Hook (`frontend/src/hooks/`) wird erstellt: Fokus bleibt innerhalb des Containers (Tab/Shift+Tab zyklisch), Escape schließt (konfigurierbar), Fokus kehrt beim Schließen zum auslösenden Element zurück.
- R2.2: `ConfirmModal.tsx`, `CommandPalette.tsx`, `SettingsPanel.tsx`, `PluginDetailPanel.tsx`, `NewConversation.tsx`, `TemplateSelector.tsx` werden auf den gemeinsamen Hook umgestellt (bestehende Ad-hoc-Implementierungen entfernt).
- R2.3: Verhalten nach Umstellung bleibt für Endnutzer unverändert oder verbessert sich (kein Tab-Leak mehr aus offenen Dialogen) — keine sichtbaren Regressions in bestehenden Interaktionen.

### R3: Skip-Navigation & Landmark-Vervollständigung

- R3.1: Ein "Zum Inhalt springen"-Link wird als erstes fokussierbares Element im DOM ergänzt (visuell versteckt, sichtbar bei Fokus), springt zum `<main>`-Landmark.
- R3.2: Die Toolbar-Region erhält, falls semantisch passend, ein `<header>`- oder zumindest konsistentes Landmark-Pattern (Bewertung im Rahmen des Audits, kein Zwang zu `<header>` falls `role="toolbar"` bereits korrekt ist).

### R4: Tastaturbedienbarkeit — Lückenschluss

- R4.1: `StatusBar.tsx`, `TabContent.tsx`, `SidebarSplitContainer.tsx`/`SidebarPanelTabBar.tsx`, `TrashView.tsx` erhalten fehlende `role`/`aria-label`/`tabIndex`/Keyboard-Handler für ihre interaktiven Elemente.
- R4.2: Sidebar-/Panel-Splitter (Resize-Handles) werden per Tastatur bedienbar (Pfeiltasten zum Verschieben, wenn fokussiert) — mindestens `role="separator"` mit `aria-valuenow`/`aria-valuemin`/`aria-valuemax`.
- R4.3: `CanvasMinimap.tsx` erhält Tastaturzugriff oder wird explizit als `aria-hidden` markiert, falls rein dekorativ/redundant zur Haupt-Canvas.

### R5: Farbkontrast

- R5.1: Alle Text-/Hintergrund-Token-Paare in `frontend/src/index.css` (Light + Dark) werden gegen WCAG-AA-Schwellen geprüft (4.5:1 normaler Text, 3:1 großer Text/UI-Komponenten).
- R5.2: Verstöße werden im Report (R9) gelistet; Token-Anpassungen erfolgen nur für Verstöße, nicht als generelles Redesign.

### R6: Canvas/Graph — zugängliche Alternative

- R6.1: `GraphView.tsx` erhält ein `aria-label`/`aria-describedby` mit einer textuellen Zusammenfassung (z. B. Anzahl Knoten/Kanten) auf dem SVG-Root.
- R6.2: `CanvasView.tsx`: `role="application"` wird überprüft — entweder durch eine dokumentierte Tastatur-Alternative ergänzt (Tab zwischen Nodes, Enter zum Öffnen) oder durch ein passenderes ARIA-Pattern ersetzt, falls `application` nicht gerechtfertigt ist.
- R6.3: Volle Per-Node-ARIA-Auszeichnung für alle Canvas-Node-Typen ist NICHT Teil dieses Passes (siehe Abgrenzung) — nur die strukturelle Tastatur-Erreichbarkeit.

### R7: 200%-Zoom-Kompatibilität

- R7.1: Kernansichten (Editor, Sidebar, Settings) werden bei 200% Browser-Zoom auf Layout-Brüche (abgeschnittener Text, überlappende Elemente, horizontales Scrollen der ganzen Seite) geprüft.
- R7.2: Gefundene Brüche werden im Report gelistet, kritische (Datenverlust/Unbedienbarkeit) werden in diesem Pass gefixt.

### R8: Manueller Screenreader-Test

- R8.1: Mindestens ein manueller Testdurchlauf mit einem Screenreader (NVDA oder VoiceOver) über die Kernflows: Login, Datei öffnen/bearbeiten, Sidebar-Navigation, Settings öffnen.
- R8.2: Ergebnisse fließen in den Report (R9), keine Vollabdeckung aller Plugin-UIs erforderlich.

### R9: Accessibility-Report

- R9.1: Ein strukturierter Report (`ACCESSIBILITY-AUDIT.md`) dokumentiert alle Findings aus R1–R8 mit Schweregrad, betroffener Komponente und Status (Fixed/Backlog).

## Nicht-funktionale Anforderungen

- NF1: Keine sichtbaren visuellen Regressionen für sehende Maus-/Tastatur-Nutzer durch die Fixes.
- NF2: Der neue CI-a11y-Schritt darf den bestehenden Frontend-Test-Job um max. ~20% Laufzeit verlängern.
- NF3: `useFocusTrap` ist generisch genug für zukünftige neue Dialoge (keine Component-spezifische Kopplung).

## Abgrenzung

- Kein vollständiges Per-Node-ARIA für alle Canvas-Node-Typen (Text/File/Link/Group) — nur strukturelle Tastatur-Erreichbarkeit der Canvas als Ganzes (R6).
- Keine Mehrsprachigkeit/RTL-Unterstützung (im Implementierungsplan explizit als eigener, zurückgestellter Punkt vermerkt).
- Keine vollständige Screenreader-Abdeckung von Plugin-UIs (Community-Plugins sind Drittanbieter-Code, außerhalb der Kontrolle).
- Kein AAA-Konformitätsziel — Zielniveau ist WCAG 2.1 AA.
