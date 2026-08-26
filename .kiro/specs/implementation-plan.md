# Implementierungsplan — Slatebase Ausstehende Features

**Stand:** 26.08.2026. Security Hardening, Accessibility Audit (Runde 1), **Navigation & Verknüpfungs-Politur**, **UI-Politur (Bookmarks/Statusleiste/CSS-Snippets)**, **Graph-Politur & Link-Integrität**, **Editor-Erweiterungen (Mathe & Medien)**, **Properties-Editor & Suchoperatoren** und jetzt auch **PDF-Export / Drucken** sind abgeschlossen. Kernfeatures sind umgesetzt. Track A (Politur) hat damit keine offenen Punkte mehr. Es verbleiben 9 priorisierte offene Spec-Einheiten (decken ~17 Einzelfeatures ab, da mehrere thematisch verwandte Features gebündelt wurden). Zwei davon — **Workspaces/Split-Panes** und **Bases** — waren zuvor als "kein Äquivalent geplant" eingestuft und sind jetzt auf ausdrücklichen Nutzerwunsch in die aktive Roadmap aufgenommen.

**Scope-Korrektur Navigation & Verknüpfungs-Politur:** Die umgesetzte Spec (`.kiro/specs/navigation-link-polish/`) deckt Quick Switcher (wie ursprünglich hier geplant) sowie zusätzlich Navigationsverlauf, Tab-Tastaturkürzel, Live-Backlinks, deterministische Link-Auflösung, Explorer-Auto-Reveal und eine Breadcrumb-Leiste ab — ein sinnvollerer, in sich geschlossener Scope als ursprünglich hier skizziert. Die drei übrigen ursprünglich hier gelisteten Punkte (Lokaler Graph, Ungelinkte Erwähnungen, Automatische Link-Aktualisierung beim Umbenennen/Verschieben) wurden **nicht** mitgeliefert und wurden als eigener Prio „Graph-Politur & Link-Integrität" weitergeführt — inzwischen ebenfalls abgeschlossen (siehe „Erledigt" unten).

**Strategie:** Hybrid — Features mit bestehender Spec direkt umsetzen, komplexe Features erst vollständig spezifizieren. Kleinere, thematisch verwandte Features werden zu gemeinsamen Specs gebündelt statt einzeln spezifiziert (siehe Track A und H).

---

## Ausstehende Features — Umsetzungsreihenfolge

| Prio | Feature | Track | Aufwand | Status |
|------|---------|-------|---------|--------|
| ~~1~~ | ~~PDF-Export / Drucken~~ | A | ~~6–10h~~ | ✅ Erledigt (siehe unten) |
| ~~2~~ | ~~Navigation & Verknüpfungs-Politur~~ | A | ~~25–35h~~ | ✅ Erledigt (Teil-Scope, siehe unten) |
| ~~3~~ | ~~UI-Politur (Bookmarks/Statusleiste/CSS-Snippets)~~ | A | ~~12–18h~~ | ✅ Erledigt (siehe unten) |
| ~~4~~ | ~~Editor-Erweiterungen (Mathe & Medien)~~ | A | ~~15–20h~~ | ✅ Erledigt (siehe unten) |
| 5 | Obsidian Themes | B | ~15–20h | Geplant (keine Spec) |
| 6 | Public Sharing | C | ~15–20h | Geplant (keine Spec) |
| 7 | Responsive/Mobile | F | ~24–34h | Spec vollständig (Req + Design + Tasks) |
| ~~8~~ | ~~Properties-Editor & Suchoperatoren~~ | H | ~~~25–35h~~ | ✅ Erledigt (siehe unten) |
| 9 | Workspaces & Split-Panes | G | ~60–90h | Geplant (keine Spec) — Nutzerwunsch |
| 10 | Bases | H | ~55–75h | Geplant (keine Spec) — Nutzerwunsch, braucht Prio 8 |
| 11 | Server-Side Plugins | B | ~48–68h | Tasks vorhanden |
| 12 | Fremdformat-Importer | I | ~20–30h | Geplant (keine Spec) |
| 13 | Semantische Suche / AI-Embeddings | E | ~38–58h | Geplant (keine Spec) |
| 14 | Collaborative Editing | D | ~68–88h | Nur Requirements |
| ~~15~~ | ~~Graph-Politur & Link-Integrität~~ | A | ~~15–24h~~ | ✅ Erledigt (siehe unten) |
| 16 | Echte E2E-Test-Suite | F | ~30–45h | Spec vollständig (Req + Design) |

---

## Abhängigkeiten

