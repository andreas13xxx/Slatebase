# Mobile-Anpassung von Tabellen und Einstellungen — Requirements

Folgespec zu `responsive-mobile/` (App-Shell, Canvas, Touch). Dort steht als bekannte Lücke: Tabellen und der Einstellungs-Dialog unter 768 px sind nicht angepasst. Diese Spec schließt sie. Sie ist **nicht umgesetzt**; Phase 0 misst zuerst.

## Ausgangslage (aus dem Code, nicht gemessen)

- **Einstellungen** (`components/settings/SettingsPanel.tsx/.css`): Dialog `90vw` × `80vh` (max 1000 × 700). Eine Container-Query ab 700 px schaltet auf Sidebar links; darunter steht ein „gestapeltes" Layout mit einem Umschalter (`settings-panel-mobile-toggle`), der die Navigation auf `max-height: 50vh` aufklappt. Das gilt nach **Containerbreite**, nicht nach dem Fenster-Breakpoint von `useBreakpoint()`.
- **Tabellen:** neun Stellen mit `<table>`: `AdminUsersPage`, `AdminVaultsPage`, `AdminAuditPage`, `AdminLogsPage`, `McpTokensPage`, `KeybindingsSection`, `PublicSharesSection`, `SearchOperatorHelp`, `BasesTableView`. Die Admin- und Token-Tabellen liegen in einem Wrapper mit `overflow-x: auto` (scrollen seitlich), mit festen Paddings von 8–14 px und `white-space: nowrap` in den Köpfen.
- Aktionen stehen in den Zeilen als Icon-Buttons; auf Touch gibt es die 44-px-Regeln aus `App.css` nur für Tab-Leiste, Explorer, Toolbar und Kontextmenü, nicht für Tabellenaktionen oder Einstellungs-Controls.

## Anforderungen

**R1 – Einstellungen unter 768 px**
- R1.1 Unter 768 px füllt der Dialog den Bildschirm (kein Rand, keine abgerundeten Ecken, `100dvh`), damit Formulare Platz haben.
- R1.2 Navigation und Inhalt sind nacheinander erreichbar: Kategorie wählen, dann Inhalt mit einem Zurück-Knopf (Master-Detail), statt einer Aufklapp-Liste über dem Inhalt. Die Suche bleibt oben.
- R1.3 Alle Controls einer Einstellungszeile (Label + Eingabe) stapeln untereinander; Eingabefelder nutzen die volle Breite; Schalter und Buttons sind mindestens 44 px hoch.
- R1.4 Die bestehende Tastaturbedienung und die Fokusfalle (`useFocusTrap`) bleiben; der Zurück-Knopf ist per Tastatur erreichbar.
- R1.5 Das Verhalten ab 768 px bleibt unverändert (Regressionsprüfung bei 768 und 1440 px).

**R2 – Tabellen unter 768 px**
- R2.1 Jede der neun Tabellen ist unter 768 px benutzbar, ohne dass die Seite selbst seitlich scrollt. Entweder (a) die Tabelle scrollt in ihrem Wrapper mit sichtbarem Hinweis (Schatten/Kante), oder (b) sie wird zu einer Kartenliste, je nach Tabelle (siehe Design).
- R2.2 Die wichtigste Spalte (Name, Benutzername, Pfad) bleibt in jeder Variante sichtbar; bei seitlichem Scrollen bleibt sie links fixiert.
- R2.3 Zeilenaktionen sind Touch-Ziele von mindestens 44 px, ohne die Desktop-Zeilenhöhe zu ändern.
- R2.4 Aktionen, die nur bei Hover erscheinen, sind auf Geräten ohne Hover sichtbar (`@media (hover: none)`).
- R2.5 `BasesTableView` behält seine Bearbeitung in der Zelle; unter 768 px wird nur das seitliche Scrollen mit fixierter Dateinamen-Spalte verbessert, keine Kartenumwandlung (Bases hat eine eigene Karten-Ansicht).

**R3 – Nicht-Ziele**
- Keine neue Layout-Bibliothek, keine Inline-Styles; Design-Tokens aus `index.css`.
- Kein eigener Mobile-Dialog als zweite Komponente: es bleibt ein `SettingsPanel`.
- Keine Änderung an der Datenhaltung oder den API-Routen.

**R4 – Qualität**
- Neue Texte in `de.ts` und `en.ts`. axe-Test für den Master-Detail-Fluss. Kein Verlust bei Tastatur- und Screenreader-Bedienung (`aria-current`, Fokus nach Wechsel auf die Überschrift der Kategorie).
