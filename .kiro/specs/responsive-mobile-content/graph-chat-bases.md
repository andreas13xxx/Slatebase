# Mobile-Anpassung von Graph, Chat und Bases — Spec und Umsetzung (Phase 4)

Erweitert `requirements.md`/`design.md` (Tabellen, Einstellungen) um die drei übrigen in `responsive-mobile/known-limitations.md` genannten Bereiche. Alles gilt unter 768 px Fensterbreite bzw. auf Geräten mit `pointer: coarse`; ab 768 px bleibt das Verhalten unverändert.

## Befund (aus dem Code, nicht im Browser gemessen)

- **Graph:** Pinch-Zoom und Touch-Pan gab es schon (`GraphView.touch.test.tsx`). Es blieben: Einstellungs-Panel fest 280 px breit (läuft aus einem schmalen Graphbereich heraus), Suchfeld fest 220 px mit `right: 48px` (überlappt bei 375 px), 32-px-Schalter, Eingabefeld unter 16 px (iOS zoomt beim Fokus).
- **Chat:** Zwei Spalten nebeneinander (Liste 240–360 px fest, Konversation daneben). Unter 768 px bleibt für die Konversation fast nichts.
- **Bases:** Werkzeugleiste mit `flex-wrap: nowrap` (läuft über den Rand), Kanban-Spalten mit fester Mindestbreite 220 px (schmale Ansichten zeigen eine halbe Spalte), Kartenraster mit fester Mindestbreite, Toolbar-Buttons unter 44 px. Die Tabelle scrollte schon seitlich.

## Anforderungen und Umsetzung

**Chat (Master-Detail)**
- R-C1 Unter 768 px zeigt die Seite entweder die Konversationsliste (volle Breite) oder die geöffnete Konversation, nie beide.
- R-C2 In der Konversation führt ein Zurück-Knopf (≥ 44 px, Beschriftung „Chat", `aria-label` „Zurück zur Konversationsliste") zur Liste. Er existiert im DOM immer, ist ab 768 px per CSS ausgeblendet.
- R-C3 Zurück verlässt nur die Konversation (`CONVERSATION_DESELECTED`): die Liste, die Ungelesen-Zähler und der Realtime-Empfang bleiben, eine neue Nachricht für die verlassene Konversation zählt wieder als ungelesen.
- Umgesetzt: `ChatPage.tsx` (`chat-page--detail`, Zurück-Knopf), `chatState.ts` (Aktion + Test), `App.css`, i18n `chat.backToList` DE/EN.

**Graph**
- R-G1 Das Einstellungs-Panel ist nie breiter als der Graphbereich; auf Touch liegt es unter einem 44-px-Schalter.
- R-G2 Das Suchfeld nimmt unter 768 px den Platz links vom Schalter ein (keine feste Breite); auf Touch ist die Schrift 16 px.
- Umgesetzt: `GraphSettingsPanel.css`, `App.css`.

**Bases**
- R-B1 Die Werkzeugleiste umbricht statt zu überlaufen; Popover bleiben im Fenster (`max-width: calc(100vw - 16px)`).
- R-B2 Kanban-Spalten rasten ein (`scroll-snap`), eine Spalte ist `min(82vw, 300px)` breit; die „gruppierte Karten"-Zeilenansicht bleibt unverändert.
- R-B3 Das Kartenraster überschreitet nie die Breite der Ansicht.
- R-B4 Toolbar-Buttons, Selects und Modus-Schalter sind auf Touch ≥ 44 px.
- Umgesetzt: `BasesView.css`.

## Nicht-Ziele und offene Punkte
- Keine Karten-/Listenumwandlung der Bases-Tabelle und keine fixierte erste Spalte (die Tabelle scrollt schon seitlich; die Kopfzeile ist bereits sticky, eine zweite Sticky-Achse müsste an der echten Darstellung geprüft werden).
- Plugin-Ansichten der Bases (z. B. Karte) liefern ihr eigenes Layout und sind nicht angepasst.
- Chat: kein eigener Test für den Seitenwechsel auf Komponentenebene (`ChatPage` braucht vier Provider); getestet ist die Reducer-Aktion.
- **Nichts davon wurde in einem Browser oder auf einem Gerät angesehen.**
