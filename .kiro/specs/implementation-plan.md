# Implementierungsplan — Slatebase Ausstehende Features

**Stand:** 14.08.2026. Security Hardening, Accessibility Audit (Runde 1), **Navigation & Verknüpfungs-Politur** und jetzt auch **UI-Politur (Bookmarks/Statusleiste/CSS-Snippets)** sind abgeschlossen. Kernfeatures sind umgesetzt. Es verbleiben 13 priorisierte offene Spec-Einheiten (decken ~23 Einzelfeatures ab, da mehrere thematisch verwandte Features gebündelt wurden). Zwei davon — **Workspaces/Split-Panes** und **Bases** — waren zuvor als "kein Äquivalent geplant" eingestuft und sind jetzt auf ausdrücklichen Nutzerwunsch in die aktive Roadmap aufgenommen.

**Scope-Korrektur Navigation & Verknüpfungs-Politur:** Die umgesetzte Spec (`.kiro/specs/navigation-link-polish/`) deckt Quick Switcher (wie ursprünglich hier geplant) sowie zusätzlich Navigationsverlauf, Tab-Tastaturkürzel, Live-Backlinks, deterministische Link-Auflösung, Explorer-Auto-Reveal und eine Breadcrumb-Leiste ab — ein sinnvollerer, in sich geschlossener Scope als ursprünglich hier skizziert. Die drei übrigen ursprünglich hier gelisteten Punkte (Lokaler Graph, Ungelinkte Erwähnungen, Automatische Link-Aktualisierung beim Umbenennen/Verschieben) wurden **nicht** mitgeliefert und sind unten als eigener Prio 15 „Graph-Politur & Link-Integrität" weitergeführt.

**Strategie:** Hybrid — Features mit bestehender Spec direkt umsetzen, komplexe Features erst vollständig spezifizieren. Kleinere, thematisch verwandte Features werden zu gemeinsamen Specs gebündelt statt einzeln spezifiziert (siehe Track A und H).

---

## Ausstehende Features — Umsetzungsreihenfolge

| Prio | Feature | Track | Aufwand | Status |
|------|---------|-------|---------|--------|
| 1 | PDF-Export / Drucken | A | ~6–10h | Geplant (keine Spec) |
| ~~2~~ | ~~Navigation & Verknüpfungs-Politur~~ | A | ~~25–35h~~ | ✅ Erledigt (Teil-Scope, siehe unten) |
| ~~3~~ | ~~UI-Politur (Bookmarks/Statusleiste/CSS-Snippets)~~ | A | ~~12–18h~~ | ✅ Erledigt (siehe unten) |
| 4 | Editor-Erweiterungen (Mathe & Medien) | A | ~15–20h | Geplant (keine Spec) |
| 5 | Obsidian Themes | B | ~15–20h | Geplant (keine Spec) |
| 6 | Public Sharing | C | ~15–20h | Geplant (keine Spec) |
| 7 | Responsive/Mobile | F | ~24–34h | Spec vollständig (Req + Design + Tasks) |
| 8 | Properties-Editor & Suchoperatoren | H | ~25–35h | Geplant (keine Spec) |
| 9 | Workspaces & Split-Panes | G | ~60–90h | Geplant (keine Spec) — Nutzerwunsch |
| 10 | Bases | H | ~55–75h | Geplant (keine Spec) — Nutzerwunsch, braucht Prio 8 |
| 11 | Server-Side Plugins | B | ~48–68h | Tasks vorhanden |
| 12 | Fremdformat-Importer | I | ~20–30h | Geplant (keine Spec) |
| 13 | Semantische Suche / AI-Embeddings | E | ~38–58h | Geplant (keine Spec) |
| 14 | Collaborative Editing | D | ~68–88h | Nur Requirements |
| 15 | Graph-Politur & Link-Integrität | A | ~15–24h | Geplant (keine Spec) — Rest-Scope aus Prio 2 |

---

## Abhängigkeiten

```
Track A (Politur):     PDF-Export → Editor-Erweiterungen (Mathe/Medien); Navigation & Verknüpfungs-Politur ✅ → Graph-Politur & Link-Integrität; UI-Politur ✅ (unabhängig erledigt)
Track B (Plugins):     Community Plugin Store ✅ → Obsidian Themes → Server-Side Plugins
Track C (Sharing):     Public Sharing (unabhängig)
Track D (Editor):      Collaborative Editing (braucht Realtime + CM6)
Track E (AI):          Semantische Suche (unabhängig)
Track F (Qualität):    Security Hardening ✅ → Accessibility Audit ✅ → Responsive/Mobile
Track G (Layout):      Responsive/Mobile (empfohlene Vorarbeit) → Workspaces & Split-Panes
Track H (Daten):       Properties-Editor & Suchoperatoren → Bases
Track I (Onboarding):  Fremdformat-Importer (unabhängig)
```

