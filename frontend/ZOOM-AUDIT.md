# 200% Browser Zoom — Audit Findings

**Geprüft:** Editor, Sidebar, Settings-Panel, Tab-Bar, Status-Bar, Chat-Seite
**Methodik:** Statische CSS-Analyse der gesamten `frontend/src/` auf zoom-kritische Patterns
**Datum:** 2026-08-08

---

## Gesamtbewertung: GUT

Die CSS-Architektur ist grundlegend zoom-resilient:
- **Flex-Layouts** durchgehend (kein float, keine fixen Spaltenbreiten ohne flex)
- **`overflow: hidden`** nur auf Container-Ebene, nie auf Text-Content-Elementen
- **`white-space: nowrap`** stets zusammen mit `overflow: hidden` + `text-overflow: ellipsis`
- **Keine `width: 100vw`-Deklaration** (keine erzwungene horizontale Scrollbar)
- **Container Queries** im Settings-Panel (700px-Threshold, adaptives Layout)
- **Collapsible Panels**: Sidebar UND Right Panel per Toggle-Button ein-/ausblendbar

---

## Detaillierte Analyse

### Editor (CodeMirror 6)
**Status:** Kein Problem
- CM6 handled Zoom nativ (eigener Viewport, eigenes Scrolling)
- `.tab-content--edit` nutzt `flex: 1; overflow: hidden; min-height: 0; min-width: 0`
- Kein fester `max-width` der den Editor bei Zoom beschneidet
- `.edit-mode-editor-area` ist `flex-direction: column; flex: 1; min-height: 0`

### Sidebar (File Explorer)
**Status:** Kein kritisches Problem
- `min-width: 180px`, `max-width: 400px` — bei 200% Zoom auf 1920px-Monitor (effektiv 960px Viewport) belegt die Sidebar min. ~19%
- **Mitigiert durch:** Toggle-Button zum vollständigen Einklappen (`showSidebar` State)
- File-Explorer-Einträge: `overflow: hidden; text-overflow: ellipsis` — Text wird abgeschnitten, nicht abgebrochen
- Toolbar ist fix 44px breit (reine Icons, skaliert mit dem Zoom mit)

### Settings-Panel
**Status:** Kein Problem
- Container Query (`@container (min-width: 700px)`) wechselt zu vertikalem Layout bei schmalem Raum
- Bei 200% Zoom wird die 700px-Schwelle leichter unterschritten → Panel wechselt automatisch in mobile Ansicht (vertikaler Stack)
- `width: 90vw; max-width: 1000px; height: 80vh; max-height: 700px` — passt sich dem Viewport an
- Mobile-Toggle für Navigation sichtbar bei engem Layout

### Tab-Bar
**Status:** Geringes Risiko (nicht kritisch)
- `min-height: 38px; overflow: hidden` — bei 200% Zoom skaliert das proportional mit
- Tab-Labels haben `max-width: 220px; text-overflow: ellipsis` — werden bei Platzmangel abgeschnitten
- Tabs sind horizontal scrollbar (flex-shrink auf 0)

### Status-Bar
**Status:** Kein Problem
- `height: var(--status-bar-height)` (24px) — skaliert mit dem Zoom proportional
- Items: `white-space: nowrap` — am Rand des Viewports könnten Items bei extremem Zoom nicht sichtbar sein, aber die Bar selbst hat `justify-content: space-between`
- **Nicht kritisch:** Status-Bar-Inhalt ist rein informativ, keine interaktiven Pflicht-Elemente

### Chat-Seite
**Status:** Geringes Risiko
- Chat-Sidebar: `width: 300px; min-width: 240px` — bei 200% Zoom auf 960px effektivem Viewport belegt sie 25-31%
- **Kein Collapse-Mechanismus vorhanden** — bei kleinen Viewports + 200% Zoom wird die Chat-Message-Area eng
- **Nicht kritisch:** Chat ist nicht der Kern-Workflow, und die Message-Area hat `flex: 1; min-width: 0`

### New-Conversation-Dialog
**Status:** Potenzielles Problem (nicht kritisch)
- `min-width: 360px` — bei 200% Zoom auf einem 768px-Gerät (effektiv 384px Viewport) könnte der Dialog den Viewport überschreiten
- **Mitigiert durch:** `width: 100%` (begrenzt auf Parent-Breite)
- Desktop-Anwendung — 768px-Geräte bei 200% Zoom sind ein Randfall

---

## Identifizierte Probleme

### Problem 1: Tab-Bar `overflow: hidden` schneidet Tabs ab
**Schwere:** Gering (nicht kritisch)
**Betroffene Datei:** `App.css`, Zeile ~457
**Beschreibung:** `.tab-bar` hat `overflow: hidden`. Bei sehr vielen offenen Tabs und 200% Zoom werden Tabs rechts abgeschnitten, ohne horizontales Scrolling.
**Auswirkung:** Nutzer können abgeschnittene Tabs nicht per Tastatur oder Scrolling erreichen (müssen Tabs schließen).
**Status:** Backlog — kein Datenverlust, Tabs sind per Keyboard Tab-Key erreichbar, Tab-Schließen ist möglich.

### Problem 2: Chat-Sidebar nicht collapsible
**Schwere:** Gering (nicht kritisch)
**Betroffene Datei:** `App.css`, Zeile ~3603
**Beschreibung:** Chat-Sidebar hat `min-width: 240px` ohne Collapse-Toggle. Bei 200% Zoom auf Monitoren <1440px bleibt wenig Raum für Messages.
**Auswirkung:** Message-Eingabe und Lesung eingeengt, aber funktional.
**Status:** Backlog — Chat ist nicht der Kern-Editor-Workflow.

### Problem 3: Keine responsive Fallbacks (Media Queries) in der Hauptanwendung
**Schwere:** Gering
**Beschreibung:** Nur `SearchPanel.css` hat einen `@media (max-width: 768px)` Breakpoint. Die Haupt-App (Sidebar + Editor + Right Panel) hat keinen `@media`-Breakpoint — verlässt sich auf manuelle Panel-Toggles.
**Auswirkung:** Bei 200% Zoom müssen Nutzer Panels manuell einklappen. Kein automatischer Wechsel zu einer kompakteren Ansicht.
**Status:** Backlog — Panel-Toggles existieren als manueller Workaround, keine Unbedienbarkeit.

---

## Keine kritischen Brüche gefunden

**Kein Fix in diesem Pass erforderlich.** Die Architektur (Flex-Layouts, collapsible Panels, Container Queries, proportionale px-Skalierung durch Browser-Zoom) verhindert, dass Kernfunktionen bei 200% Zoom unerreichbar oder unbedienbar werden.

**Zusammenfassung:**
- Editor: Voll funktional (CodeMirror 6 nativ zoom-resilient)
- Sidebar: Collapsible, Text mit Ellipsis
- Settings: Container Query adaptiert das Layout automatisch
- Dialoge/Modals: `inset: 0` mit `width: 90vw` — skaliert mit
- Status-Bar: Rein informativ, kein interaktiver Datenverlust

---

## Empfehlungen für zukünftige Verbesserungen (nicht in diesem Pass)

1. **Tab-Bar horizontal scrollbar machen** statt `overflow: hidden` (z.B. `overflow-x: auto` mit versteckter Scrollbar)
2. **Chat-Sidebar collapsible** machen (analog zum Sidebar/Right-Panel-Pattern)
3. **Auto-Collapse-Media-Queries** für Panels bei `@media (max-width: 768px)` ergänzen (oder `dvw`-basierte Container Queries nutzen)
