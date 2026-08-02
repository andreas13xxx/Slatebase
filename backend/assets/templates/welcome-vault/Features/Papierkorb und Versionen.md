---
tags: [features]
---

# Papierkorb und Versionen

Slatebase schützt deine Daten mit zwei Sicherheitsnetzen: Der Papierkorb verhindert versehentliches Löschen, und das Versionssystem ermöglicht es, ältere Dateistände wiederherzustellen.

![[Screenshots/papierkorb.png]]

*Die Papierkorb-Ansicht*

---

## Papierkorb (Soft-Delete)

Wenn du eine Datei löschst, wird sie nicht sofort vernichtet — sie wandert in den Papierkorb.

### Datei löschen

- **Kontextmenü:** Rechtsklick auf Datei → "Löschen"
- **Tastenkürzel:** Datei auswählen → `Delete`-Taste
- **Ergebnis:** Datei verschwindet aus dem Explorer, ist aber im Papierkorb abrufbar

### Papierkorb öffnen

- **Sidebar-Button:** Klicke auf das Papierkorb-Icon in der Sidebar-Toolbar (links)
- **Command Palette:** `Ctrl+P` → "Papierkorb"

### Papierkorb-Ansicht

Die Papierkorb-Ansicht zeigt alle gelöschten Dateien mit:

| Spalte | Information |
|--------|-------------|
| Dateiname | Ursprünglicher Name mit Pfad |
| Gelöscht am | Zeitpunkt der Löschung |
| Aktionen | Wiederherstellen / Endgültig löschen |

### Datei wiederherstellen

1. Öffne den Papierkorb
2. Finde die gewünschte Datei
3. Klicke auf "Wiederherstellen"
4. Die Datei erscheint wieder an ihrem ursprünglichen Speicherort

Falls der ursprüngliche Ordner nicht mehr existiert, wird er automatisch neu erstellt.

### Endgültig löschen

Wenn du eine Datei unwiderruflich entfernen möchtest:

1. Öffne den Papierkorb
2. Klicke auf "Endgültig löschen" (Mülleimer-Icon)
3. Bestätige die Aktion im Dialog

---

## Aufbewahrungsfrist

Dateien im Papierkorb werden nach einer konfigurierbaren Frist automatisch gelöscht:

- **Standard:** 30 Tage
- **Bereich:** 0–365 Tage (0 = sofort löschen, kein Papierkorb)
- **Konfiguration:** Durch den Server-Administrator

### Automatischer Cleanup

Ein Hintergrund-Job prüft regelmäßig (Standard: alle 24 Stunden) den Papierkorb und entfernt abgelaufene Einträge. Du musst dich nicht manuell darum kümmern.

---

## Dateiversionen

Jedes Mal wenn du eine Datei speicherst, wird der vorherige Stand als Version aufbewahrt.

### Versionen anzeigen

1. Öffne die Datei, deren Versionen du sehen möchtest
2. Klicke auf das Uhr-Icon in der Tab-Leiste (oder Kontextmenü → "Versionen")
3. Der **Version-Browser** öffnet sich

### Version-Browser

Der Version-Browser zeigt:

- **Liste aller Versionen** — sortiert nach Zeitstempel (neueste oben)
- **Zeitstempel** — Datum und Uhrzeit jeder Speicherung
- **Inline-Diff** — Visuelle Darstellung der Änderungen zwischen Versionen

### Inline-Diff

![[Screenshots/version-diff.png]]

*Versions-Vergleich mit Inline-Diff*

Der Diff-Viewer zeigt Unterschiede zwischen zwei Versionsständen:

- **Grün** — Hinzugefügte Zeilen
- **Rot** — Entfernte Zeilen
- **Grau** — Unveränderte Kontext-Zeilen

Du kannst jede Version mit der aktuellen Datei oder mit einer anderen Version vergleichen.

### Version wiederherstellen

1. Öffne den Version-Browser
2. Wähle die gewünschte Version
3. Klicke auf "Wiederherstellen"
4. Der Dateiinhalt wird auf den Stand dieser Version zurückgesetzt
5. Die vorherige Version (vor der Wiederherstellung) wird ebenfalls als neue Version gespeichert

---

## Versionen-Limits

- **Standard:** Max. 20 Versionen pro Datei
- **Bereich:** 0–100 (0 = keine Versionen speichern)
- **Verhalten bei Limit:** Älteste Version wird entfernt, wenn das Maximum erreicht ist

---

## Praktisches Beispiel

Teste den Versionsverlauf mit einer eigenen Datei:

1. Erstelle eine neue Datei `Test-Versionen.md`
2. Schreibe: `# Version 1` → speichern (Auto-Save nach kurzer Pause)
3. Ändere zu: `# Version 2 — überarbeitet` → speichern
4. Ändere nochmal: `# Version 3 — final` → speichern
5. Öffne den Version-Browser (Uhr-Icon)
6. Vergleiche Version 1 mit Version 3 im Diff-Viewer
7. Stelle Version 1 wieder her und prüfe den Dateiinhalt

---

> [!tip] Versionen als Sicherheitsnetz
> Du musst dir keine Sorgen machen, beim Bearbeiten Inhalte zu verlieren. Jede Speicherung erzeugt automatisch eine Version. Arbeite mutig — du kannst jederzeit einen früheren Stand wiederherstellen.

> [!tip] Papierkorb regelmäßig prüfen
> Schaue gelegentlich in den Papierkorb, ob dort versehentlich gelöschte Dateien liegen. Nach Ablauf der Aufbewahrungsfrist sind sie endgültig weg.

> [!todo] Übung
> 1. Lösche eine beliebige Testdatei und stelle sie über den Papierkorb wieder her
> 2. Bearbeite eine Datei dreimal und vergleiche die Versionen im Version-Browser
> 3. Nutze den Diff-Viewer, um die Unterschiede visuell zu sehen

---

## Verwandte Features

- [[Grundlagen/Datei-Explorer]] — Dateien löschen über das Kontextmenü
- [[Features/Einstellungen]] — Retention und Versionslimits konfigurieren
- [[Features/Vault-Verwaltung]] — Vault-Statistiken zeigen Papierkorb-Größe