---

## Erledigt — Community Plugin Store (Track B) ✅

**Spec:** `.kiro/specs/community-plugin-store/` — alle 34 Tasks abgeschlossen.

Browse der vollen Community-Liste im Settings-Panel (Text-/Kompatibel-/Installiert-Filter), Installation direkt aus GitHub-Releases, Einzel- + Bulk-Update, Update-Check manuell und automatisch (24h), Download-Zahlen. Sicherheit: Domain-Allowlist (auf jedem Redirect-Hop revalidiert), Size-Limits, Desktop-Only-Gate, Rate-Limit-Tracking, optionaler `SLATEBASE_GITHUB_TOKEN`.

**Nachträgliche Korrektur:** Statistiken kommen aus Obsidians aggregiertem `community-plugin-stats.json` (ein CDN-Request) statt aus `releases/latest` pro Repo — der Fanout hätte das GitHub-Rate-Limit bei ~6000 Plugins sofort erschöpft.

---

## Erledigt — Security Hardening (Track F) ✅

**Spec:** `.kiro/specs/security-hardening/` — alle 22 Tasks abgeschlossen.

OWASP-Top-10-strukturierter Security-Audit (`SECURITY-AUDIT.md`). 9 Findings (1 Medium fixed, 8 Low: 3 fixed, 3 backlog, 3 accepted risk). Wichtigste Ergebnisse:

- **Path Traversal** (Medium, Fixed): `renameContent` erlaubte `..` als `newName` → Vault-Escape. Fix: `validateContentName()` blockiert jetzt `.`/`..` + Defense-in-depth Prefix-Check.
- **CSP vollständig**: `script-src 'self' blob:` (Plugin-Bundles via Blob URL), `style-src 'self' 'unsafe-inline'` (Plugin CSS), `img-src 'self' data: https:`, `connect-src 'self'`, `frame-src 'self' https:`. Kein `unsafe-eval` nötig.
- **Input-Validierung 24/24 Routen**: Zod-Schemas auf allen Route-Modulen (vorher 17/24).
- **CI Dependency Audit**: `npm audit --audit-level=high --omit=dev` in Backend + Frontend Jobs.
- **Plugin-Sandbox dokumentiert**: Proxy-basierte Soft-Isolation, Known-Bypass-Vektoren, Trust-Modell.
- **Startup-Warnungen**: `SLATEBASE_CSRF_SECRET`/`SLATEBASE_SYNC_SECRET` warn-Level bei fehlendem Env-Var.
- **Plugin eval-Warnung**: UI-Bestätigungsschritt bei `hasEvalUsage: true` vor Aktivierung.

**Fix-Backlog (nicht in diesem Pass, siehe Prio 11):** Per-User-Rate-Limiter für `/proxy` + `/shares` + `/search`, echte Plugin-Sandbox-Isolation (Worker/VM statt Proxy-basierter Soft-Isolation) — beides beim `server-side-plugins`-Spec (Prio 11) mit erledigen, nicht als eigener Nachfolge-Pass.

---

## Erledigt — Accessibility Audit (Track F) ✅

**Spec:** `.kiro/specs/accessibility-audit/` — alle 24 Tasks abgeschlossen (2026-08-10).

WCAG-2.1-AA-Audit mit Ist-Zustands-Analyse und gezielten Fixes:

