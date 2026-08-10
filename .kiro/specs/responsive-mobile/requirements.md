# Responsive/Mobile — Requirements

## Motivation

Slatebase ist heute vollständig auf Desktop/Maus+Tastatur ausgelegt: Der App-Shell (`App.tsx`) rendert einen festen Flex-Layout mit Sidebar, Content und Right-Panel, deren Breiten per Maus-Drag (`useResize`) verändert werden — kein Touch-Support. Es existiert genau ein realer Breakpoint im gesamten Frontend (`SearchPanel.css`, 768px). Canvas-Pan/Zoom ist vollständig maus-/wheel-basiert (kein Pointer-Events, kein Pinch-to-Zoom). Die App hat aber bereits eine `Platform`-Erkennung (`frontend/src/plugins/compat/platform-detection.ts`, `isPhone`/`isTablet`/`isMobile`), die für Obsidian-Plugin-Kompatibilität gebaut wurde, aber vom App-Shell selbst noch nicht genutzt wird.

Ziel: Ein reaktionsfähiges Layout für Tablet (768–1024px) und Mobile (<768px) sowie Touch-Interaktion für die wichtigsten Flows (Sidebar-Navigation, Canvas-Pan/Zoom, Editor). Kein natives Mobile-App-Wrapper, kein Offline-Modus (laut Implementierungsplan bewusst zurückgestellt — Vault-Sync mit Obsidian-Desktop deckt Offline ab).

## Ist-Zustand (Referenz für die Umsetzung)

- **Styling:** Plain CSS, Custom Properties in `App.css`/`index.css`. Einziger bestehender Breakpoint: `SearchPanel.css` (`@media (max-width: 768px)`). CSS-Media-Query-Prefixer existiert bereits für Plugin-CSS (`frontend/src/plugins/compat/css-injector.ts`).
- **Layout-Shell:** `App.tsx` → `.app-vault-layout` (Flex-Row): `<aside class="app-sidebar">` → `<SidebarToolbar>` → `<section class="app-content">` → `<aside class="app-right-panel">`. Resize/Toggle über `useResize` (`frontend/src/hooks/useResize.ts`, reiner Maus-Drag, persistierte Breiten 260px/240px Default) und vorhandene Show/Hide-Buttons (`App.tsx`).
- **Viewport-Meta:** Bereits korrekt gesetzt (`frontend/index.html`), keine Zoom-Einschränkung — bleibt unverändert (Zoom-Fähigkeit ist auch a11y-relevant, siehe `[[accessibility-audit]]`).
- **Touch:** Keine Touch-Handler im gesamten Frontend. `platform-detection.ts` liefert bereits `Platform.isPhone/isTablet/isMobile` via `navigator.maxTouchPoints`/`matchMedia('(pointer: coarse)')`/UA — ungenutzt außerhalb des Plugin-Compat-Layers.
- **Canvas:** Custom Pan/Zoom (`CanvasView.tsx`, kein `react-zoom-pan-pinch`/`d3-zoom`), `onWheel` für Zoom, `onMouseDown/Move/Up` für Pan/Drag/Resize. Kein Pinch-to-Zoom.
- **PWA:** Keine Manifest/Service-Worker/`vite-plugin-pwa`-Konfiguration vorhanden.
- **Editor:** CM6-basiert, keine mobile-spezifische Behandlung (virtuelle Tastatur, `visualViewport`, Selektions-Toolbar).
- **Build:** Vite, kein mobiler Dev/Preview-Modus.

## Funktionale Anforderungen

### R1: Breakpoint-System

- R1.1: Drei Breakpoints werden definiert und konsistent verwendet: Mobile (<768px), Tablet (768–1024px), Desktop (>1024px) — als CSS-Custom-Properties/gemeinsame Konstanten, nicht pro Komponente neu erfunden.
- R1.2: Ein `useMediaQuery`-Hook (`frontend/src/hooks/`) kapselt `window.matchMedia`-Abfragen für JS-seitige Breakpoint-Logik (analog zum bestehenden Pattern in `platform-detection.ts`, aber wiederverwendbar für App-Shell-Layout statt nur Plugin-Compat).
- R1.3: Bestehende `Platform.isPhone/isTablet/isMobile`-Flags aus `platform-detection.ts` werden wo sinnvoll wiederverwendet statt dupliziert (z. B. für grobe Touch-vs-Maus-Unterscheidung), auch wenn sie auf physischer Geräteerkennung statt reiner Fensterbreite basieren — beide Signale ergänzen sich (Breakpoint = Layout, Platform = Interaktionsmodus).

### R2: Mobile Layout (App-Shell)

