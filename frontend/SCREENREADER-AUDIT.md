# Screenreader-Audit (NVDA) — Statische Analyse

> **Hinweis:** Dieses Dokument basiert auf einer statischen Analyse der ARIA-Markup-Struktur
> und Tastatur-Flows. Es simuliert, was NVDA bei einem manuellen Durchlauf der Kernflows
> ankündigen und wie es sich verhalten würde. Eine vollständige Validierung erfordert manuelle
> Tests mit assistiver Technologie und eine fachkundige Barrierefreiheitsprüfung.

**Datum:** 2026-08-08  
**Methode:** Statische Code-Analyse der ARIA-Attribute, Rollen, Landmarks, Fokus-Management und Live-Regions  
**Prüfgrundlage:** WCAG 2.1 AA, WAI-ARIA 1.2, NVDA-Verhalten (Browse/Focus Mode)

---

## 1. Login-Flow (`LoginPage.tsx`, `ChangePasswordPage.tsx`)

### Erwartetes NVDA-Verhalten

| Element | NVDA-Ansage (erwartet) |
|---------|------------------------|
| Seite laden | Kein Landmark angekündigt (kein `<main>` auf Login-Seite — diese existiert außerhalb des Haupt-Layouts) |
| Logo | Dekorativ (nicht angekündigt, da kein `alt`/`aria-label`) |
| Username-Feld | "Benutzername, Eingabefeld, editierbar" — `<label htmlFor>` korrekt verknüpft |
| Password-Feld | "Passwort, Eingabefeld, geschützt" — `<label htmlFor>` korrekt verknüpft |
| Validierungsfehler | `role="alert"` + `aria-describedby` → automatische Ankündigung bei Erscheinen |
| `aria-invalid` | "Ungültig" wird am Feld angekündigt |
| Rate-Limit-Fehler | `role="alert"` → sofortige Ansage |
| Session-Expired-Banner | `role="alert"` → wird bei Seitenaufruf angesagt |
| Submit-Button | "Anmelden, Schaltfläche" / "Wird angemeldet…, Schaltfläche, deaktiviert" |
| Version | Dekorativer Text, nicht interaktiv |

### Bewertung

**Sehr gut.** Der Login-Flow ist vorbildlich umgesetzt:
- Alle Formularfelder haben explizite `<label>`-Elemente mit `htmlFor`
- Fehlermeldungen verwenden `role="alert"` für sofortige Ankündigung
- `aria-invalid` + `aria-describedby` verknüpfen Fehler mit den Feldern
- `autoComplete`-Attribute unterstützen Passwort-Manager
- `autoFocus` auf dem Username-Feld setzt den initialen Fokus korrekt

**Probleme:** Keine signifikanten Probleme identifiziert.

### ChangePasswordPage

Identisches Muster: `<label htmlFor>`, `aria-invalid`, `aria-describedby`, `role="alert"` für Fehlermeldungen. Drei Felder (aktuelles/neues/bestätigtes Passwort) alle korrekt gelabelt.

---

## 2. Datei-öffnen-Flow (FileExplorer → TabBar → TabContent)

### 2.1 FileExplorer (`FileExplorer.tsx`, `TreeNode.tsx`)

#### Erwartetes NVDA-Verhalten

| Element | NVDA-Ansage (erwartet) |
|---------|------------------------|
| Container | "File explorer, Navigation" (via `<nav aria-label="File explorer">`) |
| Baumstruktur | "Baum" (via `role="tree"` auf `<ul>`) |
| Vault-Eintrag | "[Vault-Name], Umschalter, [eingeklappt/ausgeklappt]" (via `aria-expanded`) |
| Ordner | "[Ordner-Name], Umschalter, [eingeklappt/ausgeklappt]" |
| Datei | "[Datei-Name], Schaltfläche" (via `<button>`) |
| Aktuell geöffnet | `aria-current="true"` → "aktuell" wird angekündigt |
| Favorit-Stern | "Als Favorit markieren / Favorit entfernen, Schaltfläche" |
| Gruppen | `role="group"` für verschachtelte Listen |
| Vault erstellen (Fehler) | `role="alert"` auf Validierungsfehler |