- **Tooling & CI**: `vitest-axe`/`axe-core` als Dev-Dependency, `eslint-plugin-jsx-a11y` (recommended-Preset), axe-Unit-Tests für ConfirmModal/CommandPalette/SettingsPanel/FileExplorer/TabBar/ContextMenu, laufen als Teil von `npm run test:coverage` in CI.
- **Focus-Management**: `useFocusTrap`-Hook (Tab-Zirkulation, Escape, Fokus-Rückgabe), angewendet auf ConfirmModal, CommandPalette, SettingsPanel, PluginDetailPanel, NewConversation, TemplateSelector.
- **Skip-Navigation & Landmarks**: Skip-Link zu `#main-content`, Toolbar-Landmark-Bewertung.
- **Tastaturbedienbarkeit**: StatusBar, TabContent, TrashView, Sidebar-Resize (`role="separator"` + Pfeiltasten), CanvasMinimap.
- **Farbkontrast**: alle Text-/Hintergrund-Token-Paare (Light + Dark) gegen WCAG AA geprüft, gefundene Verstöße gefixt.
- **Canvas/Graph-Alternative**: dynamisches `aria-label` mit Knoten-/Kantenzahl auf dem Graph-SVG, Tab-Fokus-Reihenfolge zwischen Canvas-Nodes mit Enter/Space, Pfeiltasten-Viewport-Verschiebung als Tastatur-Alternative zum Maus-Pan.
- **Zoom & manueller Test**: 200%-Zoom-Check für Editor/Sidebar/Settings, manueller NVDA-Testdurchlauf über Login → Datei bearbeiten → Sidebar-Navigation → Settings, `ACCESSIBILITY-AUDIT.md` finalisiert.

**Nachsorge (kein neuer Spec nötig):** Weitere Screenreader-Testdurchläufe (VoiceOver/JAWS) nur bei konkretem Bedarf. Wichtiger: neue große Features (Workspaces, Bases, Themes) müssen a11y-Anforderungen direkt in ihren eigenen Requirements mitführen, damit kein weiterer nachträglicher Vollaudit nötig wird.

---

## Erledigt — Navigation & Verknüpfungs-Politur (Track A) ✅

**Spec:** `.kiro/specs/navigation-link-polish/` — alle 8 Requirement-Bereiche umgesetzt (2026-08-14).

Verdrahtet mehrere bestehende No-Op-Befehle mit echtem Verhalten und schließt Aktualisierungs-/Determinismus-Lücken in bereits vorhandenen Navigations-Features:

