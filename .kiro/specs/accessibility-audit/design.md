# Accessibility Audit — Design

## Vorgehen

Wie bei Security Hardening: kein neues Subsystem, sondern Tooling-Einführung + gezielte Retrofits an bestehenden Komponenten. Design gliedert sich nach den Requirements-Bereichen.

## R1: a11y-Test-Infrastruktur

**Standort:** `frontend/package.json` (neue devDependencies), `frontend/eslint.config.js`, `.github/workflows/ci.yml`.

```typescript
// Beispiel: frontend/src/components/__tests__/ConfirmModal.a11y.test.tsx
import { axe } from 'vitest-axe'
import { render } from '@testing-library/react'

test('ConfirmModal hat keine a11y-Verstöße', async () => {
  const { container } = render(<ConfirmModal ... />)
  expect(await axe(container)).toHaveNoViolations()
})
```

Priorität für axe-Tests (nicht alle 110+ Komponenten): `ConfirmModal`, `CommandPalette`, `SettingsPanel`, `FileExplorer`, `TabBar`, `ContextMenu` — die am häufigsten sichtbaren, interaktiven Kern-Widgets.

**ESLint:** `jsx-a11y/recommended` Config-Preset, in `frontend/eslint.config.js` unter den bestehenden Flat-Config-Block ergänzt. Bestehende Verstöße werden nicht in einem Rutsch gefixt — Regeln, die massenhaft (>20 Stellen) anschlagen, werden vorerst auf `warn` statt `error` gesetzt und im Report vermerkt.

**CI:** Kein neuer Job — `vitest`/`jest-axe`-Tests laufen als Teil des bestehenden `npm run test:coverage`-Schritts im Frontend-Job, da sie normale Test-Dateien sind.

## R2: `useFocusTrap`-Hook

**Standort:** `frontend/src/hooks/useFocusTrap.ts`

```typescript
interface UseFocusTrapOptions {
  isActive: boolean
  onEscape?: () => void
  returnFocusOnDeactivate?: boolean // default true
}

function useFocusTrap<T extends HTMLElement>(
  options: UseFocusTrapOptions
): RefObject<T>
```

**Verhalten:**
- Beim Aktivieren: merkt sich `document.activeElement` als "Trigger-Element", fokussiert das erste fokussierbare Kind des Containers (oder ein per `initialFocusRef` angegebenes Element).
- `keydown`-Listener am Container (nicht global am `document`, um Kollisionen zwischen mehreren offenen Layern zu vermeiden): `Tab`/`Shift+Tab` zirkulieren innerhalb der fokussierbaren Elemente (`querySelectorAll` auf Standard-Selektor: `a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])`), `Escape` ruft `onEscape` auf.
- Beim Deaktivieren: Fokus kehrt zum Trigger-Element zurück (`returnFocusOnDeactivate`).

**Migration:** `ConfirmModal.tsx`, `CommandPalette.tsx`, `SettingsPanel.tsx`, `PluginDetailPanel.tsx`, `NewConversation.tsx`, `TemplateSelector.tsx` — jeweils die bestehende manuelle `document`-Keydown-Logik durch den Hook ersetzen, Container-Ref an `useFocusTrap` übergeben. Reihenfolge: `ConfirmModal` zuerst (kleinste, am häufigsten genutzte Komponente — dient als Referenzimplementierung), danach die übrigen.

## R3: Skip-Navigation & Landmarks

**Standort:** `frontend/src/App.tsx` (ganz oben im JSX-Baum, vor `.app`), `frontend/src/App.css`.

```tsx
<a href="#main-content" className="skip-link">Zum Inhalt springen</a>
...
<main id="main-content" className="app-main ...">
```

CSS: `.skip-link` per `position: absolute; left: -9999px` versteckt, bei `:focus` sichtbar (`top: 0; left: 0; z-index: ...`) — Standard-Pattern, keine neue Abhängigkeit.

Toolbar-Landmark: Bewertung im Audit, ob `role="toolbar"` (bestehend) ausreicht oder ein zusätzliches `<header>` sinnvoll ist — keine Vorab-Festlegung, da es von der finalen DOM-Struktur abhängt.