```
Track A (Politur):     PDF-Export ✅; Navigation & Verknüpfungs-Politur ✅ → Graph-Politur & Link-Integrität ✅; UI-Politur ✅; Editor-Erweiterungen (Mathe/Medien) ✅ — keine offenen Punkte mehr
Track B (Plugins):     Community Plugin Store ✅ → Obsidian Themes → Server-Side Plugins
Track C (Sharing):     Public Sharing (unabhängig)
Track D (Editor):      Collaborative Editing (braucht Realtime + CM6)
Track E (AI):          Semantische Suche (unabhängig)
Track F (Qualität):    Security Hardening ✅ → Accessibility Audit ✅ → Responsive/Mobile; Echte E2E-Test-Suite (unabhängig, kann parallel laufen)
Track G (Layout):      Responsive/Mobile (empfohlene Vorarbeit) → Workspaces & Split-Panes
Track H (Daten):       Properties-Editor & Suchoperatoren ✅ → Bases
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

**Nachträglicher Follow-up (2026-08-19):** Server-seitige verschlüsselte Ablage für Plugin-Secrets (`backend/src/plugin/secret-key-manager.ts`, `secret-store.ts`). `SecretStorage`/`SecretComponent`-Secrets lagen zuvor unverschlüsselt im Browser-`localStorage` (CodeQL-Alert CWE-312) — jetzt AES-256-GCM-verschlüsselt pro Vault/Plugin serverseitig gespeichert, Schlüsselableitung via HKDF aus `SLATEBASE_PLUGIN_SECRET_KEY` (Env → Datei → generiert, gleiches Muster wie das CSRF-Secret). REST-Endpunkte für Read/Write, `localStorage` dient nur noch als Legacy-Migrations-/Offline-Fallback.

**Nachträglicher Follow-up (2026-08-24):** Realtime-`vault:change`-Events (Speichern/Löschen/Umbenennen/Wiederherstellen — `VaultController`, Template-, Datei-Versions-, Trash-Restore- und Upload-Routen) liefen bisher per `target: { kind: 'broadcast' }` an **jeden** verbundenen Nutzer, mit dem expliziten Kommentar, das Frontend werde Events für nicht zugängliche Vaults schon selbst ignorieren — eine Client-seitige Filterung ist aber kein Zugriffsschutz und legte Vault-ID, Dateipfad, Aktion und Benutzername fremder privater Vault-Operationen gegenüber jedem angemeldeten Nutzer offen. Fix: neue `IVaultAccessControl.getUsersWithAccess(vaultId)`-Methode (Owner + alle Share-Empfänger, dedupliziert), jede `vault:change`-Publikation zielt jetzt auf `{ kind: 'users', userIds }` statt Broadcast (Fallback auf Broadcast nur, wenn `accessControl` nicht verdrahtet ist, z. B. in Tests). Details: `lessons-learned.md` #123.

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

**Scope-Korrektur:** Von den vier ursprünglich hier geplanten Punkten wurde nur der Quick Switcher wie vorgesehen umgesetzt — die übrigen drei (Lokaler Graph, Ungelinkte Erwähnungen, Automatische Link-Aktualisierung beim Umbenennen/Verschieben) waren nicht Teil der tatsächlich geschriebenen Spec und wurden als eigener Prio „Graph-Politur & Link-Integrität" weitergeführt (siehe „Erledigt" unten — inzwischen ebenfalls abgeschlossen). Im Gegenzug deckt die umgesetzte Spec vier Bereiche ab, die hier ursprünglich gar nicht geplant waren (Navigationsverlauf, Tab-Tastaturkürzel, Live-Backlinks, Explorer-Auto-Reveal, Breadcrumb).

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

## Erledigt — Editor-Erweiterungen: Mathe & Medien (Track A) ✅

**Spec:** `.kiro/specs/editor-extensions-math-media/` — alle 6 Requirements umgesetzt (2026-08-19).

Zwei unabhängige Ergänzungen an der Rendering-Pipeline:

- **KaTeX-Mathe-Rendering**: `katex@0.16.22` (MIT, lazy-loaded nach Mermaid-Pattern). Inline-Mathe (`$...$`) mit Obsidian-kompatiblen Boundary-Regeln (kein Whitespace nach öffnendem $, kein Whitespace vor schließendem $, keine Ziffer nach schließendem $, kein Zeilenumbruch). Block-Mathe (`$$...$$`) als MDAST-Transformer. Rendering in drei Schichten: ViewMode (`MathRenderer.tsx`, gleiche 5-Zustands-State-Machine wie MermaidRenderer), Live Preview (InlineMathWidget/BlockMathWidget mit async KaTeX-Hydration), Plugin-Compat (`renderMath`/`finishRenderMath`/`loadMathJax` ersetzen die bisherigen No-Op-Stubs mit echtem KaTeX — `renderMath` gibt synchron ein Element mit Rohtext zurück, das sich async mit gerenderter Mathe aktualisiert).
- **Audio-/Video-Embeds**: `AUDIO_EXTENSIONS` (.mp3/.wav/.ogg/.flac/.m4a/.aac/.wma) und `VIDEO_EXTENSIONS` (.mp4/.webm/.ogv/.mov/.mkv). `detectEmbedType()` und `EmbedNode.embedType` um `'audio' | 'video'` erweitert. Reading View rendert native `<audio controls>` / `<video controls>` mit dem bestehenden Raw-File-Endpoint. Live Preview: eigene `buildAudioDOM()`/`buildVideoDOM()`-Methoden auf `EmbedWidget`. Video-Embeds unterstützen die bestehende Größensyntax (`![[video.mp4|640]]`).

**Neue Dependency:** `katex` 0.16.22 (MIT, ~300 KB gzipped, keine globalen DOM-Patches, synchron renderbar). Obsidian selbst verwendet ebenfalls KaTeX (ab 1.4+).

---

## Erledigt — Graph-Politur & Link-Integrität (Track A) ✅

**Spec:** `.kiro/specs/graph-polish-link-integrity/` — alle 3 Requirement-Bereiche umgesetzt (2026-08-18).

Die drei Rest-Punkte aus der ursprünglich als „Navigation & Verknüpfungs-Politur" geplanten Spec (siehe oben):

- **Lokaler Graph** (pro Notiz): `graph:open-local` (zuvor No-Op) öffnet jetzt einen Tab mit dem bestehenden `GraphView`, clientseitig gefiltert auf die N-Hop-Nachbarschaft (`local-graph-utils.ts`, reine BFS-Filterung der vorhandenen `/vaults/:id/graph`-Antwort, kein neuer Endpunkt). Nachbarschaftsradius (1–5) per Stepper einstellbar und persistiert, Zentrums-Notiz visuell hervorgehoben, Live-Update bei Vault-Änderungen, dedizierter Fehlerzustand bei Löschung der Zentrums-Notiz.
- **Ungelinkte Erwähnungen**: neue Sektion in `LinksView.tsx` unterhalb der Backlinks — Volltextsuche nach dem Dateinamen (bestehender Such-Endpunkt), gefiltert um Treffer, die bereits Teil eines auf die Datei auflösenden Wikilinks sind (`extractWikilinks`/`resolveWikilinkTarget`), inkl. „Verlinken"-Aktion pro Fund.
- **Automatische Link-Aktualisierung** beim Umbenennen/Verschieben: `moveContent`/`renameContent` schreiben jetzt synchron vor der Antwort vaultweit alle Wikilinks um, die auf den alten Pfad zeigen — auch bei Ordner-Operationen (ein Rewrite-Durchlauf pro betroffener Datei), mit `saved`-Realtime-Events pro umgeschriebener Datei und `linkMigrationWarnings` im Response bei Teilfehlern.

**Wichtiger Fund während der Umsetzung:** Der bestehende Link-Index (`LinkIndexService.getBacklinks()`) matcht Wikilink-Ziele nur über exakten normalisierten Pfad-Abgleich — ein für Obsidian typischer Kurzform-Link (`[[Notiz]]` ohne Ordnerpfad) auf eine Datei in einem Unterordner wird vom Index nicht erfasst. Ein alleiniges `getBacklinks()` hätte die Link-Migration für genau die häufigste Link-Art stillschweigend übersehen. Fix: Backend-Port der bestehenden Frontend-Auflösungslogik (`link-match-resolver.ts`, portiert aus `link-resolver.ts`) plus ein Volltextsuche-Fallback für Kandidaten, die der Index nicht kennt — beide Quellen zusammen bilden die Kandidatenliste, bevor gegen den (vor der Operation eingefrorenen) `DirectoryTree` aufgelöst wird.

**Nachgezogen:** Die MCP-Tools `move_file`/`rename_file` (`backend/src/mcp/tool-handlers.ts`) riefen ursprünglich `vaultService.moveContent`/`renameContent` direkt auf und umgingen damit den `VaultController`-HTTP-Pfad, an dem die Link-Migration hängt. `ToolHandlerDeps` hat jetzt ein optionales `migrateLinks`-Feld (im Composition Root auf denselben `LinkMigrationService` verdrahtet wie der REST-Pfad), sodass MCP-getriebene Verschiebungen/Umbenennungen ebenfalls vaultweit Links aktualisieren — inkl. Ordner-Operationen und `linkMigrationWarnings` im Tool-Ergebnis bei Teilfehlern. MCP-Tools publizieren weiterhin keine Realtime-`vault:change`-Events (bestehendes, unverändertes Verhalten aller MCP-Schreib-Tools, nicht nur dieser beiden).

---

## Erledigt — Settings-UI-Konsistenz (Direktauftrag, kein Roadmap-Track) ✅

**Kein Spec-Verzeichnis** — kleinerer, direkt beauftragter UI-Konsistenz-Pass über alle 15 Settings-Tabs, nicht Teil der oben priorisierten Roadmap, deshalb nicht in der Prio-Tabelle/den Abhängigkeiten gelistet (2026-08-21).

Auslöser: uneinheitliches Erscheinungsbild der Settings-Seiten (mal mit, mal ohne Karten-Rahmen/Hintergrund/Überschrift; mind. 6 unabhängige Button-Klassenfamilien; Darstellung-Tab faktisch ohne jedes CSS; Benutzerverwaltung-Tabelle passte nicht in die Modal-Breite).

- **Neues gemeinsames UI-Kit** `frontend/src/components/settings/ui/` (`SettingSection`, `SettingRow`, `Button`) — alle Tabs auf dieselbe Karten-/Zeilen-/Button-Optik umgestellt statt weiterhin pro Tab eigene Klassennamen zu erfinden.
- **Darstellung-Tab** (0 Zeilen eigenes CSS zuvor) neu strukturiert: zwei `SettingSection`-Karten ("Statusleiste", "CSS-Snippets").
- **Benutzerverwaltung** neu gebaut: Aktionsspalte von 4 Text-Buttons auf kompakte Icon-Buttons, Lösch-Bestätigung über das bestehende `ConfirmModal` statt eines vierten eigenen Dialogs.
- **Echter Bug gefunden und gefixt** (nicht nur Kosmetik): `.settings-panel-content` (Row-Flex-Item sobald die Container-Query ≥700px greift) hatte kein `min-width:0` — Flexbox' Default-Mindestbreite orientiert sich am Inhalt, wodurch breite Tab-Inhalte (Tabellen) die Karte lautlos über die Modal-Breite hinaus wachsen ließen und vom äußeren `overflow:hidden` hart abgeschnitten wurden, ohne nutzbaren Scrollbalken. Betraf die Benutzerverwaltung-Tabelle schon vor diesem Umbau. Details: `lessons-learned.md`.
- Tastaturkürzel-Kategorien und Vault-Konfiguration jeweils in eigene `SettingSection`-Unterabschnitte gegliedert; doppelt gepflegte (und leicht widersprüchliche) Sidebar-Labels aus `SettingsContent.tsx`/`SettingsNavList.tsx` in `state/settingsLabels.ts` zusammengeführt.

**Bewusst nicht angefasst:** `PluginManagementPage.tsx` (Store-Browser mit eigenem, absichtlich volle Breite nutzendem Grid-Layout).

---

## Erledigt — PDF-Export / Drucken (Track A) ✅

**Spec:** Keine eigene Spec — umgesetzt als Teil eines größeren Batches, der ~20 zuvor als literale No-Ops registrierte Obsidian-Core-Commands (`core-commands.ts`/`core-commands-app.ts`) mit echtem Verhalten hinterlegt hat (u. a. Code-Folding, Tab-Pinning, Canvas-Befehle, Note-Composer). Details zum PDF-Export-Teil: `core-commands-app.ts`s `exportActiveFileToPdf()`.

- `@media print`-Print-Stylesheet in `App.css`: isoliert `.view-mode` (ViewMode.tsx' Reading-Mode-Container) als einziges sichtbares Element beim Drucken — Sidebar, Tabs, Statusleiste und Editor-Chrome werden ausgeblendet statt einzeln adressiert (robuster als eine Liste von Ausblend-Selektoren).
- Befehl **"Export to PDF..."** in der Command Palette: schaltet den aktiven Tab in den Lesemodus (falls im Edit-Modus) und löst `window.print()` aus — der browsereigene Druckdialog liefert den eigentlichen PDF-Export ("Als PDF speichern").
- **Scope-Korrektur:** kein zusätzlicher Eintrag im Datei-Kontextmenü (nur Command Palette) — der ursprüngliche Sketch hatte beides vorgesehen, ein zweiter Eintrittspunkt für denselben Befehl brachte keinen zusätzlichen Nutzen. Callouts/Mermaid/Embeds im Printlayout wurden nicht gesondert geprüft, da `.view-mode` bereits die vollständig gerenderte Ansicht (inkl. dieser Elemente) 1:1 übernimmt statt eine eigene Print-Darstellung zu bauen.

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

**Abhängigkeiten:** Braucht `auth-and-user-management` ✅ + `obsidian-markdown-compat` ✅. Teilt die Read-Only-Rendering-Basis (`.view-mode`) mit dem bereits umgesetzten PDF-Export (siehe „Erledigt" oben).

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

## Erledigt — Properties-Editor & Suchoperatoren (Track H) ✅

**Spec:** `.kiro/specs/properties-editor-search-operators/` — alle 22 Tasks abgeschlossen (2026-08-19).

Zwei zusammengehörende Erweiterungen auf einer gemeinsamen Property-/Metadaten-Schicht:

- **Property-Type-Registry**: Pro-Vault-JSON-Speicher (`.slatebase/property-types.json`) mit deklarierten Frontmatter-Feld-Typen (text/number/date/datetime/checkbox/list/tags/aliases). REST-CRUD (`GET/PUT /vaults/:vaultId/property-types`), reservierte Keys (tags/aliases unveränderbar), max. 200 Einträge. `KeyedJsonFileStore`-Pattern.
- **Property-Value-Index**: Inverser In-Memory-Index (`key→value→files`) im `LinkIndexService`, deterministisch aus dem bestehenden `fileProperties`-Map rekonstruiert (nicht extra persistiert). Neue Query-Methoden: `getFilesByProperty`, `getPropertyKeys`, `getPropertyValues`, `queryByProperties` (eq/neq/contains/exists/not_exists, UND-Verknüpfung, max 500 Ergebnisse).
- **Such-Operatoren (Backend)**: Query-Parser extrahiert `path:`, `file:`, `tag:`, `property:` (inkl. Negation `-tag:`, Quoting `path:"Mein Ordner/**"`) als Pre-Filter vor der bestehenden Volltextsuche. Glob-Match-Utility für `path:`-Patterns (`*`/`**`/`?`). Datei-Listing-Modus bei reinen Operator-Queries. API-kompatibel (Operatoren im bestehenden `query`-Parameter, kein neuer Endpunkt).
- **Such-Operatoren (Frontend)**: Shadow-Layer-Syntax-Highlighting im Suchfeld (farbige Operator-Keywords/-Werte/-Negation), Autocomplete-Dropdown für `tag:`/`property:`-Werte (geladen aus `getGraphMeta`), Operatoren-Hilfe-Popover mit Syntax-Tabelle.
- **Properties-Editor UI**: Ersetzt die bisherige read-only `PropertiesView` im Context Panel durch einen interaktiven, typisierten Editor (im Edit-Modus bei Markdown-Dateien mit Schreibzugriff). Typ-Auflösung: Registry > well-known keys > Wert-Inferenz. Typ-Controls: Text (click-to-edit), Number (Validierung), Date/Datetime (native Picker), Checkbox (Toggle), List/Tags (Chip-Editor mit Autocomplete). Add/Delete/Commit über `applyFrontmatterChange()` → `UPDATE_EDIT_BUFFER` (gleicher Pfad wie manuelle Editor-Edits).
- **Property-Metadaten-API**: `GET /vaults/:vaultId/properties` (Keys + Counts + Typen), `GET /properties/:key/values` (paginiert), `POST /properties/query` (Filter-basiertes Datei-Listing). Grundlage für Bases (Prio 10).

**Testbilanz:** 130 neue Tests (98 Backend + 32 Frontend). Backend kompiliert fehlerfrei.

---

## Erledigt — Plugin-Compat QS-Pass: CSS-Host-Klassen, Notice-DOM, No-Op-Logging (Track B) ✅

**Direktauftrag (2026-08-21), kein Roadmap-Track.** Zweiter QS-Durchlauf über die Plugin-Kompatibilitätsschicht. Die API-Oberfläche selbst war bereits praktisch vollständig (gegen `obsidian.d.ts` 1.13.1 fehlten nur noch `MarkdownSourceView`, `iterateCacheRefs`/`iterateRefs` — alle drei deprecated — und `Editor.processLines`); gefunden und behoben wurden fünf Verhaltensfehler dahinter:

- **Plugin-Dark-Mode-CSS war komplett tot** (höchster Hebel): Der CSS-Injector faltete Obsidians Host-Marker-Klassen in den Plugin-Scope, so dass `.theme-dark .panel` zu `[data-plugin-id="x"].theme-dark .panel` wurde — ein Selektor, der von einem Element verlangt, gleichzeitig `<body>` und Plugin-Element zu sein, und deshalb nie matcht. Betraf jedes Plugin mit Dark-Mode-Styles. Host-Klassen bleiben jetzt als Prefix davor stehen, und zwar vor *jeder* erzeugten Alternative (nur die erste zu prefixen hätte Dark-Mode-Regeln auch im Light-Mode greifen lassen — schlimmer als der ursprüngliche Fehler). Klassenliste kommt aus `OBSIDIAN_HOST_BODY_CLASSES` (`body-classes.ts`), damit setzende und scopende Seite nicht auseinanderlaufen.
- **`Notice` schrieb in detachtes DOM**: `noticeEl`/`messageEl`/`containerEl` wurden nie eingehängt; nur der geflattete Klartext erreichte den Toast. Plugins, die nach dem Konstruktor in `messageEl` bauen (Fortschrittszeilen, Spinner) oder ein `DocumentFragment` übergeben, verloren das still — genau das Anti-Pattern, das die eigene Quality-Regel verbietet. Der Shim baut jetzt Obsidians echten Baum und reicht `noticeEl` an den Toast durch, der es per `MountedNode` einhängt.
- **Obsidian-Klassennamen ergänzt**: Ribbon-Buttons tragen zusätzlich `side-dock-ribbon-action`, Status-Bar-Items `status-bar-item`. Plugin-CSS zielt auf diese Namen; die Gestaltung bleibt bei den Slatebase-Klassen.
- **Stille No-Ops sichtbar gemacht**: CM5-Legacy-Global, Vim-Adapter, `foldManager`, `previewMode`, `onNodeInserted`/`onWindowMigrated` und der Bootstrap-`app.commands` loggen jetzt — `console.debug` für einen bewussten Trade-off mit funktionierender Alternative, `console.warn` wo Plugin-Code stillschweigend nicht läuft. `executeCommand` liefert dabei `false` statt `undefined`, damit ein prüfendes Plugin den Fehlschlag sieht.
- **`EditorShim` bekam das Proxy-Sicherheitsnetz**: War die einzige große Shim-Oberfläche ohne — ein nicht emuliertes `editor.*` war ein roher `TypeError` aus Plugin-Code heraus statt eines geloggten, über `window.__slatebasePluginApiGaps()` auffindbaren Eintrags. `GapShim` deckt damit neun Oberflächen ab.

**Bewusst nicht angefasst:** Das Scoping-Modell als solches (Plugin-CSS darf Slatebases Kern-DOM weiterhin nicht umgestalten — Host-Klassen sind die einzige Ausnahme, weil sie den Kontext des Plugin-Elements beschreiben und nicht fremdes DOM), der leere `.view-header`-Platzhalter, und die fehlende Namespacing von `@keyframes`. Alle drei sind in `PLUGIN-COMPAT.md` unter den bekannten Lücken dokumentiert.

**Testbilanz:** 32 neue Frontend-Tests (`css-injector` Host-Klassen, `notice`, `deliberate-noops`, `editor-shim.gap`); ein bestehender `css-injector`-Test kodierte den Host-Klassen-Bug als Erwartung und wurde korrigiert. Gesamtsuite 2509 grün, `tsc -b` und `eslint --quiet` fehlerfrei.

---

## Erledigt — Kontextmenü-Ausbau (Direktauftrag, kein Roadmap-Track) ✅

**Kein Spec-Verzeichnis** — direkt beauftragter Ausbau des Rechtsklick-Kontextmenüs auf praktisch jede Oberfläche der App (2026-08-24).

Vorher hatte nur der Datei-Explorer ein echtes Kontextmenü; alle übrigen Oberflächen (Tabs, Editor, gerenderte Links, Graph-Knoten, Links-Panel, Suchergebnisse) hatten entweder gar keins oder das native Browser-Menü. Zentrales neues Stück: `plugin-menu-bridge.ts` — feuert die echten Obsidian-Workspace-Events (`file-menu`/`files-menu`/`editor-menu`/`url-menu`) und übersetzt das von Plugins befüllte `Menu`-Objekt in `ContextMenuItem[]`, sodass jede neue Oberfläche automatisch plugin-erweiterbar ist.

- **Tab-Leiste**: Schließen/Andere schließen/Rechts schließen (neue Reducer-Actions `CLOSE_OTHER_TABS`/`CLOSE_TABS_TO_RIGHT` in `tabState.ts`) + Reveal/Umbenennen/Löschen + `file-menu` mit Source `'tab-header'` (wie in echtem Obsidian, das Tab-Header-Menüs über denselben `file-menu`-Event abwickelt).
- **Editor** (`editor-context-menu.ts`, neu): Ausschneiden/Kopieren/Einfügen, Link einfügen, Submenüs für Text-/Absatzformat/Element einfügen/Tabelle bearbeiten (delegieren an bestehende `editor:*`-Core-Commands — Verhalten bleibt automatisch identisch zur Befehlspalette), **neue Aktion „Auswahl in neue Notiz extrahieren"** (Note-Composer-Äquivalent: fragt nach Namen, nutzt `getAvailablePath()` für kollisionssichere Benennung, ersetzt die Auswahl durch einen Wikilink), Kopieren als Markdown, Zeilennummern umschalten (Checkbox-Item), `editor-menu`. Ersetzt den zuvor wirkungslosen Core-Command `editor:context-menu`. Neue Formatierungs-Aktion `'callout'` (`editor/formatting.ts`/`types.ts`, umschließt Auswahl/Zeile mit `> [!note]`) nur für diesen Menüeintrag.
- **Links in Editor & Rendering**: Rechtsklick auf einen gerenderten Live-Preview-Link zeigt jetzt ein linkspezifisches Menü (`file-menu` für interne Wikilinks, `url-menu` für externe) statt des generischen Editor-Menüs; gleiche Behandlung für gerenderte Links im View Mode über ein neues `data-link-path`-Attribut.
- **Links-Panel**: Datei-Menü pro Eintrag, zusätzlich einklappbare Abschnitte mit Trefferzahl (neue `CollapsibleSection`) und ein behobener `overflow-y`-Bug (Panel lief zuvor lautlos ohne Scrollbalken über). **Link-Zähler in der Statusleiste** (kleine, an dieselbe Datenquelle angehängte Ergänzung): neues `LinkCountsItem` zeigt "N aus- / M eingehend" für die aktive Datei — keine neue Berechnung, nur eine neue Präsentation der bereits fürs Links-Panel berechneten Zahlen (`linkCountsBridge.ts`/`useLinkCounts.ts`, Publish/Subscribe analog zu `VaultNameItem`/`WordStatsItem`), einzeln in Settings → Darstellung umschaltbar.
- **Outline-Panel**: eigenständiges, lokales Mini-Menü (Überschriftentext kopieren / Link zur Überschrift kopieren) — bewusst nicht über die Plugin-Bridge geroutet, da Überschriften keine `TAbstractFile`s sind.
- **Graph-Ansicht**: Öffnen/Reveal/Umbenennen/Löschen + `file-menu` für aufgelöste Datei-Knoten (Tag-/Property-/unresolved-Knoten bewusst ohne Menü, wie in echtem Obsidian).
- **Suchergebnisse**: Datei-Menü pro Dateigruppen-Header, bei Multi-Vault-Suche auf den aktiven Vault beschränkt (Reveal/Umbenennen/Löschen ergeben nur im gerade ausgewählten Vault Sinn).
- **Globaler Fallback** (`GlobalContextMenuFallback.tsx`, neu): unterdrückt das native Browser-Menü auf allen übrigen Flächen (Settings-Seiten, Chrome-Leerraum) mit einem einzelnen „Kopieren"-Eintrag bei aktiver Textauswahl, sonst leer — einmalig am App-Root gemountet, analog zu `GlobalTooltip`.
- **Trägt-Infrastruktur** für Reveal/Umbenennen/Löschen von außerhalb des Explorers (Tab-Leiste, Links-Panel, Suche, Graph): neue `fileNavigation.ts` (aktiviert den Explorer über den bestehenden Core-Command `file-explorer:open`, dispatcht dann die Aktion) + `fileOpBridge.ts` (CustomEvent + Pending-Slot-Muster, analog zum bestehenden `revealFileBridge.ts`, damit ein noch nicht gemounteter Explorer die Anfrage beim Mount abholt).

**Echter Bug gefunden und gefixt:** Synthetische `TFile`/`TFolder`-Objekte für Menü-Items (`plugin-event-bridge.ts`) hatten `parent: null` und kein korrektes Prototype — `file instanceof TFile` schlug fehl, `.parent` war immer `null`. Betraf u. a. **Excalidraws** Tab-/Datei-Menü-Handler „New drawing". Fix: echter Eltern-Ordner wird berechnet, `Object.setPrototypeOf()` gegen die globalen `obsidian.TFile`/`TFolder`-Prototypen (analog zu einem bestehenden Muster in `vault-shim.ts`). Details: `lessons-learned.md` #118–119, `PLUGIN-COMPAT.md`.

**Nebenbei gefunden und behoben (unabhängig vom Kontextmenü-Scope):**
- `SearchPanel.tsx`/`.css`: CSS-Klassenname des Einzeltreffer-„Ersetzen"-Buttons stimmte nie mit der tatsächlich im TSX verwendeten Klasse überein (`.search-panel__hit-replace-btn` vs. `search-panel__replace-hit-btn`) — bestehender, unbemerkter Mismatch, jetzt konsistent benannt (`.search-panel__replace-all-btn`) inkl. Erfolgs-/Fehler-/Lade-Styling; zusätzlich kollisionssicherer React-`key` (`${resultId}::${hitIndex}`) für die Treffer-Liste.
- Scroll-Chaining-Fix (`html`/`body` jetzt `height:100%; overflow:hidden` + `overscroll-behavior`) und CSS-Snippets-Dark-Mode-Spezifitätsfix (`:where()`) — siehe `lessons-learned.md` #124–125.

**Nicht angefasst:** Der veraltete, redundante „Drop-Zone am Root"-`<li>` im Datei-Explorer (eigener `dropToRoot`-i18n-String) wurde entfernt, weil Droppen direkt auf die Vault-Zeile selbst bereits funktionierte — reine Aufräumarbeit, kein Funktionsverlust.

---

## Erledigt — Plugin-Compat-Fixes: YAML-Frontmatter, Editor-Shim, EditorSuggest-Timing (Direktauftrag, kein Roadmap-Track) ✅

**Kein Spec-Verzeichnis** — dritter QS-Durchlauf über die Plugin-Kompatibilitätsschicht, unabhängig vom Kontextmenü-Ausbau gefunden, vermutlich beim Durchtesten echter Plugins gegen die neuen Menü-Oberflächen (2026-08-24). Details siehe `PLUGIN-COMPAT.md`, `lessons-learned.md` #120–122.

- **Handgestrickter YAML-Frontmatter-Parser durch echte `yaml`-Bibliothek ersetzt** (`file-manager-shim.ts`, `metadata-parser.ts`, `obsidian-api-extensions.ts`): Der bisherige Parser kannte nur flache `key: value`-Paare + Inline-Arrays (`[a,b]`); verschachtelte Objekte/Arrays wurden beim Schreiben still zu `"[object Object]"` oder beim Lesen verworfen. Auslösender Realfall: **Day Planners** verschachtelte `planner: { log: [...] }`-Frontmatter-Struktur. Echter Datenverlust-Bugfix, betrifft jedes Plugin mit strukturiertem Frontmatter.
- **`Editor.containerEl`/`coordsAtPos()`/`cursorCoords()` ergänzt** (`editor-shim.ts`): reale, in Obsidians öffentlicher API nicht dokumentierte Editor-Member. **„Editing Toolbar"** ruft sie zur Positionierung seiner schwebenden Auswahl-Toolbar auf — der generische Gap-Proxy lieferte zuvor eine immer-truthy No-Op-Funktion, deren DOM-Methodenaufrufe auf dem Rückgabewert einen `TypeError` auslösten. Echter Absturz-Fix.
- **`EditorSuggest`-Timing-Bug** (`editor-suggest-manager.ts`): fehlender Microtask-Yield vor dem Popover-Rendering ließ synchrone `getSuggestions()`-Implementierungen mit `"Reading the editor layout isn't allowed during an update"` abstürzen (Aufruf läuft aus einem CM6-`ViewPlugin.update()` heraus). Betrifft jedes `EditorSuggest`-Plugin mit synchroner Vorschlagsquelle.

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

**Abhängigkeiten:** Prio 8 (Properties-Editor & Suchoperatoren) ✅ — Vorarbeit erledigt. Profitiert von Prio 9 (Workspaces), ist davon aber nicht hart blockiert.

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

**Kein Ersatz durch das Obsidian-Importer-Plugin:** Das Community-Plugin `obsidian-importer` (siehe [[Advanced/Plugins/Importer]] im Welcome Vault) deckt Notion/Evernote/HTML bereits ab, ist aber kein Substitut für dieses Feature — es läuft hinter dem experimentellen `obsidian-plugin-compat`-Toggle und erfordert manuelle Installation/Aktivierung, was für die Zielgruppe (neue Nutzer beim Onboarding) zu viel Reibung ist. Außerdem fehlt der geforderte Mapping-Report nach dem Import. Bewertet 2026-08-22.

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

## Prio 16 — Echte E2E-Test-Suite (Track F)

Scope: ~30–45h. **Spec:** `.kiro/specs/e2e-testing/` — Requirements + Design vollständig (2026-08-21).

Playwright ist bereits als Dependency/Config vorhanden, aber der einzige Spec (`demo-recording.spec.ts`) hat keine Assertions (nur GIF-Aufnahme fürs Marketing) und läuft nicht in CI — es gibt aktuell keinen echten Test, der Frontend und Backend als reales, über HTTP verbundenes System prüft.

**Zusammenfassung:**

- Zwei-Stufen-Strategie: schneller Dev-Stack-Lauf (Vite + Backend-Dev-Prozess) bei jedem Push/PR, realitätsnaher Docker-Stack-Lauf (`docker-compose.dev.yml`, echte Container/Nginx) nightly + vor Releases
- Test_Data_Isolation über dediziertes Datenverzeichnis/Volume pro Lauf, Seed-Daten (Admin-Login, Test-Vault) per API im `globalSetup` statt eingecheckter Fixtures
- Page-Object-Modell + schrittweise `data-testid`-Einführung statt der fragilen CSS-/`title`-Selektoren im bestehenden Demo-Skript
- Zwei-Browser-Kontext-Tests für Realtime/SSE-Szenarien (z.B. Vault-Sharing), die Unit-Tests strukturell nicht abdecken können
- 4 Rollout-Phasen: Fundament (Login) → Kern-Workflow (Vault/Explorer/Editor) → Realtime/Sharing → Admin + Docker-Stufe

**Abhängigkeiten:** Keine — unabhängig von den Produkt-Feature-Tracks, nutzt nur bestehende Infrastruktur (Playwright-Config, Docker-Compose, CI).

**Empfehlung:** Trotz Nummer 16 kein Grund, bis zuletzt zu warten — reine Qualitätsinfrastruktur ohne Abhängigkeiten, sinnvoll parallel zu jedem anderen Track einschiebbar. Je früher etabliert, desto mehr der nachfolgenden Features (Workspaces, Bases, Collaborative Editing) profitieren von Regressionsschutz auf echtem Stack-Niveau.

---

## Gesamtaufwand (Schätzung)

| Track | Aufwand |
|-------|---------|
| A: Politur | ✅ keine offenen Punkte mehr |
| B: Plugins (Themes + Server-Side) | ~63–88h |
| C: Sharing | ~19–24h |
| D: Editor (Collaborative) | ~68–88h |
| E: AI (Semantische Suche) | ~38–58h |
| F/G: Qualität & Layout (Responsive + Workspaces) | ~84–124h |
| H: Strukturierte Daten (Bases) | ~55–75h |
| I: Onboarding (Importer) | ~20–30h |
| F: Echte E2E-Test-Suite | ~30–45h |
| **Summe** | **~377–532h** |

---

## Bewusst nicht implementierte Features

Bases, Workspaces und PDF-Export standen hier zeitweise als "kein Äquivalent geplant" — PDF-Export ist inzwischen umgesetzt (siehe „Erledigt" oben), Bases und Workspaces/Split-Panes sind auf Nutzerwunsch aktiv in der Roadmap oben (Prio 9, 10). Die folgende Liste enthält nur, was tatsächlich dauerhaft ausgeschlossen bleibt:

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
