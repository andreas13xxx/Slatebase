# Responsive/Mobile — Design

## Architektur-Übersicht

Kein neues Subsystem — Erweiterung des bestehenden App-Shells (`App.tsx`/`App.css`) um Breakpoint-Logik, plus Migration der Canvas-Interaktion von Maus- auf Pointer-Events. Zwei neue kleine Utilities (`useMediaQuery`-Hook, Breakpoint-Konstanten), keine neue Library-Abhängigkeit (kein `react-zoom-pan-pinch`, keine PWA-Plugin-Library für das minimale Manifest).

```
frontend/src/
  hooks/
    useMediaQuery.ts        (neu)
  styles/
    breakpoints.css         (neu, oder Ergänzung in index.css) — CSS Custom Properties + Media-Query-Konstanten als Kommentar-Referenz
  App.tsx                   (erweitert: Breakpoint-abhängiges Overlay-Verhalten für Sidebar/Right-Panel)
  App.css                   (erweitert: @media-Blöcke für Mobile/Tablet)
  components/canvas/
    CanvasView.tsx           (erweitert: Pointer-Events statt Mouse-Events, Pinch-to-Zoom)
    useNodeDrag.ts            (erweitert: Pointer-Events)
    useNodeResize.ts          (erweitert: Pointer-Events)
  hooks/
    useResize.ts              (erweitert: Pointer-Events, größere Touch-Trefferfläche)
  editor/live-preview/
    (Ergänzung: visualViewport-Handling)
  public/
    manifest.json             (neu)
```

## R1: Breakpoint-System

**Konstanten** (`frontend/src/hooks/useMediaQuery.ts`):

```typescript
export const BREAKPOINTS = {
  mobile: 767,   // <768px
  tablet: 1024,  // 768–1024px
} as const

export function useMediaQuery(query: string): boolean {
  // matchMedia-Subscription, SSR-safe (kein window-Zugriff beim ersten Render falls relevant — hier nicht, da reine CSR-App)
}

export function useBreakpoint(): 'mobile' | 'tablet' | 'desktop' {
  const isMobile = useMediaQuery(`(max-width: ${BREAKPOINTS.mobile}px)`)
  const isTablet = useMediaQuery(`(max-width: ${BREAKPOINTS.tablet}px)`)
  return isMobile ? 'mobile' : isTablet ? 'tablet' : 'desktop'
}
```

CSS-Seite: dieselben Zahlenwerte als `@media (max-width: 767px)`/`@media (max-width: 1024px)` in `App.css` — Werte an einer Stelle (Kommentar-Header in `App.css`) referenziert, um Drift zwischen JS- und CSS-Breakpoints zu vermeiden.

**Verhältnis zu `platform-detection.ts`:** `useBreakpoint()` misst Fensterbreite (Layout-Entscheidung), `Platform.isPhone/isTablet` misst physisches Gerät (Interaktions-Entscheidung, z. B. "biete Pinch-Geste an"). Ein Desktop-Browser im schmalen Fenster ist `breakpoint: mobile`, aber `Platform.isPhone: false` — beide Signale bleiben getrennt und werden dort verwendet, wo sie inhaltlich hingehören (Layout vs. Touch-Fähigkeit).

## R2/R3: Mobile & Tablet Layout

**`App.tsx`-Änderung:** `useBreakpoint()` wird im `AppContent`-Component konsumiert. Bei `mobile`:
- `app-sidebar`/`app-right-panel` erhalten zusätzliche CSS-Klasse `app-sidebar--overlay` (Position `fixed`, `z-index` über Content, `transform: translateX(-100%)` wenn geschlossen / `translateX(0)` wenn offen, CSS-Transition).
- Backdrop-`<div>` wird bei offenem Overlay gerendert, `onClick` schließt (nutzt bestehenden `showSidebar`/`showRightPanel`-State aus `App.tsx`, kein neuer State).
- `useResize`-Drag-Handles werden bei `mobile` nicht gerendert (Overlay hat CSS-definierte Breite, z. B. `min(85vw, 320px)`, kein Nutzer-Resize).

Bei `tablet`: Struktur bleibt wie Desktop, aber CSS-`@media`-Block reduziert Default-Breiten (z. B. Sidebar 220px statt 260px) — reine CSS-Anpassung, kein JS-Verzweigung nötig, da `useResize`-Grenzen (`min`/`max`) das ohnehin abfedern.

## R4: Canvas Touch-Interaktion

