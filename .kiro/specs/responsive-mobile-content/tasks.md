# Mobile-Anpassung von Tabellen und Einstellungen — Tasks

## Phase 0 — Messen (vor jeder Änderung)

- [ ] 0.1 Alle neun Tabellen und den Einstellungs-Dialog bei 375, 768 und 1440 px in einer Geräteemulation (Touch) ansehen; je Tabelle festhalten: scrollt die Seite selbst, ist die Hauptspalte sichtbar, sind Aktionen erreichbar
- [ ] 0.2 Zwischenbereich 700–767 px: springt der Einstellungs-Dialog zwischen Container-Query und Fenster-Breakpoint?
- [ ] 0.3 Prüfen, ob `role="table"`/`row`/`cell` mit `display: block` in axe und mit einem Screenreader tragfähig ist (entscheidet Kartenmuster oder nur Scroll)
- [ ] 0.4 Ergebnis in dieser Datei unter „Befunde" festhalten und Design anpassen

## Phase 1 — Tabellen

- [ ] 1.1 Gemeinsames CSS für „Scroll mit fixierter Kopfspalte" und Schatten; auf die sechs Scroll-Tabellen anwenden
- [ ] 1.2 Kartenmuster (`data-label`, Header visuell versteckt) für `AdminUsersPage`, `AdminVaultsPage`, `McpTokensPage`
- [ ] 1.3 Zeilenaktionen: 44 px Trefferfläche unter `pointer: coarse`, Hover-Aktionen unter `hover: none` sichtbar
- [ ] 1.4 axe-Tests für die drei Kartentabellen, Regressionstests der bestehenden Tabellentests

## Phase 2 — Einstellungen

- [ ] 2.1 `mobileView` in `settingsState` (Aktionen, Reducer, Tests); `mobileNavOpen` und `settings-panel-mobile-toggle` entfernen
- [ ] 2.2 `SettingsPanel` Master-Detail unter `useBreakpoint() === 'mobile'`, Zurück-Knopf, Fokusverwaltung
- [ ] 2.3 Vollbild-CSS (`100dvh`, Safe-Area), `SettingRow` stapelt, 44-px-Controls unter `pointer: coarse`
- [ ] 2.4 i18n (`de.ts`/`en.ts`), axe-Test für den Master-Detail-Fluss, Tests: Auswahl zeigt Inhalt, Zurück zeigt Navigation, Neuladen startet in `nav`

## Phase 3 — Abschluss

- [ ] 3.1 Matrix aus `responsive-mobile/tasks.md` (375/768/1024/1440) für diese Seiten durchgehen, Ergebnis eintragen
- [ ] 3.2 `known-limitations.md` in `responsive-mobile/` aktualisieren, `product.md`/`implementation-plan.md` nachziehen