- **Navigationsverlauf**: Browser-artiges Zurück/Vor (`app:go-back`/`app:go-forward` waren literale No-Ops) — Toolbar-Buttons + `Alt+←/→`. Zentral aufgezeichnet über einen `useEffect`, der `tabState.activeTabId` beobachtet, statt einen Aufruf durch jeden einzelnen Navigations-Auslöser zu fädeln.
- **Schnellwechsler** (Strg+O): `switcher:open` war ebenfalls No-Op — jetzt echter Fuzzy-Datei-Finder, strukturell an die bestehende Befehlspalette angelehnt, nutzt für „Zuletzt geöffnet" den bereits vorhandenen `recentFilesStore`.
- **Tab-Navigation per Tastatur**: `Strg+Tab`/`Strg+Umschalt+Tab` für den bereits funktionierenden, aber ungebundenen `workspace:next-tab`/`previous-tab`.
- **Live-Backlinks**: Links-View im Context Panel hört jetzt auf den bestehenden Realtime-Vault-Change-Bus (debounced 1s) statt nur bei Dokumentwechsel zu laden.
- **Deterministische Link-Auflösung**: `resolveWikilinkTarget()` löst mehrdeutige Dateinamen jetzt über gleicher Ordner → kürzester Pfad → alphabetisch auf, statt über einen willkürlichen Tiefensuche-Artefakt; Tooltip zeigt Mehrdeutigkeit an. Dabei eine zweite, unabhängige Duplikat-Implementierung derselben Funktion in `ViewMode.tsx` gefunden und entfernt (siehe `lessons-learned.md` #84).
- **Explorer-Auto-Reveal**: Toggle „Aktive Datei im Explorer verfolgen" in den Vault-Einstellungen.
- **Breadcrumb-Leiste**: klickbarer Ordnerpfad der aktiven Datei oberhalb des Editors.

**Scope-Korrektur:** Von den vier ursprünglich hier geplanten Punkten wurde nur der Quick Switcher wie vorgesehen umgesetzt — die übrigen drei (Lokaler Graph, Ungelinkte Erwähnungen, Automatische Link-Aktualisierung beim Umbenennen/Verschieben) waren nicht Teil der tatsächlich geschriebenen Spec und sind als eigener Prio 15 „Graph-Politur & Link-Integrität" weitergeführt. Im Gegenzug deckt die umgesetzte Spec vier Bereiche ab, die hier ursprünglich gar nicht geplant waren (Navigationsverlauf, Tab-Tastaturkürzel, Live-Backlinks, Explorer-Auto-Reveal, Breadcrumb).

**Zwei echte Bugs während der Umsetzung gefunden und behoben** (nicht nur Verschönerung): ein React-Ref-Mutation-während-Render-Fehler (von der strengeren `react-hooks/refs`-Lint-Regel gefangen) und ein Absturz beim App-Start, weil `PluginProvider` innerhalb von `AppContent`s eigenem Render-Baum sitzt statt darüber (`app.test.tsx` deckte das sofort auf). Details in `lessons-learned.md` #80–86.

---

## Erledigt — UI-Politur: Bookmarks, Statusleiste, CSS-Snippets (Track A) ✅

**Spec:** `.kiro/specs/ui-polish-bookmarks-status-css-snippets/` — alle Requirement-Bereiche umgesetzt (2026-08-14).

Drei additive Verbesserungen an bestehenden bzw. eng verwandten Features:

- **Bookmarks vervollständigt**: Die vier zuvor als No-Op registrierten Commands `bookmarks:bookmark-current-heading`/`-current-search`/`-current-section`/`-all-tabs` lösen jetzt echtes Verhalten aus (Überschriften-, Block-, Such-Lesezeichen; alle offenen Tabs bookmarken). Zusätzlich, über den ursprünglichen Scope hinaus: manuelles Neuordnen der Favoriten per Drag & Drop, Kontextmenü (Entfernen/Im Explorer zeigen/Umbenennen — wiederverwendet die bestehende generische `ContextMenu.tsx` statt einer neuen Komponente) und eigene Anzeigenamen (Labels).
- **Statusleiste erweitert**: Wort-/Zeichenanzahl (inkl. Selektion), Cursor-Position mit "Gehe zu Zeile"-Popover, Vault-Name — jedes Item einzeln in Settings → Darstellung umschaltbar. Flicker-Fix für Plugin-Items: Diffing (nur hinzugefügte/entfernte Elemente anfassen) statt vollständigem `innerHTML = ''` + Neuaufbau bei jeder Änderung.
- **CSS-Snippets** (komplett neues Feature): nutzereigenes CSS pro Vault, verwaltet in Settings → Darstellung (Upload/Erstellen/Bearbeiten/Aktivieren/Löschen). Backend-Store analog zu `plugin/installed-plugin-store.ts` (`data/snippets/<vaultId>/<snippetId>.css` + `_registry.json`, atomare Writes), automatische Anwendung beim Vault-Öffnen/-Wechsel.

**Zwei bewusste Architektur-Abweichungen vom ursprünglichen Kurz-Scope:**
1. CSS-Snippets nutzen **nicht** den bestehenden Plugin-CSS-Injection-Mechanismus (`css-injector.ts`) — der scoped zwingend auf `[data-plugin-id]`, was für global wirkende Benutzer-Snippets (z. B. `body`-Overrides, `:root`-Variablen) ungeeignet ist. Stattdessen ein eigenständiger, unscoped `SnippetInjector` (`plugins/appearance/snippet-injector.ts`), der nur das Grundmuster (ein `<style>`-Tag pro Einheit) mit dem Plugin-Pendant teilt.
2. Favoriten-Einträge haben jetzt ein `id`-Feld (nicht ursprünglich geplant): Sobald mehrere Bookmark-Typen denselben Dateipfad teilen können (Datei- + Überschriften-Bookmark auf derselben Datei) oder gar keinen Pfad haben (Suche), ist `path` keine eindeutige Kennung mehr. `reorder()`/`setLabel()`/`removeById()` arbeiten deshalb über `id`, nicht `path`.

**Nicht umgesetzt (dokumentierter Rand-Punkt):** Requirement 2.5 ("fehlend"-Markierung für eine favorisierte Datei, die inzwischen gelöscht wurde) — `FavoritesView.tsx` erhält aktuell keinen `DirectoryTree`, um das zu prüfen. Nachrüstbar durch eine Prop-Erweiterung von `SidebarPanel.tsx`.

---

## Prio 1 — PDF-Export / Drucken (Track A)

Scope: ~6–10h. Keine Spec vorhanden.

**Zusammenfassung:**

- Print-Stylesheet (`@media print`) für die gerenderte Ansicht: Editor-Chrome, Sidebar, Tabs und Statusleiste ausblenden, nur Inhalt sichtbar
- Befehl "Drucken / Als PDF speichern" in Command Palette + Datei-Kontextmenü, löst `window.print()` mit aktivem Print-Stylesheet aus (Browser-eigener PDF-Export im Druckdialog)
- Callouts, Mermaid-SVGs und Embeds im Printlayout prüfen (Seitenumbrüche, Bildskalierung)

**Abhängigkeiten:** Keine — nutzt die bestehende ViewMode-Rendering-Pipeline.

**Empfehlung:** Kleinster Aufwand im gesamten Backlog bei sofort sichtbarem Nutzen — guter Startpunkt.

---

## Prio 3 — UI-Politur: Bookmarks, Statusleiste, CSS-Snippets (Track A)

Scope: ~12–18h.

**Spec:** `.kiro/specs/ui-polish-bookmarks-status-css-snippets/` — Requirements + Design + Tasks vorhanden (14 Requirements, 32 Correctness Properties, 20 Task-Blöcke).

**Zusammenfassung:**

- **Bookmarks vervollständigen**: Block-, Überschrift- und Such-Lesezeichen sowie "Alle Tabs bookmarken" (aktuell No-Ops in `core-commands-app.ts`) — Datei-Lesezeichen laufen bereits über die Favoriten. Zusätzlich, über den ursprünglichen Scope hinaus: manuelles Neuordnen (Drag & Drop), Kontextmenü (Entfernen/Im Explorer zeigen/Umbenennen) und eigene Anzeigenamen für Favoriten
- **Wortanzahl/Zeichenanzahl, Cursor-Position** in der Statusleiste (bereits als erweiterbar angelegt, aktuell nur Uhr), granulare Pro-Item-Sichtbarkeit, Vault-Name-Item, sowie ein Flicker-Fix für Plugin-Items (Remount → Diffing)
- **CSS-Snippets**: nutzereigenes CSS pro Vault. **Abweichung von der ursprünglichen Kurzfassung:** Der bestehende Plugin-CSS-Injection-Mechanismus (`css-injector.ts`) scoped zwingend auf `[data-plugin-id]`, was für global wirkende Benutzer-Snippets (z. B. `body`-Overrides) ungeeignet ist — die Spec sieht stattdessen einen eigenständigen, unscoped `SnippetInjector` vor, der nur das Grundmuster (ein `<style>`-Tag pro Einheit) teilt

**Abhängigkeiten:** Braucht `sidebar-panel` ✅ (Favoriten) + `obsidian-plugin-compat` ✅ (CSS-Injection als Vorbild, nicht wiederverwendet) + Status Bar ✅.

**Empfehlung:** Aufräum-Spec vor den großen Architektur-Features — schließt kleine, länger bekannte Lücken günstig ab. Bereit zur Umsetzung.

---

## Prio 4 — Editor-Erweiterungen: Mathe & Medien (Track A)

Scope: ~15–20h. Keine Spec vorhanden.

**Zusammenfassung:**

- **Mathe/LaTeX-Rendering**: KaTeX (leichtgewichtiger als MathJax) lazy-loaded nach dem bestehenden Mermaid-Muster; `renderMath`/`finishRenderMath` im Plugin-Shim ersetzen die aktuelle Rohtext-Ausgabe
- **Audio-/Video-Embeds**: `![[datei.mp3]]` / `.mp4` im Embed-Modul, analog zur bestehenden Bild-/PDF-Embed-Pipeline

**Abhängigkeiten:** Braucht `obsidian-markdown-compat` ✅ (Embed-Pipeline) + `mermaid-rendering` ✅ (Lazy-Load-Pattern als Vorlage).

**Empfehlung:** Mathe ist eine der sichtbarsten verbliebenen Rendering-Lücken für technische/wissenschaftliche Nutzer — moderater Aufwand, hohe Sichtbarkeit.

---

## Prio 5 — Obsidian Themes (Track B)

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

## Prio 6 — Public Sharing (Track C)

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

**Abhängigkeiten:** Braucht `auth-and-user-management` ✅ + `obsidian-markdown-compat` ✅. Teilt die Read-Only-Rendering-Basis mit Prio 1 (PDF-Export).

---

## Prio 7 — Responsive/Mobile (Track F/G)

Scope: ~4h Design + ~20–30h Implementierung.

**Spec:** `.kiro/specs/responsive-mobile/` — Requirements + Design + Tasks vorhanden, basierend auf Ist-Zustands-Audit (Layout-Shell, Canvas-Interaktion, Touch-Support).

- Breakpoints: Mobile (<768px), Tablet (768–1024px), Desktop (>1024px)
- Sidebar als Overlay/Drawer, Touch-Interaktionen, Canvas Pinch-to-Zoom
- Optional: PWA-Manifest

**Sequenzierungs-Hinweis:** Bewusst vor Workspaces (Prio 9) eingeplant. Ein Split-Pane-Layout responsive zu machen ist deutlich schwerer als ein bestehendes Single-Pane-Layout — die Workspaces-Spec sollte Responsive-Verhalten von Anfang an mitdenken statt es nachträglich in ein bereits fertiges Pane-System zu quetschen.

**Empfehlung:** Spec ist bereits vollständig (kein Design-Aufwand mehr nötig) und zentral fürs Kernversprechen "von jedem Browser" — günstige Gelegenheit, vor dem großen Workspaces-Umbau umzusetzen.

---

## Prio 8 — Properties-Editor & Suchoperatoren (Track H)

Scope: ~25–35h. Keine Spec vorhanden. Zwingende Vorarbeit für Bases (Prio 10) — bewusst vorgezogen, damit Bases auf einer bereits fertigen Query-/Property-Schicht aufbauen kann statt sie zu duplizieren.

**Zusammenfassung:**

- **Properties-Editor-UI**: typisierte Frontmatter-Felder (Text/Zahl/Datum/Checkbox/Liste/Tags) statt aktuell rohem YAML im Editor; Typ-Erkennung aus vorhandenen Werten, manuelle Typ-Umschaltung
- **Such-Operatoren**: Query-Syntax-Parser für `path:`, `tag:`, `file:`, `line:`, `-tag:` u. Ä., vor die bestehende Regex-Suche geschaltet
- Beide Teile greifen auf dieselbe Property-/Metadaten-Schicht zu, die auch Bases (Prio 10) als Query-Grundlage braucht

**Abhängigkeiten:** Braucht `context-panel` ✅ (Properties-Anzeige) + `search-and-discovery` ✅.

**Empfehlung:** Nicht überspringen, auch wenn beide Teile für sich genommen "nur" mittlere Priorität hätten — ohne diese Vorarbeit baut Bases sonst eine zweite, inkonsistente Query-Engine.

---

## Prio 9 — Workspaces & Split-Panes (Track G)

Scope: ~60–90h. Keine Spec vorhanden. **Nutzerwunsch** — zuvor als "kein Äquivalent geplant" eingestuft. Größter Architektur-Eingriff im gesamten Backlog.

**Zusammenfassung:**

- Pane-Baum statt einzelner Tab-Reihe: horizontale/vertikale Splits, verschachtelbar
- Gespeicherte, benannte Workspace-Layouts (Speichern/Laden/Löschen), Workspace-Switcher
- `workspace-leaf-compat` ✅ erweitern: `createLeafBySplit`/`splitActiveLeaf` erzeugen echte Splits statt neuer Tabs — hebt betroffene Plugins von "partial" auf "full"-Kompatibilität
- Tab-Drag-and-Drop zwischen Panes
- Persistenz des Pane-Baums analog zur bestehenden Tab-/Panel-State-Persistierung

**Abhängigkeiten:** Braucht `tabbed-editor-viewer` ✅ und `workspace-leaf-compat` ✅ (wird erweitert, nicht ersetzt). **Empfohlen:** Prio 7 (Responsive/Mobile) zuerst.

**Risiko:** Größte einzelne Architekturänderung am Layout-System der App. Vor dem Requirements-Dokument ein kurzes Design-Spike gegen bekannte Regressionsflächen (Tab-State-Persistenz, Plugin-Sidebar-Views, Canvas-/Graph-Fullscreen-Modus) empfohlen.

**Empfehlung:** Eingeplant, aber bewusst nach den Politur-Specs (Prio 1–4) und nach Responsive/Mobile, damit das Fundament stabil ist, wenn der große Umbau kommt.

---

## Prio 10 — Bases (Track H)

Scope: ~55–75h. Keine Spec vorhanden. **Nutzerwunsch** — zuvor als "kein Äquivalent geplant" eingestuft.

**Zusammenfassung:**

- `.base`-Dateiformat lesen/schreiben (YAML: Filter, Views, Formeln) — kompatibel zu Obsidians Format, damit importierte Vaults funktionieren
- Query-Engine (baut auf Prio 8 auf): Filter nach Properties/Tags/Pfad, Sortierung
- View-Typen: Tabelle (editierbare Zellen) zuerst; Karten-/Board-Ansicht optional als Ausbaustufe
- Formeln: einfache Ausdrücke über Properties (Vergleiche, Verkettung, Basis-Arithmetik)
- Bases-Tabs im Tab-System (bzw. in eigenen Panes, falls Workspaces/Prio 9 vorher landet)

**Abhängigkeiten:** **Zwingend** Prio 8 (Properties-Editor & Suchoperatoren) zuerst. Profitiert von Prio 9 (Workspaces), ist davon aber nicht hart blockiert.

**Empfehlung:** Größtes Einzelfeature nach Workspaces. Scope-Risiko liegt vor allem bei den Formeln — Obsidians Formel-Sprache ist nicht trivial nachzubauen; für die erste Version auf einfache Ausdrücke beschränken statt volle Parität in einem Zug anzustreben.

---

## Prio 11 — Server-Side Plugins (Track B)

Scope: ~8h Design + ~40–60h Implementierung. Task-Liste existiert (7 Phasen).

**Spec:** `.kiro/specs/server-side-plugins/`

**Phasen:** Plugin-Klassifikation → Server-Side Sandbox (vm) → Runtime Manager → API & Logs → Settings-Bridge → Frontend-Integration → Sicherheit & Hardening.

**Sicherheits-Nachsorge aus Security Hardening:** Diese Spec ist auch der richtige Ort für echte Plugin-Sandbox-Isolation (Worker/VM statt Proxy-basierter Soft-Isolation) und den Per-User-Rate-Limiter für `/proxy`/`/shares`/`/search` — beide im Security-Audit als Fix-Backlog vermerkt (Task 18), bewusst hier statt in einem eigenen Nachfolge-Pass mit erledigt.

**Abhängigkeiten:** Braucht `obsidian-plugin-compat` ✅ (Plugin-Store, Registry, Installer).

**Blockiert:** IMAP-Importer, Git-Plugin, Shell Commands und andere Node.js-basierte Plugins.

---

## Prio 12 — Fremdformat-Importer (Track I)

Scope: ~20–30h. Keine Spec vorhanden.

**Zusammenfassung:**

- Notion-Export (ZIP mit HTML/Markdown + CSV-Datenbanken) → Markdown + Frontmatter
- Evernote (`.enex`) → Markdown
- Generisches HTML → Markdown
- Mapping-Report nach Import (was wurde wie übersetzt, was ist fehlgeschlagen)

**Abhängigkeiten:** Braucht `advanced-file-operations` ✅ (Import-Pipeline).

**Empfehlung:** Onboarding-Feature — sinnvoll, aber nicht zeitkritisch; niedrigere Priorität als die Kernparitäts-Lücken oben.

---

## Prio 13 — Semantische Suche / AI-Embeddings (Track E)

Scope: ~8h Design + ~30–50h Implementierung.

**Vorarbeit (zwingend):**

- Technologie-Entscheidung: Embedding-Provider (Ollama lokal vs. OpenAI extern)
- Vector-Store-Wahl: In-Memory (hnswlib) vs. SQLite-FTS vs. externer Service (Qdrant)
- Design-Dokument mit Chunking-Strategie, Pipeline, Query-Flow, MCP-Integration

**Empfehlung:** Optionales Feature hinter Feature-Toggle (`semantic-search`). Lokal-First (Ollama) als Standard.

---

## Prio 14 — Collaborative Editing (Track D)

Scope: ~8h Design + ~60–80h Implementierung.

**Spec:** `.kiro/specs/collaborative-editing/` (Requirements vorhanden)

**Vorarbeit (zwingend):** Technologie-Entscheidung (OT vs. CRDT/Yjs), WebSocket-Integration, Cursor-Presence-Protokoll, Netzwerk-Resilienz.

**Abhängigkeiten:** Braucht `realtime-infrastructure` ✅ + `live-preview-editor` ✅ (CM6 erleichtert CRDT-Integration).

**Empfehlung:** Als eigenständiges Milestone nach den anderen Tracks planen. Technisch anspruchsvollstes und riskantestes Feature im Backlog — bewusst zuletzt.

---

## Prio 15 — Graph-Politur & Link-Integrität (Track A)

Scope: ~15–24h. Rest-Scope aus der ursprünglich als „Navigation & Verknüpfungs-Politur" geplanten Spec — die drei Punkte, die nicht in der tatsächlich umgesetzten `navigation-link-polish`-Spec (siehe „Erledigt" oben) mitgeliefert wurden. Kein Quick-Switcher-Punkt mehr, der ist erledigt.