#### Bewertung

**Gut.** Das Tree-Pattern ist korrekt implementiert mit:
- `role="tree"` auf dem Container
- `role="group"` für Kinder-Listen
- `aria-expanded` auf Ordner-Toggles
- Chevron-Icons mit `aria-hidden="true"`

**Probleme:**

| # | Schweregrad | Problem |
|---|-------------|---------|
| F1 | Mittel | Ordner/Vault-Einträge verwenden `<button>` mit `aria-expanded`, aber nicht `role="treeitem"` — NVDA sagt "Schaltfläche" statt "Baumelement". Der äußere `<li>` bekommt die `treeitem`-Semantik implizit nur wenn er selbst `role="treeitem"` hat |
| F2 | Niedrig | Favorit-Stern hat `tabIndex={-1}` und `role="button"` auf einem `<span>`, ist also nur per Maus erreichbar. Kein Tastaturzugriff ohne explizites Fokussieren |
| F3 | Niedrig | Vault-Tooltip (Statistics) wird über `title`-Attribut bereitgestellt — NVDA liest `title` nur inkonsistent vor |

### 2.2 TabBar (`TabBar.tsx`)

#### Erwartetes NVDA-Verhalten

| Element | NVDA-Ansage (erwartet) |
|---------|------------------------|
| Container | "Registerkartenliste" (via `role="tablist" aria-label`) |
| Tab | "[Dateiname], Registerkarte, [ausgewählt/nicht ausgewählt]" |
| Tab-Modus-Umschalter | "[Bearbeitungsmodus/Lesemodus], Schaltfläche" (via `aria-label`) |
| Close-Button | "[Dateiname] schließen, Schaltfläche" (via `aria-label`) |

#### Bewertung

**Gut.** Korrekte Implementierung des Tab-Patterns:
- `role="tablist"` mit `aria-label`
- `role="tab"` + `aria-selected` auf jedem Tab
- `tabIndex={0}` nur auf aktivem Tab, `tabIndex={-1}` auf inaktiven
- Schließ-Buttons haben beschreibende `aria-label`

**Probleme:**

| # | Schweregrad | Problem |
|---|-------------|---------|
| T1 | Niedrig | Kein `aria-controls` auf den Tabs, das auf das zugehörige `tabpanel` verweist (informativ, nicht kritisch) |
| T2 | Niedrig | Tabs sind per DnD umsortierbar, aber keine Tastatur-Alternative für Drag&Drop (Reihenfolge-Änderung nur per Maus) |

### 2.3 TabContent (`TabContent.tsx`)

#### Erwartetes NVDA-Verhalten

| Element | NVDA-Ansage (erwartet) |
|---------|------------------------|
| Container | "Registerkartenbereich, [Dateiname]" (via `role="tabpanel" aria-label`) |
| Ladezustand | "Wird geladen…" via `role="status" aria-live="polite"` |
| Fehler | Fehlermeldung via `role="alert"` |
| Leer | "Keine Datei geöffnet" im tabpanel |

#### Bewertung

**Sehr gut.** Alle Zustände (leer, laden, Fehler, Inhalt) haben korrekte ARIA-Semantik. Jeder Zustand bekommt `role="tabpanel"` mit beschreibendem `aria-label`.

---

## 3. Datei-bearbeiten-Flow (`EditMode.tsx`, `CodeMirrorEditor.tsx`)

### Erwartetes NVDA-Verhalten

| Element | NVDA-Ansage (erwartet) |
|---------|------------------------|
| Nur-Lesen-Banner | `role="status"` → "Schreibgeschützt: Sie haben nur Leserechte" |
| Status (speichern/Fehler) | `role="status"` / `role="alert"` — wird bei Änderung angesagt |
| CodeMirror-Editor | CM6 hat eingebauten Screenreader-Support: `aria-multiline`, `contenteditable`, `aria-label="Code Editor"` auf `.cm-content` |

### CodeMirror 6 Screenreader-Integration

