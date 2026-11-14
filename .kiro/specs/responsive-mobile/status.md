# Responsive/Mobile — Abschlussstand

Stand 2026-11-14. Die Spec ist **gebaut, aber nicht abgenommen**: Task 24 (Kernflows auf 375/768/1024/1440 px in einem Browser oder auf einem Gerät) ist nicht erledigt. Alle Aussagen unten stützen sich auf Tests, Lint und Build.

| Phase | Inhalt | Stand | PR |
|-------|--------|-------|----|
| 1 | `useBreakpoint`, Konstanten, Test-Matrix | gemergt | #374 |
| 2 | Sidebar und Right-Panel als Drawer, Backdrop, Tablet schmaler | gemergt | #376 |
| 3 | Canvas: Pan, Pinch, Knoten-Drag/Resize/Anker per Pointer-Events | gemergt | #377 |
| 4 | Resize-Handles 44 px (Pointer-Resize gab es schon) | gemergt | #378 |
| 5 | Editor: Tastatur-Viewport gab es schon (`useKeyboardViewport`), Checkboxen 24 px | gemergt | #378 |
| 6 | Manifest, Icons gab es schon; maskierbares Icon, Service Worker für eine Offline-Seite | gemergt | #379, #380 |
| 7 | Bekannte Einschränkungen (`known-limitations.md`) | gemergt | #379 |
| Folgespec | Tabellen, Einstellungen, Chat, Graph, Bases (`../responsive-mobile-content/`) | #381 gemergt, Chat/Graph/Bases offen | #381, #386 |

Die Häkchen in `tasks.md` stehen in den jeweiligen PRs, nicht auf `master`; nach dem Mergen fehlen dort höchstens Konflikte in dieser Datei.

## Was zur Abnahme noch fehlt
1. Task 24: Matrix (375/768/1024/1440 px, Hell/Dunkel) mit Touch-Emulation durchgehen: Datei öffnen/bearbeiten, Drawer, Canvas pannen/zoomen, Einstellungen, Chat, Tabellen.
2. Folgespec Phase 0: Tabellen- und Einstellungsansicht ansehen, Kartenform mit einem Screenreader prüfen.
3. Installierbarkeit (Chrome DevTools) und maskierbares Icon auf Android.
4. Die gespeicherte Panel-Sichtbarkeit wird im schmalen Layout überschrieben (siehe `known-limitations.md`); entscheiden, ob das so bleiben soll.
