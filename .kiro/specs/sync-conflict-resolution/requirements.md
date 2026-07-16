# Requirements Document

## Introduction

Das Sync-Konfliktmanagement wird um einen halbautomatischen Workflow erweitert. Wenn Dokumente sowohl lokal als auch remote vorhanden oder geändert sind, soll der Nutzer durch einen geführten Prozess die Konflikte lösen können — mit intelligenten Vorschlägen, Diff-Ansicht und Batch-Aktionen. Dies erweitert das bestehende Requirement 7 der `vault-sync`-Spec um eine deutlich bessere UX.

## Glossary

- **Conflict_Wizard**: Ein mehrstufiger UI-Dialog der den Benutzer durch die Konfliktauflösung führt
- **Diff_View**: Eine visuelle Gegenüberstellung von lokaler und Remote-Version eines Dokuments (Side-by-Side oder Unified)
- **Auto_Resolution_Strategy**: Eine konfigurierbare Strategie zur automatischen Auflösung bestimmter Konflikttypen (z.B. `newer_wins` = neueres Änderungsdatum gewinnt, `remote_wins` = Remote überschreibt immer)
- **Batch_Resolution**: Die gleichzeitige Anwendung einer Auflösungsstrategie auf mehrere Konflikte
- **Merge_Preview**: Eine Vorschau des Ergebnisses nach der gewählten Auflösung, bevor die Aktion ausgeführt wird
- **Conflict_Category**: Klassifikation eines Konflikts in vier Kategorien: `content_conflict` (beide geändert), `local_deleted` (lokal gelöscht, remote vorhanden/geändert), `remote_deleted` (remote gelöscht, lokal vorhanden/geändert), `rename_conflict` (unterschiedliche Pfade, gleicher Inhalt-Hash)

## Requirements

### Requirement 1: Konfliktkategorisierung

**User Story:** Als Vault-Besitzer möchte ich Konflikte nach Art kategorisiert sehen, damit ich schnell verstehe welche Art von Entscheidung jeweils nötig ist.

#### Acceptance Criteria

1. THE Sync_Service SHALL Konflikte in folgende Kategorien einteilen: `content_conflict` (Datei lokal UND remote geändert seit letztem Sync), `local_deleted` (Datei lokal gelöscht aber remote vorhanden/geändert), `remote_deleted` (Datei remote gelöscht aber lokal vorhanden/geändert), `rename_conflict` (Datei an unterschiedlichen Pfaden erkannt, gleicher Inhalt-Hash)
2. THE Conflict_Wizard SHALL die Konflikte gruppiert nach Kategorie anzeigen, mit Anzahl pro Kategorie als Badge
3. THE Conflict_Wizard SHALL für jede Kategorie eine angemessene Standard-Empfehlung anzeigen: `content_conflict` → "Neuere Version", `local_deleted` → "Remote-Version wiederherstellen", `remote_deleted` → "Lokale Version behalten", `rename_conflict` → "Remote-Pfad übernehmen"

### Requirement 2: Diff-Ansicht für Content-Konflikte

**User Story:** Als Vault-Besitzer möchte ich bei Content-Konflikten die Unterschiede zwischen lokaler und Remote-Version visuell sehen, damit ich eine informierte Entscheidung treffen kann.

#### Acceptance Criteria

1. WHEN der Benutzer einen `content_conflict` im Conflict_Wizard auswählt, THE Diff_View SHALL eine Side-by-Side-Darstellung der lokalen (links) und Remote-Version (rechts) anzeigen
2. THE Diff_View SHALL hinzugefügte Zeilen (nur in einer Version) mit grünem Hintergrund und entfernte Zeilen mit rotem Hintergrund hervorheben (Design Tokens)
3. THE Diff_View SHALL Zeilennummern für beide Versionen anzeigen und identische Bereiche einklappbar machen (collapsed mit "N identische Zeilen"-Hinweis)
4. THE Diff_View SHALL einen Toggle zwischen "Side-by-Side" und "Unified" Ansicht bereitstellen (Standard: Side-by-Side, Einstellung in localStorage persistiert)
5. THE Diff_View SHALL einen "Übernehmen"-Button für jede Seite bereitstellen (Local / Remote) sowie einen "Manuell mergen"-Button der den Benutzer von der Diff_View in die Merge_Preview-Komponente überleitet (sequentieller Ablauf: Diff_View → Merge_Preview)
6. IF die Datei eine Binärdatei ist (MIME-Typ NICHT `text/*` und Dateiendung NICHT in `.md`, `.txt`, `.json`, `.csv`, `.yaml`, `.yml`, `.xml`, `.html`, `.css`, `.js`, `.ts`), THEN THE Diff_View SHALL nur Metadaten (Dateigröße, Änderungsdatum) gegenüberstellen und keinen Text-Diff anzeigen

