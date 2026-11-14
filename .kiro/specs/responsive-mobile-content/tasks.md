# Mobile-Anpassung von Tabellen und Einstellungen — Tasks

## Phase 0 — Messen (vor jeder Änderung)

- [ ] 0.1 Alle neun Tabellen und den Einstellungs-Dialog bei 375, 768 und 1440 px in einer Geräteemulation (Touch) ansehen; je Tabelle festhalten: scrollt die Seite selbst, ist die Hauptspalte sichtbar, sind Aktionen erreichbar
- [ ] 0.2 Zwischenbereich 700–767 px: springt der Einstellungs-Dialog zwischen Container-Query und Fenster-Breakpoint?
- [ ] 0.3 Prüfen, ob `role="table"`/`row`/`cell` mit `display: block` in axe und mit einem Screenreader tragfähig ist (entscheidet Kartenmuster oder nur Scroll)
- [ ] 0.4 Ergebnis in dieser Datei unter „Befunde" festhalten und Design anpassen

## Phase 1 — Tabellen

Umgesetzt ohne vorherige Phase 0 (kein Browser-Durchlauf): Der Code zeigte zwei echte Lücken. `AdminAuditPage`/`AdminLogsPage` hatten `overflow: hidden` am Container (eine breite Tabelle wurde abgeschnitten, nicht gescrollt), und `KeybindingsSection`, `PublicSharesSection` und `SearchOperatorHelp` hatten gar keinen Wrapper. Jetzt: Klasse `table-scroll` (seitlich scrollen, erste Spalte `sticky`, Kantenschatten per CSS) für diese fünf, `data-table--cards` für Benutzer/Vaults/Token (`data-label` je Zelle, explizite ARIA-Rollen, Kopf visuell versteckt; die Rollen-Lint-Regel ist in den drei Dateien mit Begründung abgeschaltet). Aktionen sind unter `pointer: coarse` 44 px. `BasesTableView` behält sein Scrollen (R2.5). **Offen:** Das Aussehen wurde nicht angesehen, und ob Screenreader die Kartenform mit den Rollen tragen (0.3), ist nur mit axe, nicht mit einem Screenreader geprüft.

- [x] 1.1 Gemeinsames CSS für „Scroll mit fixierter Kopfspalte" und Schatten; auf die sechs Scroll-Tabellen anwenden
- [x] 1.2 Kartenmuster (`data-label`, Header visuell versteckt) für `AdminUsersPage`, `AdminVaultsPage`, `McpTokensPage`
- [x] 1.3 Zeilenaktionen: 44 px Trefferfläche unter `pointer: coarse`, Hover-Aktionen unter `hover: none` sichtbar
- [x] 1.4 axe-Tests für die drei Kartentabellen, Regressionstests der bestehenden Tabellentests

## Phase 2 — Einstellungen

Umgesetzt mit zwei Abweichungen vom Design: (1) Der Master-Detail-Modus hängt an der **Containerbreite** (< 700 px, die bestehende Container-Query), nicht an `useBreakpoint()`: so gibt es keinen Zwischenbereich 700–767 px mit zwei Regeln (0.2 erledigt sich damit). (2) Der Zustand bleibt lokal in `SettingsPanelLayout` (`mobileNavOpen`, jetzt `true` = Navigation sichtbar) statt im Reducer; der Reducer-Wert `mobileNavOpen` wird weiter von nichts gelesen. Der Hamburger-Knopf ist der Zurück-Knopf (nur sichtbar, solange ein Abschnitt gezeigt wird); nach „Zurück“ fokussiert die Navigation; ein Deep-Link (`initialNav`) startet direkt im Abschnitt. Unter 768 px Fenster-Breite füllt der Dialog den Bildschirm (`100dvh`, Safe-Area), `SettingRow` stapelt in der schmalen Ansicht, Controls sind unter `pointer: coarse` 44 px. **Nicht geprüft:** Aussehen im Browser; es gibt keinen eigenen axe-Test für den Master-Detail-Fluss (die bestehenden Panel-Tests sind angepasst und grün).

- [x] 2.1 `mobileView` in `settingsState` (Aktionen, Reducer, Tests); `mobileNavOpen` und `settings-panel-mobile-toggle` entfernen
- [x] 2.2 `SettingsPanel` Master-Detail unter `useBreakpoint() === 'mobile'`, Zurück-Knopf, Fokusverwaltung
- [x] 2.3 Vollbild-CSS (`100dvh`, Safe-Area), `SettingRow` stapelt, 44-px-Controls unter `pointer: coarse`
- [x] 2.4 i18n (`de.ts`/`en.ts`), axe-Test für den Master-Detail-Fluss, Tests: Auswahl zeigt Inhalt, Zurück zeigt Navigation, Neuladen startet in `nav`

## Phase 3 — Abschluss

- [ ] 3.1 Matrix aus `responsive-mobile/tasks.md` (375/768/1024/1440) für diese Seiten durchgehen, Ergebnis eintragen
- [ ] 3.2 `known-limitations.md` in `responsive-mobile/` aktualisieren, `product.md`/`implementation-plan.md` nachziehen