**Zusammenfassung:**

- **Lokaler Graph** (pro Notiz): Filterung der bestehenden `/vaults/:id/graph`-Antwort auf n-Hop-Nachbarschaft, eigene GraphView-Instanz; aktuell No-Op
- **Ungelinkte Erwähnungen**: Volltextsuche nach dem Dateinamen ohne Wikilink-Syntax, Anzeige im Context Panel unterhalb der Backlinks
- **Automatische Link-Aktualisierung** beim Umbenennen/Verschieben: `renameContent`/`moveContent` müssen vaultweit alle Wikilinks auf die alte Datei umschreiben, statt sie brechen zu lassen — nutzt die im Graph Store bereits vorhandenen Backlink-Daten. Größte *unbeabsichtigte* Einzel-Lücke ggü. Obsidian-Kernverhalten (Datenintegrität).

**Abhängigkeiten:** Braucht `knowledge-graph` ✅ (Backlink-/Adjazenzdaten) + `link-resolver.ts` ✅ (jetzt mit deterministischer Mehrdeutigkeits-Auflösung, siehe `navigation-link-polish` ✅).

**Empfehlung:** Drei kleine, unabhängig testbare Tasks — die Link-Aktualisierung ist davon die mit dem größten wahrgenommenen Qualitätsgewinn (Datenintegrität beim Umbenennen).