### Requirement 3: Batch-Auflösung

**User Story:** Als Vault-Besitzer möchte ich mehrere Konflikte derselben Kategorie auf einmal auflösen können, damit ich bei vielen Konflikten nicht jeden einzeln bearbeiten muss.

#### Acceptance Criteria

1. THE Conflict_Wizard SHALL pro Kategorie eine "Alle auflösen"-Aktion bereitstellen die die konfigurierte Auto-Resolution-Strategie (gemäß Requirement 4) auf alle Konflikte der Kategorie anwendet; falls keine Strategie konfiguriert ist, wird die Standard-Empfehlung aus Requirement 1 Kriterium 3 verwendet
2. THE Conflict_Wizard SHALL eine Checkbox pro Konflikt bereitstellen um eine manuelle Auswahl für Batch-Aktionen zu ermöglichen
3. WHEN der Benutzer eine Batch-Aktion auslöst, THE Conflict_Wizard SHALL eine Bestätigungs-Zusammenfassung anzeigen (Anzahl betroffener Dateien, gewählte Strategie) bevor die Aktion ausgeführt wird
4. WHEN eine Batch-Auflösung ausgeführt wird, THE Sync_Service SHALL die Aktionen sequentiell verarbeiten und bei Fehlern einzelner Dateien die übrigen fortsetzen
5. WHEN eine Batch-Auflösung abgeschlossen ist, THE Conflict_Wizard SHALL eine Ergebnis-Zusammenfassung anzeigen (N erfolgreich, M fehlgeschlagen mit Fehlergründen)

### Requirement 4: Auto-Resolution-Strategien

**User Story:** Als Vault-Besitzer möchte ich automatische Auflösungsregeln konfigurieren können, damit wiederkehrende Konflikte ohne manuelles Eingreifen gelöst werden.

#### Acceptance Criteria

1. THE Sync_Service SHALL folgende konfigurierbare Auto-Resolution-Strategien unterstützen: `newer_wins` (neueres Änderungsdatum gewinnt; bei identischem `modifiedAt`-Zeitstempel wird `remote_wins` als Fallback angewendet), `remote_wins` (Remote überschreibt immer), `local_wins` (Lokal bleibt immer), `skip` (Konflikt wird ignoriert und beim nächsten Sync erneut geprüft)
2. THE Conflict_Wizard SHALL eine Einstellung bereitstellen wo der Benutzer die Standard-Auto-Resolution-Strategie pro Kategorie festlegen kann
3. WHEN eine Auto-Resolution-Strategie konfiguriert ist, THE Sync_Service SHALL bei der nächsten Synchronisation Konflikte der konfigurierten Kategorie automatisch nach der gewählten Strategie auflösen
4. THE Sync_Service SHALL automatisch aufgelöste Konflikte im Sync-Log mit dem Vermerk `auto_resolved` und der angewandten Strategie protokollieren
5. THE Conflict_Wizard SHALL einen Toggle "Automatische Auflösung aktivieren" bereitstellen (Standard: aus), sodass der Benutzer bewusst in den halbautomatischen Modus wechseln muss
6. IF eine automatische Auflösung fehlschlägt (z.B. Schreibfehler), THEN THE Sync_Service SHALL den Konflikt als ungelöst belassen und im Sync-Log den Fehlschlag dokumentieren

### Requirement 5: Merge-Preview