CM6 bietet native Screenreader-Unterstützung:
- `.cm-content` hat `role="textbox"` und `aria-multiline="true"`
- Eine versteckte `aria-live="polite"` Region (`cm-announce`) kündigt Cursor-Position, Selektion und Autocomplete an
- Tab/Shift+Tab funktioniert standardmäßig innerhalb des Editors
- `Escape` verlässt den Editor-Fokus

### Bewertung

**Gut.** CM6 bringt eigene a11y-Features mit. Die Wrapping-Komponente (`CodeMirrorEditor.tsx`) hat keine eigenen ARIA-Attribute, verlässt sich aber korrekt auf CM6's eingebaute Unterstützung.

**Probleme:**

| # | Schweregrad | Problem |
|---|-------------|---------|
| E1 | Niedrig | Kein explizites `aria-label` auf dem äußeren Editor-Container, das den Dateinamen kommuniziert — NVDA-Nutzer wissen möglicherweise nicht, welche Datei sie bearbeiten (Info kommt nur über TabBar) |
| E2 | Info | DropZone-Overlay (Datei-Upload per Drag) hat keine textuelle Beschreibung für Screenreader — rein visuelles Feedback. Für Screenreader irrelevant, da DnD ohnehin nicht per SR bedienbar |

---

## 4. Sidebar-Navigation

### 4.1 SidebarToolbar (`SidebarToolbar.tsx`)

#### Erwartetes NVDA-Verhalten

| Element | NVDA-Ansage (erwartet) |
|---------|------------------------|
| Container | "Werkzeugleiste, Symbolleiste" (via `role="toolbar" aria-label="Werkzeugleiste"`) |
| Buttons | "[Label], Schaltfläche" / "[Label], Schaltfläche, deaktiviert" |
| Chat-Badge | "[N] ungelesene Nachrichten" (via `aria-label` auf Badge) |
| Separator | `aria-hidden="true"` → nicht angekündigt |
| Plugin-Ribbon-Icons | Abhängig von Plugin-Implementierung |

#### Bewertung

**Sehr gut.** Alle Buttons haben `aria-label`, deaktivierte Buttons haben `disabled`-Attribut. Korrekte `role="toolbar"` Semantik.

### 4.2 Sidebar-Panel (`SidebarPanel/`)

#### Erwartetes NVDA-Verhalten

| Element | NVDA-Ansage (erwartet) |
|---------|------------------------|
| Tab-Leiste | "Sidebar-Panel Ansichten, Registerkartenliste" |
| Tabs | "[Label], Registerkarte, [ausgewählt]" |
| Resize-Handle | "Bereichsgröße anpassen, Trennlinie" |
| Recent Files | "Zuletzt geöffnet, Region" |
| Favorites | "Favoriten, Region" |

#### Bewertung

**Gut.** Korrekte Implementierung:
- `role="tablist"` + `role="tab"` + `aria-selected` + `aria-label`
- `role="separator"` mit `aria-valuenow/min/max` + `tabIndex={0}` + Tastatursteuerung
- `role="region"` mit `aria-label` für Inhaltsbereiche
- `role="list"` auf Listen-Containern

### 4.3 Sidebar-Resize (`App.tsx`)

#### Erwartetes NVDA-Verhalten

| Element | NVDA-Ansage (erwartet) |
|---------|------------------------|
| Resize-Handle | "Breite anpassen, Trennlinie, vertikal, Wert [N]" |

#### Bewertung

**Sehr gut.** Korrekte `role="separator"` Implementierung mit:
- `aria-orientation="vertical"`
- `aria-valuenow`, `aria-valuemin`, `aria-valuemax`
- `aria-label`
- `tabIndex={0}` für Fokussierbarkeit
- Keyboard-Handler (`onKeyDown`) für Pfeiltasten

---

## 5. Settings-Flow (`SettingsPanel.tsx`, `SettingsNavList.tsx`)

### Erwartetes NVDA-Verhalten

