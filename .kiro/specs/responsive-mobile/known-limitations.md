# Responsive/Mobile — Bekannte Einschränkungen (Task 25)

Stand 2026-11-14. Alles hier ist **nur in Tests und CI geprüft, nicht auf einem echten Gerät** (Task 24 ist offen).

## Layout
- Unter 768 px sind Sidebar und rechtes Panel Drawer. Beim Wechsel in dieses Layout und beim Öffnen einer Notiz schließen sie. Das **überschreibt die gespeicherte Desktop-Sichtbarkeit**: nach der Rückkehr zum Desktop bleiben beide Panels zu, bis man sie wieder öffnet.
- Die Drawer haben eine feste Breite (`min(85vw, 320px)`). Die gespeicherten Desktop-Breiten gelten dort nicht.
- Ein Drawer hat keine Wischgeste zum Schließen. Es schließt der Backdrop oder das Öffnen einer Notiz.
- Tabellen unter 768 px: sechs scrollen seitlich mit fixierter erster Spalte, drei (Benutzer, Vaults, MCP-Token) werden zu Karten (Spec `responsive-mobile-content/`, Phase 1). Das Aussehen ist nur im CSS gebaut, nicht in einem Browser angesehen. `BasesTableView` scrollte schon vorher und hat keine fixierte Spalte.
- Einstellungs-Dialog: Unter 700 px Panelbreite zeigt er erst die Navigation, dann den gewählten Abschnitt mit Zurück-Knopf; unter 768 px Fensterbreite füllt er den Bildschirm. Nur im CSS gebaut, nicht angesehen.
- Chat (Liste und Konversation wechseln sich ab, Zurück-Knopf), Graph (Panel und Suchfeld passen sich an) und Bases (Werkzeugleiste umbricht, Kanban rastet ein) sind unter 768 px angepasst, siehe `responsive-mobile-content/graph-chat-bases.md`. Nur im CSS gebaut, nicht angesehen. Plugin-Ansichten der Bases sind nicht angepasst.
- Das Layout richtet sich nach der **Fensterbreite**, nicht nach dem Gerät. Ein schmales Desktop-Fenster zeigt die Drawer ebenfalls.

## Touch
- Canvas: Auf Knoten und Handles ist `touch-action: none`. Der Text in einem Knoten scrollt per Touch nur im Bearbeiten-Modus (im Textfeld).
- Canvas: Zwei Finger, von denen einer auf einem Knoten startet, zoomen nicht. Es zählen nur Finger, die auf dem Hintergrund beginnen.
- Resize-Handles haben 44 px Trefferfläche, Editor-Checkboxen nur 24 px (WCAG-2.2-Minimum). Weitere interaktive Editor-Elemente wurden nicht einzeln geprüft.
- Bildschirmtastatur: `useKeyboardViewport` schiebt den Editor über die Tastatur (iPad-Arbeit). Auf Android-Chrome, das den Layout-Viewport selbst verkleinert, ist nichts zu kompensieren. Beides ist nicht auf Geräten verifiziert.

## PWA
- Es gibt ein Manifest (`display: standalone`), PNG-Icons (192/512), ein maskierbares 512-px-Icon, ein Apple-Touch-Icon und den Link in `index.html`.
- Es gibt einen **Service Worker nur für eine Offline-Seite** (`public/sw.js`): Er beantwortet eine fehlgeschlagene Seiten-Navigation mit `offline.html`. Notizen, API-Antworten und Assets werden nie zwischengespeichert, also gibt es **keinen Offline-Betrieb**. Er wird nur im Produktions-Build registriert.
- Die Installierbarkeit wurde nicht in Chrome DevTools geprüft, das maskierbare Icon nicht auf einem Android-Gerät gesehen.
