# Mobile-Anpassung von Tabellen und Einstellungen — Design

## Einstellungen

**Schalter:** `SettingsPanel` liest `useBreakpoint() === 'mobile'` (eine Quelle für „mobil", wie die App-Shell). Die Container-Query ab 700 px bleibt für das Desktop-Layout; unter 768 px Fensterbreite gewinnt der Master-Detail-Modus. Zwischen 700 und 767 px kann beides greifen: dort zählt der Fenster-Breakpoint (Phase 0 prüft, ob das einen sichtbaren Sprung gibt).

**Master-Detail:** Zustand `mobileView: 'nav' | 'content'` im bestehenden `settingsState`-Reducer (nicht lokal): `nav` zeigt Suche + Kategorieliste, Auswahl setzt `content`; ein Zurück-Knopf in der Kopfzeile setzt `nav`. Ersetzt `mobileNavOpen`/`settings-panel-mobile-toggle`. Beim Wechsel auf `content` geht der Fokus auf die Abschnittsüberschrift (`SettingsContent` hat bereits Fokusverwaltung), beim Zurück auf den zuletzt gewählten Navigationseintrag. `sessionStorage`-Persistenz (`settingsPersistence.ts`) speichert die Ansicht nicht mit: ein Neuladen startet in `nav`.

**Vollbild:** Unter 768 px `.settings-panel { width: 100vw; height: 100dvh; max-width/height: none; border-radius: 0; }`. `dvh` statt `vh`, damit die Adressleiste und die Tastatur (siehe `useKeyboardViewport`) den Dialog nicht verdecken. Safe-Area-Insets wie in `App.css`.

**Zeilen:** `SettingRow` stapelt Label und Control unter 768 px (`flex-direction: column; align-items: stretch`), das Hinweis-Text-Feld folgt darunter. Controls in `settings/ui` (Button, Checkbox-Zeile, Select) bekommen `min-height: 44px` unter `@media (pointer: coarse)`.

## Tabellen

Zwei Muster, ein gemeinsames Hilfs-CSS in `components/settings/ui` bzw. `App.css`:

1. **Scroll mit fixierter Kopfspalte** (Standard): Wrapper `overflow-x: auto`, erste Spalte `position: sticky; left: 0` mit Hintergrund und Trennlinie; ein Schatten am rechten Rand, solange mehr Inhalt folgt (CSS-only über `background-attachment: local` auf dem Wrapper, kein JS). Gilt für `AdminAuditPage`, `AdminLogsPage`, `KeybindingsSection`, `PublicSharesSection`, `BasesTableView`, `SearchOperatorHelp`.
2. **Kartenliste** unter 768 px: die Zeile wird zu einer Karte (Hauptspalte als Titel, übrige Spalten als `Label: Wert`-Paare, Aktionen unten). Gilt für `AdminUsersPage`, `AdminVaultsPage`, `McpTokensPage`, weil dort jede Zeile Aktionen trägt und viele Spalten hat. Umsetzung ohne Doppelmarkup: `td` bekommt `data-label` aus der Spaltenüberschrift, das CSS setzt unter 768 px `display: block` für `table/tbody/tr/td` und zeigt `attr(data-label)` per `::before`. Der Tabellenkopf wird visuell versteckt, bleibt für Screenreader (`clip`-Muster, nicht `display: none`).

Risiko des Kartenmusters: Screenreader verlieren bei `display: block` die Tabellensemantik. Gegenmittel: `role="table"`/`row`/`cell` auf den Elementen setzen. Phase 0 prüft das mit axe und einem Screenreader-Durchlauf; fällt es durch, bleibt Muster 1 für alle.

## Phasen-Reihenfolge

Zuerst Messung (Phase 0), dann Tabellen-CSS (kein Logikrisiko), dann Einstellungen (Zustand + Fokus), zuletzt Doku und Matrix-Prüfung aus `responsive-mobile/tasks.md`.
