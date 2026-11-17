# Git-Sync: Papierkorb, Aktivität pro Datei, Versionen — Anforderungen

## Ausgangslage

Git ändert beim Pull Dateien direkt im Vault-Verzeichnis. Dabei umgeht es die Dienste, die ein
normaler Schreibvorgang (REST/MCP) benutzt: Papierkorb, Dateiversionen und Aktivitätsleiste.
Heute erscheint nur ein Sammel-Ereignis `sync.completed` (nur bei `pulledFiles > 0`).

## Anforderungen

- **R1 Papierkorb:** Eine beim Sync (Pull/Merge) gelöschte Datei landet im Papierkorb des Vaults
  und lässt sich wie jede andere wiederherstellen.
- **R2 Aktivität pro Datei:** Jede beim Sync angelegte, geänderte, gelöschte oder verschobene
  Datei erzeugt ein eigenes Ereignis (`note.created/edited/deleted/moved`, `origin: 'git-sync'`).
  Das Sammel-Ereignis `sync.completed` bleibt zusätzlich bestehen.
- **R3 Versionen:** Eine beim Sync geänderte Datei erhält eine neue Version mit dem Inhalt VOR
  dem Sync (gleiche Semantik wie beim Speichern; `maxVersionsPerFile` gilt).
- **R4 Link-Index:** Der Link-Index wird für jede berührte Datei nachgeführt.
- **R5 Robust:** Kein Nebeneffekt darf den Sync fehlschlagen lassen. Fehler nur ins Log.
- **R6 Grenzen:** Versteckte Pfade (Punkt-Präfix) werden nicht erfasst. Ab 500 berührten Dateien
  nur `sync.completed` (keine Einzel-Ereignisse), Papierkorb/Versionen laufen weiter.
- **R7 Feature-Gates:** Aktivität nur bei Toggle `activity-timeline`. Papierkorb und Versionen
  immer.