- R2.1: Unter 768px wird die Sidebar (`app-sidebar`) zu einem Overlay/Drawer, das über die bestehenden Toggle-Buttons ein-/ausgeblendet wird (kein permanent sichtbarer Spalten-Platz mehr).
- R2.2: Das Right-Panel (`app-right-panel`) verhält sich analog — Overlay statt feste Spalte unter 768px.
- R2.3: Ein halbtransparenter Backdrop schließt das Overlay bei Klick/Tap außerhalb.
- R2.4: Content-Bereich (`app-content`) nimmt bei geschlossenem Overlay die volle Breite ein.
- R2.5: Bestehende Resize-Funktionalität (`useResize`) bleibt für Desktop/Tablet unverändert — Mobile-Modus deaktiviert Resize (Overlay hat feste/responsive Breite statt nutzerdefinierter).

### R3: Tablet Layout

- R3.1: Zwischen 768–1024px bleibt die Drei-Spalten-Struktur erhalten, aber mit engeren Default-Breiten und ggf. automatisch eingeklapptem Right-Panel (nutzerdefiniert überschreibbar).

### R4: Touch-Interaktion — Canvas

- R4.1: Canvas-Pan/Zoom wird von reinen Maus-Events auf die Pointer-Events-API migriert (`onPointerDown/Move/Up` statt `onMouseDown/Move/Up`), sodass Maus und Touch denselben Code-Pfad nutzen.
- R4.2: Pinch-to-Zoom wird ergänzt: Zwei aktive Pointer → Abstandsänderung steuert Zoom, analog zur bestehenden Wheel-Zoom-Logik (`MIN_ZOOM`/`MAX_ZOOM`-Grenzen bleiben erhalten).
- R4.3: Ein-Finger-Drag pant die Canvas (Ersatz für Maus-Pan, das aktuell Mitteltaste/Space+Drag braucht — Touch hat keine Mitteltaste).
- R4.4: Node-Drag/-Resize (`useNodeDrag.ts`/`useNodeResize.ts`) wird ebenfalls auf Pointer-Events migriert für Touch-Kompatibilität.

### R5: Touch-freundliche Resize-Handles

- R5.1: Sidebar-/Panel-Resize-Handles (`useResize.ts`) unterstützen zusätzlich zu Maus-Events Touch-Events (Pointer-Events), mit größerer Touch-Zielfläche (mind. 44×44px effektive Trefferfläche, auch wenn visuell schmaler).

### R6: Editor — Mobile-Kompatibilität

- R6.1: Bei Fokus des Editors auf Mobile wird der sichtbare Bereich an die virtuelle Tastatur angepasst (`visualViewport`-API), damit die Cursor-Position nicht hinter der Tastatur verschwindet.
- R6.2: Interaktive Editor-Elemente (Toolbar-Buttons falls vorhanden, Checkbox-Toggles in Markdown) haben ausreichend große Touch-Ziele.

### R7: Optionales PWA-Manifest

- R7.1: Ein minimales `manifest.json` (Name, Icons, `display: standalone`, Theme-Color) wird ergänzt, damit die App "Zum Home-Bildschirm hinzufügen" unterstützt.
- R7.2: Kein Service-Worker/Offline-Caching in diesem Pass (Abgrenzung, siehe unten) — reines Installier-Manifest.

### R8: Cross-Device-Testing

- R8.1: Manuelle Prüfung auf mindestens drei Breakpoint-Repräsentanten (z. B. 375px/768px/1440px) über Browser-DevTools-Device-Emulation für die Kernflows: Datei öffnen/bearbeiten, Sidebar-Navigation, Canvas öffnen und pannen/zoomen, Settings öffnen.
- R8.2: Ergebnisse (inkl. bekannter Einschränkungen) werden dokumentiert.

## Nicht-funktionale Anforderungen

- NF1: Desktop-Verhalten (>1024px) darf durch keine der Änderungen sichtbar regressieren.
- NF2: Viewport-Zoom (Pinch-to-Zoom der ganzen Seite) darf nicht deaktiviert werden (kein `user-scalable=no`/`maximum-scale=1`) — Überschneidung mit `[[accessibility-audit]]` R7.
- NF3: Pointer-Events-Migration bei Canvas darf bestehende Maus-Interaktion (Mitteltaste-Pan, Wheel-Zoom, Rechtsklick-Kontextmenü) nicht brechen.

## Abgrenzung

- Kein Offline-Modus/Service-Worker-Caching — laut Implementierungsplan bewusst zurückgestellt (Vault-Sync mit Obsidian-Desktop deckt Offline-Nutzung ab).
- Kein natives Mobile-App-Wrapper (Capacitor/React Native) — bleibt eine responsive Web-App.
- Kein eigenständiges Mobile-only-UI-Redesign (z. B. Bottom-Navigation) — Anpassung des bestehenden Layouts, kein neues Interaktionsparadigma.
- Volle Touch-Optimierung von Drittanbieter-Plugin-UIs ist nicht Teil dieses Passes (Plugins sind außerhalb der Kontrolle).