**Migration Mouse → Pointer Events** in `CanvasView.tsx`:

```typescript
// vorher: onMouseDown, onMouseMove, onMouseUp
// nachher: onPointerDown, onPointerMove, onPointerUp
// + e.currentTarget.setPointerCapture(e.pointerId) beim Down, damit Move/Up auch außerhalb des Elements ankommen
```

**Pinch-to-Zoom:** Ein `Map<pointerId, {x, y}>` trackt aktive Pointer. Bei zwei aktiven Pointern wird statt Pan der Abstand zwischen den beiden Punkten verglichen (`getDistance(p1, p2)`); Abstandsänderung skaliert `zoom` analog zur bestehenden `handleWheel`-Logik (gleiche `MIN_ZOOM`/`MAX_ZOOM`-Clamps, gleiche `SET_VIEWPORT`-Action im Reducer — kein neuer State-Pfad).

**Ein-Finger-Pan:** Einzelner Pointer mit `pointerType === 'touch'` pant direkt (kein Mitteltaste-Erfordernis wie bei Maus) — Unterscheidung über `e.pointerType`, sodass Maus-Verhalten (Mitteltaste/Space+Drag für Pan, Linksklick für Selektion) unverändert bleibt.

**Node-Drag/-Resize:** `useNodeDrag.ts`/`useNodeResize.ts` bekommen dieselbe Pointer-Events-Migration, gleiches Capture-Pattern.

## R5: Touch-freundliche Resize-Handles

`useResize.ts`: `onMouseDown` → `onPointerDown` (mit `setPointerCapture`), Hit-Area des Handle-`<div>` per CSS auf effektiv ≥44px vergrößert (z. B. `::after`-Pseudo-Element mit größerem unsichtbaren Hit-Bereich, visuelle Breite bleibt schmal) — Standard-CSS-Pattern, kein neues Element im DOM nötig.

## R6: Editor Mobile-Kompatibilität

**`visualViewport`-Handling:** Listener auf `window.visualViewport.resize`/`scroll` (falls API verfügbar, sonst kein-op — progressive enhancement), passt bei fokussiertem Editor den sichtbaren Container-Bereich an, damit der Cursor nicht hinter der virtuellen Tastatur verschwindet. Standort: neuer kleiner Hook `frontend/src/editor/live-preview/useVisualViewport.ts`, im Editor-Root-Component konsumiert.

## R7: PWA-Manifest

```json
{
  "name": "Slatebase",
  "short_name": "Slatebase",
  "display": "standalone",
  "start_url": "/",
  "theme_color": "#...",
  "background_color": "#...",
  "icons": [ ... aus vorhandenem frontend/public/icons.svg abgeleitet, PNG-Export nötig ... ]
}
```

Verlinkt via `<link rel="manifest" href="/manifest.json">` in `frontend/index.html`. Kein Service-Worker — reines Installier-Manifest (siehe Abgrenzung in Requirements).

## Testing

- R2/R3: Browser-DevTools-Device-Emulation bei 375px/768px/1024px/1440px — Sidebar-Overlay-Verhalten, Backdrop-Klick, Content-Breite.
- R4: Touch-Emulation (DevTools) für Pinch (simuliert via Ctrl+Wheel in Chrome-DevTools-Touch-Modus) und Ein-Finger-Pan; zusätzlich manueller Test auf echtem Tablet/Phone falls verfügbar.
- R4 Regression: Bestehende Maus-Interaktion (Mitteltaste-Pan, Wheel-Zoom, Node-Drag mit Maus) nach Migration erneut verifizieren.
- R6: DevTools-Mobile-Emulation mit simulierter virtueller Tastatur (oder echtes Gerät) — Cursor bleibt sichtbar.
- R7: `manifest.json` via Chrome DevTools Application-Panel validieren ("Installierbar"-Check).

## Offene Entscheidungen

1. **Tablet-Right-Panel-Default:** Automatisch eingeklappt vs. wie Desktop offen — Empfehlung: automatisch eingeklappt beim ersten Erreichen dieser Breite, aber nutzerdefiniert überschreibbar (gleicher Persistenz-Mechanismus wie bestehender `showRightPanel`-State).
2. **PWA-Icons:** `frontend/public/icons.svg` existiert als SVG — für `manifest.json` werden PNG-Exports in mehreren Größen (192×192, 512×512) benötigt; Erzeugung außerhalb des Scopes dieser Spec falls kein Build-Schritt dafür existiert (ggf. einmaliger manueller Export).
