# Responsive/Mobile — Bekannte Einschränkungen (Task 25)

Stand 2026-11-14. Alles hier ist **nur in Tests und CI geprüft, nicht auf einem echten Gerät** (Task 24 ist offen).

## Layout
- Unter 768 px sind Sidebar und rechtes Panel Drawer. Beim Wechsel in dieses Layout und beim Öffnen einer Notiz schließen sie. Das **überschreibt die gespeicherte Desktop-Sichtbarkeit**: nach der Rückkehr zum Desktop bleiben beide Panels zu, bis man sie wieder öffnet.
- Die Drawer haben eine feste Breite (`min(85vw, 320px)`). Die gespeicherten Desktop-Breiten gelten dort nicht.
- Ein Drawer hat keine Wischgeste zum Schließen. Es schließt der Backdrop oder das Öffnen einer Notiz.
- Nicht geprüft und nicht angepasst: Tabellen, Einstellungs-Dialog, Graph-Ansicht, Chat, Bases-Ansichten und Admin-Seiten unter 768 px. Sie haben nur die Media-Queries, die schon vorher existierten.
- Das Layout richtet sich nach der **Fensterbreite**, nicht nach dem Gerät. Ein schmales Desktop-Fenster zeigt die Drawer ebenfalls.

## Touch
- Canvas: Auf Knoten und Handles ist `touch-action: none`. Der Text in einem Knoten scrollt per Touch nur im Bearbeiten-Modus (im Textfeld).
- Canvas: Zwei Finger, von denen einer auf einem Knoten startet, zoomen nicht. Es zählen nur Finger, die auf dem Hintergrund beginnen.
- Resize-Handles haben 44 px Trefferfläche, Editor-Checkboxen nur 24 px (WCAG-2.2-Minimum). Weitere interaktive Editor-Elemente wurden nicht einzeln geprüft.
- Bildschirmtastatur: `useKeyboardViewport` schiebt den Editor über die Tastatur (iPad-Arbeit). Auf Android-Chrome, das den Layout-Viewport selbst verkleinert, ist nichts zu kompensieren. Beides ist nicht auf Geräten verifiziert.

## PWA
- Es gibt ein Manifest (`display: standalone`), PNG-Icons (192/512), ein Apple-Touch-Icon und den Link in `index.html`.
- Es gibt **keinen Service Worker**, also keinen Offline-Betrieb und keine Offline-Seite.
- Es gibt **kein maskierbares Icon** (`purpose: maskable`): Android kann das Icon in einem Kreis auf weißem Rand zeigen.
- Die Installierbarkeit wurde nicht in Chrome DevTools geprüft.