---

## Gesamtaufwand (Schätzung)

| Track | Aufwand |
|-------|---------|
| A: Politur (PDF, Mathe/Medien, Graph-Politur) | ~36–54h |
| B: Plugins (Themes + Server-Side) | ~63–88h |
| C: Sharing | ~19–24h |
| D: Editor (Collaborative) | ~68–88h |
| E: AI (Semantische Suche) | ~38–58h |
| F/G: Qualität & Layout (Responsive + Workspaces) | ~84–124h |
| H: Strukturierte Daten (Properties/Suche + Bases) | ~80–110h |
| I: Onboarding (Importer) | ~20–30h |
| **Summe** | **~408–576h** |

---

## Bewusst nicht implementierte Features

Bases, Workspaces und PDF-Export standen hier zeitweise als "kein Äquivalent geplant" — sind aber auf Nutzerwunsch jetzt aktiv in der Roadmap oben (Prio 1, 9, 10). Die folgende Liste enthält nur, was tatsächlich dauerhaft ausgeschlossen bleibt:

| Idee | Grund |
|------|-------|
| Mehrere native Fenster / OS-Fensterverwaltung | Browser-App-Architektur schließt das aus. Tabs + geplante Split-Panes (Prio 9) decken den Bedarf innerhalb eines Browser-Fensters ab. |
| Native Mobile-Apps (iOS/Android) | Bewusst web-only. Responsive/Mobile-Weboberfläche (Prio 7) deckt den Mobile-Anwendungsfall ab, ohne App-Store-Overhead oder zweite Codebasis. |
| GitSync | CouchDB-Sync (LiveSync-Kompat) deckt den Use-Case ab. Hohe Komplexität für einen Nischenfall. |
| HTML-Rendering (Raw-HTML), generisch | XSS-Risiko. Markdown + Mermaid + Embeds reichen. **Teilweise revidiert:** Eine enge Allowlist für Inline-Tags (`<font color>`, `<mark>`, `<span style>`) plus `<center>`-Blöcke ist umgesetzt (`plugins/inline-html.ts`, geteilt zwischen Live Preview und Reading View) — alles außerhalb der Allowlist, inkl. `on*`-Handler/`script`/`iframe`, bleibt literaler Text. Generisches HTML-Rendering bleibt verworfen. |
| Offline-Modus (volles PWA-Offline) | Self-Hosted = Server nötig. Vault-Sync mit Obsidian-Desktop deckt Offline ab. (Ein reines PWA-Installations-Manifest ohne Offline-Anspruch ist als Option in Prio 7 vorgesehen.) |
| AI-Agent im Editor | MCP (bereits implementiert) deckt AI-Zugang ab. Ein eingebauter Copilot wäre ein eigenes Produkt. |
| Multi-Sprachen/RTL | Spezieller Use-Case. Bei konkretem Bedarf im Rahmen der responsive-mobile- oder einer eigenen i18n-Spec aufgreifen. |

---

## Bekannte Limitierungen

Siehe Abschnitt "Bewusst nicht implementierte Features" oben für dauerhaft ausgeschlossene Funktionalität. Für den aktuellen Umsetzungsstand aller Obsidian-Kernfeatures (inkl. Abweichungen bei bereits implementierten Features) siehe den separaten Feature-Paritäts-Audit.