## R4: Tastaturbedienbarkeit

- **StatusBar/TabContent/TrashView:** Audit identifiziert konkret fehlende `role`/`tabIndex`/Keydown-Handler pro interaktivem Element (z. B. klickbare Status-Items, Tab-Close-Buttons), Fixes folgen bestehenden Mustern aus `TabBar.tsx`/`FileExplorer.tsx`.
- **Splitter (SidebarSplitContainer/SidebarPanelTabBar):** `role="separator" aria-orientation="vertical" aria-valuenow={currentWidth} aria-valuemin={min} aria-valuemax={max} tabIndex={0}`, Pfeiltasten-Handler der dieselbe Resize-Logik wie Maus-Drag aufruft (Wiederverwendung von `useResize`-Callback, kein Duplikat).
- **CanvasMinimap:** Falls rein visuelle Redundanz zur Haupt-Canvas (Übersichtskarte ohne eigene Aktionen außer Viewport-Sprung) → `aria-hidden="true"` plus Tastatur-Alternative nur falls Klick-zum-Springen aktuell die einzige Möglichkeit ist, sich zu einer Position zu bewegen (dann bleibt es fokussierbar mit Pfeiltasten).

## R5: Farbkontrast

**Vorgehen:** Kein neues Tool-Setup nötig — Kontrastprüfung der Token-Paare aus `index.css` erfolgt als einmaliger Audit-Task (z. B. mit einem CLI-Kontrastrechner oder Browser-DevTools-Accessibility-Panel), Ergebnis als Tabelle im Report. Nur Verstöße werden angepasst, Token-Werte bleiben ansonsten unverändert um das bestehende Theme nicht zu verwässern.

## R6: Canvas/Graph-Alternative

- **GraphView:** `aria-label` auf `<svg>`-Root, z. B. `aria-label={\`Graph mit ${nodeCount} Knoten und ${edgeCount} Kanten\`}` — dynamisch aus vorhandenem State berechnet, kein neuer Datenpfad nötig.
- **CanvasView:** `role="application"` bleibt, aber: dokumentierte Tastatur-Alternative wird ergänzt — `Tab` bewegt Fokus zwischen Canvas-Nodes (nutzt bestehende Node-Liste aus dem Canvas-State), `Enter`/`Space` öffnet den fokussierten Node, Pfeiltasten verschieben den Viewport. Umfang: Grundgerüst (Node-Fokus-Reihenfolge + Öffnen), nicht vollständiges Drag/Resize per Tastatur (das wäre eigener Scope).

## R7: 200%-Zoom

Manueller Check (Browser-Zoom 200%) auf Editor, Sidebar, Settings-Panel — kein automatisiertes Tool. Ergebnis fließt in Report; Fixes nur bei kritischen Brüchen (z. B. abgeschnittene, nicht erreichbare Buttons).

## R8: Screenreader-Test

Manueller Durchlauf (NVDA unter Windows, da Entwicklungsumgebung Windows ist) über die in R8.1 genannten Kernflows, Notizen direkt in `ACCESSIBILITY-AUDIT.md`.

## Testing

- R1: Neue axe-Tests laufen grün in bestehender Test-Suite.
- R2: Manuelle Tab/Shift-Tab/Escape-Prüfung pro migriertem Dialog (kein Tab-Leak, Fokus-Rückgabe funktioniert).
- R4: Tastatur-only Durchlauf durch Sidebar-Resize, StatusBar, TrashView.
- R6: Tab-Navigation durch Canvas-Nodes manuell verifiziert.

## Offene Entscheidungen

1. **`vitest-axe` vs. `jest-axe`**: Projekt nutzt Vitest — `vitest-axe` ist der natürliche Fit, falls es Kompatibilitätsprobleme gibt, Fallback auf direkten `axe-core`-Aufruf ohne Wrapper-Lib.
2. **`jsx-a11y`-Regelstrenge**: Start mit `warn` für lauten Regeln, schrittweise Verschärfung nach diesem Pass — vermeidet einen Big-Bang-Fix von hunderten Stellen in einem Feature.