| Element | NVDA-Ansage (erwartet) |
|---------|------------------------|
| Overlay | "Einstellungen, Dialog" (via `role="dialog" aria-modal="true" aria-label`) |
| Schließen-Button | "Einstellungen schließen, Schaltfläche" |
| Navigation | "Einstellungen-Navigation, Navigation" (via `role="navigation" aria-label`) |
| Nav-Buttons | "[Abschnitt-Name], Schaltfläche" / "aktuell, [Name], Schaltfläche" |
| Inhalt | "Einstellungen-Inhalt, Haupt" (via `role="main" aria-label`) |
| Mobile-Toggle | `aria-expanded` + `aria-controls` |
| Formularelemente | Abhängig von Abschnitt (Toggle, Inputs) |

### Bewertung

**Sehr gut.** Vorbildliche Dialog-Implementierung:
- `role="dialog"` + `aria-modal="true"` + `aria-label`
- `useFocusTrap` verhindert Tab-Leak
- Fokus-Rückgabe beim Schließen
- `Escape` schließt den Dialog
- Interne Navigation mit `aria-current="page"` + Tastatursteuerung (Pfeiltasten)
- Deaktivierte Vault-Abschnitte korrekt mit `disabled`

**Probleme:**

| # | Schweregrad | Problem |
|---|-------------|---------|
| S1 | Niedrig | `role="main"` innerhalb eines `role="dialog"` ist semantisch fragwürdig — Landmarks innerhalb von Dialogen werden von manchen Screenreadern ignoriert. Besser: `role="region"` |

---

## 6. Übergreifende Infrastruktur

### 6.1 Skip-Link

`<a href="#main-content" className="skip-link">` ist als erstes fokussierbares Element implementiert. NVDA-Nutzer hören "Zum Inhalt springen, Link" beim ersten Tab. Springt korrekt zum `<main id="main-content">`.

**Status:** Korrekt implementiert.

### 6.2 Landmarks

| Landmark | Element | Ort |
|----------|---------|-----|
| `<main>` | `id="main-content"` | Hauptinhaltsbereich (`App.tsx`) |
| `<aside>` | Sidebar links | `App.tsx` |
| `<aside>` | Context-Panel rechts | `App.tsx` |
| `<nav>` | File Explorer | `FileExplorer.tsx` |
| `toolbar` | SidebarToolbar | `SidebarToolbar.tsx` |
| `contentinfo` | StatusBar | `StatusBar.tsx` |

NVDA-Landmark-Navigation (D-Taste) findet: main, 2x complementary (aside), navigation, toolbar, contentinfo. Ausreichend für Orientierung.

### 6.3 Focus-Management (useFocusTrap)

Implementiert und integriert in:
- `ConfirmModal.tsx`
- `CommandPalette.tsx`
- `SettingsPanel.tsx`
- `PluginDetailPanel.tsx`
- `NewConversation.tsx`
- `TemplateSelector.tsx`

Verhindert Tab-Leak, stellt Fokus beim Schließen wieder her.

### 6.4 Live-Regions

Konsistente Verwendung:
- `role="alert"` für Fehlermeldungen (sofortige Ankündigung)
- `role="status" aria-live="polite"` für Ladezustände (höfliche Ankündigung)
- `ToastNotification`: `aria-live="polite"` Container + `role="alert"` auf individuellen Toasts
- `ConnectionIndicator`: `role="status"` für Verbindungsstatus

### 6.5 Command Palette (`CommandPalette.tsx`)

**Exzellent.** Vollständiges Combobox-Pattern:
- `role="dialog" aria-modal="true"`
- `role="combobox"` auf dem Input
- `aria-expanded`, `aria-controls`, `aria-activedescendant`, `aria-autocomplete="list"`
- `role="listbox"` + `role="option"` + `aria-selected` auf den Ergebnissen
- `useFocusTrap` für Fokus-Einschluss

### 6.6 Context Menu (`ContextMenu.tsx`)

**Gut.** Korrektes Menü-Pattern:
- `role="menu"` + `aria-label`
- `role="menuitem"` auf Items
- `role="separator"` für Trennlinien
- `aria-disabled` auf deaktivierten Items
- Tastaturnavigation (Pfeiltasten)

