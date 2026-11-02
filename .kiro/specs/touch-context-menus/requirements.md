# Touch-Kontextmenüs — Requirements

Ziel: Kontextmenüs, die bisher nur per Rechtsklick (bzw. natives `contextmenu`) erreichbar sind,
sind auch per Touch bedienbar. Basis ist `hooks/useLongPress.ts`.

- R1 Canvas: Long-Press auf Hintergrund oder Knoten öffnet das Canvas-Kontextmenü.
- R2 Datei-Explorer: Long-Press auf die Leerfläche öffnet das Menü des gewählten Vaults.
  Ein Long-Press auf eine Zeile (Vault/Ordner/Datei) öffnet weiterhin nur deren eigenes Menü.
- R3 Lesemodus: Long-Press auf einen Link öffnet das Link-Menü. Long-Press auf normalen Text
  bleibt der nativen Textauswahl überlassen.
- R4 Editor: Der Editor bekommt auf Touch-Geräten (`pointer: coarse`) einen Button in der
  Header-Zeile, der das Editor-Menü am Cursor öffnet (nutzt `editor:context-menu`).
  Kein Long-Press im Editor: er würde mit der nativen Auswahl/Lupe kollidieren.
- R5 Mausverhalten bleibt unverändert.

## Bewusst ausgespart (offene Infos nötig)
- Breadcrumb- und Bases-Menüs: Obsidians Menüeinträge sind nicht belegt.
- GlobalContextMenuFallback ("Kopieren"): auf iOS reicht das native Auswahlmenü.