**User Story:** Als Vault-Besitzer möchte ich vor der endgültigen Auflösung eine Vorschau des Ergebnisses sehen, damit ich sicher bin dass keine Inhalte verloren gehen.

#### Acceptance Criteria

1. WHEN der Benutzer eine Auflösungsoption wählt (bevor er bestätigt), THE Conflict_Wizard SHALL eine Vorschau des resultierenden Dateiinhalts anzeigen
2. THE Merge_Preview SHALL den finalen Text mit Syntax-Highlighting (Markdown) darstellen
3. IF der Benutzer "Manuell mergen" in der Diff_View wählt, THEN THE Merge_Preview SHALL einen editierbaren Textbereich bereitstellen (vorab befüllt mit der gewählten Basisversion) in dem der Benutzer Passagen aus beiden Versionen kombinieren kann (die Diff_View und Merge_Preview sind separate Komponenten in einem sequentiellen Ablauf)
4. THE Merge_Preview SHALL einen "Bestätigen"-Button und einen "Abbrechen"-Button bereitstellen; bei Abbruch wird keine Änderung vorgenommen und der Konflikt bleibt offen
5. WHEN der Benutzer die Vorschau bestätigt, THE Sync_Service SHALL die Auflösung atomar durchführen: zuerst die lokale Datei schreiben, dann das CouchDB-Dokument aktualisieren
6. IF die lokale Dateischreibung erfolgreich ist aber das CouchDB-Push fehlschlägt, THEN THE Sync_Service SHALL die lokale Datei auf den Zustand vor der Auflösung zurücksetzen (Rollback) und den Konflikt als ungelöst belassen

### Requirement 6: Conflict-Wizard UI

**User Story:** Als Vault-Besitzer möchte ich durch einen geführten Prozess bei der Konfliktauflösung unterstützt werden, damit ich auch bei vielen Konflikten den Überblick behalte.

#### Acceptance Criteria

1. THE Conflict_Wizard SHALL als mehrstufiger Dialog im Sync-Bereich erscheinen wenn ungelöste Konflikte vorhanden sind: Schritt 1 = Übersicht (Kategorien + Anzahlen), Schritt 2 = Kategorie-Details (Einzelkonflikte), Schritt 3 = Auflösung (Diff/Preview/Aktion)
2. THE Conflict_Wizard SHALL einen Fortschrittsindikator anzeigen (z.B. "3/12 Konflikte gelöst")
3. THE Conflict_Wizard SHALL Navigation zwischen Konflikten ermöglichen (Vor/Zurück-Buttons, direkter Sprung per Klick in der Übersicht)
4. THE Conflict_Wizard SHALL die Auflösungsergebnisse live aktualisieren (gelöste Konflikte verschwinden aus der Liste)
5. WHEN alle Konflikte gelöst sind, THE Conflict_Wizard SHALL eine Abschluss-Zusammenfassung anzeigen und einen Button "Sync fortsetzen" bereitstellen der den nächsten regulären Sync auslöst
6. THE Conflict_Wizard SHALL auf allen Bildschirmgrößen ≥768px nutzbar sein (responsive innerhalb des bestehenden Layouts)
7. IF mehr als 50 Konflikte in einer Kategorie vorhanden sind, THEN THE Conflict_Wizard SHALL die Liste paginiert darstellen (max 50 pro Seite)
8. THE Conflict_Wizard SHALL bei Batch-Operationen maximal 100 Konflikte pro Ausführung verarbeiten; bei mehr als 100 selektierten Konflikten wird der Benutzer aufgefordert die Auswahl aufzuteilen
9. WHILE der Conflict_Wizard geöffnet ist, THE Sync_Service SHALL keine automatischen Sync-Läufe starten (Scheduler pausiert)
10. IF der Benutzer den Wizard schließt oder manuell einen Sync auslöst, THEN THE Sync_Service SHALL den Scheduler wieder aktivieren
11. IF während der Wizard-Session neue Konflikte durch externe Änderungen entstehen (z.B. ein anderer Benutzer pushed), THEN THE Conflict_Wizard SHALL den Benutzer benachrichtigen und die Konfliktliste aktualisieren ohne den aktuellen Auflösungsschritt zu unterbrechen