---

## 7. Weitere Komponenten

### 7.1 GraphView (`GraphView.tsx`)

- SVG hat `role="img"` + dynamisches `aria-label` mit Knoten-/Kanten-Anzahl
- Lade-/Fehlerzustände mit `role="status"`/`role="alert"`
- SVG-Inhalte (Knoten, Kanten) sind für Screenreader nicht einzeln navigierbar (akzeptabel — es gibt textuelle Zusammenfassung)

### 7.2 CanvasView (`canvas/CanvasView.tsx`)

- `role="application"` + `aria-label="Canvas-Ansicht"` + `tabIndex={0}`
- `CanvasMinimap`: `aria-hidden="true"` (korrekt als redundant markiert)
- Grid: `aria-hidden="true"`

**Probleme:**

| # | Schweregrad | Problem |
|---|-------------|---------|
| C1 | Mittel | `role="application"` entzieht NVDA die Browse-Mode-Navigation. Tastaturalternative (Tab zwischen Nodes, Enter zum Öffnen) war in Task 20 geplant, aber die Implementierung ist in der aktuellen Codebase nicht sichtbar (kein `tabIndex`/`aria-label` auf einzelnen Nodes). NVDA-Nutzer landen in einem Bereich ohne navigierbare Elemente |
| C2 | Niedrig | Keine textuelle Zusammenfassung des Canvas-Inhalts (im Gegensatz zum Graph mit Knoten-/Kantenanzahl) |

### 7.3 StatusBar (`StatusBar.tsx`)

- `<footer role="contentinfo" aria-label>`
- Uhr: `aria-live="off"` (verhindert ständige Ankündigungen) + `aria-label`
- Plugin-Items: `role="group" aria-label`

**Gut implementiert.**

### 7.4 TrashView (`TrashView.tsx`)

- `aria-label="Papierkorb"` auf Container
- Ladezustand: `role="status" aria-live="polite"`
- Leerzustand: `role="status" aria-live="polite"`
- Liste: `role="list" aria-label="Gelöschte Dateien"`
- Aktions-Buttons: Explizite `aria-label` mit Dateiname
- Icons: `aria-hidden="true"`
- Aktionsgruppen: `role="group" aria-label`

**Sehr gut implementiert.**

---

## 8. Zusammenfassung der Findings

### Nach Schweregrad

| Schweregrad | Anzahl | IDs |
|-------------|--------|-----|
| Hoch | 0 | — |
| Mittel | 2 | F1, C1 |
| Niedrig | 6 | F2, F3, T1, T2, E1, S1 |
| Info | 1 | E2 |

### Detailliste

| ID | Schweregrad | Komponente | Problem | Status |
|----|-------------|------------|---------|--------|
| F1 | Mittel | FileExplorer/TreeNode | Tree-Items fehlt explizites `role="treeitem"` auf den interaktiven Elementen — NVDA sagt "Schaltfläche" statt "Baumelement" | Backlog |
| F2 | Niedrig | TreeNode | Favorit-Stern nur per Maus erreichbar (`tabIndex={-1}`) | Backlog |
| F3 | Niedrig | FileExplorer | Vault-Statistik-Tooltip nur via `title` (inkonsistent in Screenreadern) | Akzeptiert |
| T1 | Niedrig | TabBar | Fehlendes `aria-controls` auf Tabs → tabpanel Verknüpfung | Backlog |
| T2 | Niedrig | TabBar | Tab-Reihenfolge nur per DnD änderbar (keine Tastatur-Alternative) | Backlog |
| E1 | Niedrig | EditMode | Kein `aria-label` mit Dateiname auf Editor-Container | Backlog |
| E2 | Info | EditMode | DropZone hat keine SR-Alternative (irrelevant für SR-Nutzer) | Akzeptiert |
| S1 | Niedrig | SettingsPanel | `role="main"` innerhalb von `role="dialog"` semantisch fragwürdig | Backlog |
| C1 | Mittel | CanvasView | `role="application"` ohne funktionale Tastatur-Alternative für Node-Navigation | Backlog |
| C2 | Niedrig | CanvasView | Keine textuelle Canvas-Zusammenfassung für SR | Backlog |

### Positiv-Highlights

1. **Login/Passwort-Flows**: Vorbildlich — vollständige Label/Error/Validation-ARIA
2. **Dialog-Pattern**: `useFocusTrap` konsistent in allen Modals, kein Tab-Leak
3. **Live-Regions**: Durchgängig korrekte Nutzung von `role="alert"` und `role="status"`
4. **TabBar + TabContent**: Korrektes `tablist`/`tab`/`tabpanel`-Pattern
5. **Command Palette**: Vollständiges ARIA-Combobox-Pattern
6. **Landmarks**: Sinnvolle Landmark-Struktur (main, aside, nav, toolbar, contentinfo)
7. **Skip-Link**: Korrekt implementiert
8. **Resize-Handles**: `role="separator"` mit Wert-Attributen und Tastatursteuerung
9. **Toast-Benachrichtigungen**: `aria-live="polite"` Container mit `role="alert"` auf Items
10. **StatusBar**: Clock mit `aria-live="off"` verhindert ständige Ankündigungen

---

## 9. Empfehlungen für manuellen NVDA-Test

Die folgende Checkliste sollte bei einem echten NVDA-Test durchlaufen werden:

### Kern-Testschritte

1. **Login**: Tab durch Formular, Fehler provozieren, prüfen ob Alerts angesagt werden
2. **Skip-Link**: Tab auf erstem Element der Seite, Enter, prüfen ob Fokus zu `<main>` springt
3. **Landmark-Navigation**: NVDA+D durch Landmarks navigieren
4. **FileExplorer**: Vault expandieren, Ordner öffnen, Datei auswählen — prüfen ob Baumstruktur erkannt wird
5. **TabBar**: Zwischen Tabs navigieren (Links/Rechts-Pfeiltasten im Focus Mode)
6. **Editor**: In CM6-Editor navigieren, Text eingeben, prüfen ob `cm-announce` Region funktioniert
7. **Command Palette**: Ctrl+P, Befehle suchen, prüfen ob `activedescendant` korrekt umschaltet
8. **Settings**: Ctrl+,, Navigation durch Sidebar (Pfeiltasten), Abschnitte wechseln, Dialog schließen (Escape)
9. **Toast**: Aktion auslösen (z.B. Datei speichern), prüfen ob Toast angesagt wird
10. **ContextMenu**: Rechtsklick auf Datei, prüfen ob Menü-Pattern korrekt angekündigt wird

### Bekannte Einschränkungen

- **Canvas**: `role="application"` erfordert manuelle Prüfung der tatsächlichen Tastaturinteraktion
- **Plugin-UI**: Community-Plugins liefern eigene DOM-Strukturen — nicht im Scope
- **CodeMirror**: CM6's eingebauter SR-Support variiert zwischen SR-Versionen — manuelle Verifikation empfohlen

---

## 10. Gesamtbewertung

**Status: Gut (WCAG 2.1 AA weitgehend erfüllt)**

Die ARIA-Infrastruktur von Slatebase ist solide. Die häufigsten Interaktionsmuster (Formulare, Dialoge, Tabs, Bäume, Menüs) sind korrekt implementiert. Live-Regions für Statusänderungen und Fehler sind durchgängig vorhanden. Das Focus-Management mit `useFocusTrap` ist konsistent.

Die identifizierten Probleme betreffen:
- Keine kritischen Barrieren für die Kernflows (Login, Datei öffnen/bearbeiten, Navigation, Settings)
- Mittlere Probleme nur in spezialisierten Bereichen (Canvas, FileExplorer-Semantik)
- Niedrige Probleme sind größtenteils informativer Natur

Für eine vollständige WCAG 2.1 AA-Konformitätserklärung ist ein manueller Test mit NVDA unerlässlich, insbesondere für die tatsächliche CM6-Interaktion und das Canvas-Verhalten mit `role="application"`.
