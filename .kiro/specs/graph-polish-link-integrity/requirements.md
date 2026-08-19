# Requirements Document

## Introduction

„Graph-Politur & Link-Integrität" ist der Rest-Scope aus der ursprünglich als „Navigation & Verknüpfungs-Politur" geplanten Spec (siehe `.kiro/specs/implementation-plan.md`, Prio 15): die drei Punkte, die nicht in der tatsächlich umgesetzten `navigation-link-polish`-Spec mitgeliefert wurden. Alle drei bauen auf bereits bestehender, funktionierender Infrastruktur auf — dem Link_Index_Service, dem vault-weiten Graph_View und der Links_View im Context Panel — und schließen jeweils eine konkrete Lücke gegenüber Obsidians Kernverhalten:

1. **Lokaler Graph**: Der Befehl `graph:open-local` ist aktuell ein literaler No-Op (`frontend/src/plugins/compat/core-commands-app.ts:484`). Es soll eine auf die n-Hop-Nachbarschaft einer einzelnen Notiz gefilterte Graph-Ansicht entstehen, als Filterung der bestehenden vault-weiten `/vaults/:id/graph`-Antwort.
2. **Ungelinkte Erwähnungen**: Textstellen, an denen der Dateiname einer Notiz in anderen Dateien als reiner Text vorkommt, ohne dass dort ein Wikilink gesetzt wurde, sollen im Context Panel unterhalb der Backlinks sichtbar werden.
3. **Automatische Link-Aktualisierung bei Umbenennen/Verschieben**: `renameContent`/`moveContent` aktualisieren heute nur den Link_Index-Eintrag der umbenannten Datei selbst — Wikilinks in *anderen* Dateien, die auf den alten Pfad/Namen verweisen, werden nicht mitgeschrieben und brechen. Dies ist laut Implementation Plan die größte *unbeabsichtigte* Einzel-Lücke gegenüber Obsidians Kernverhalten (Datenintegrität).

## Glossary

Wiederverwendete Begriffe aus `knowledge-graph`, `knowledge-graph-v2` und `navigation-link-polish` (nicht neu definiert, siehe dortige Glossare): **Backlink**, **Forward_Link**, **Link_Index_Service**, **Graph_View**, **Graph_Node**, **Graph_Edge**, **Vault_Change_Event**, **Quell-Datei**, **Mehrdeutiger_Link**.

Neue Begriffe für diese Spec:

- **Lokaler_Graph**: Eine auf die N-Hop-Nachbarschaft einer einzelnen Zentrums-Notiz gefilterte Graph-Darstellung, im Gegensatz zum vault-weiten Graph_View.
- **Zentrums-Notiz**: Die Notiz, um die ein Lokaler_Graph zentriert ist.
- **Nachbarschaftsradius**: Die vom Benutzer einstellbare maximale Kantenanzahl (Hops) zwischen der Zentrums-Notiz und einem im Lokalen_Graph angezeigten Graph_Node.
- **Ungelinkte_Erwähnung**: Ein Vorkommen des Dateinamens einer Notiz als reiner Text in einer anderen Datei desselben Vaults, das nicht Teil eines Wikilinks auf diese Notiz ist.
- **Link-Migration**: Der Vorgang, bei dem infolge eines Umbenennens/Verschiebens einer Datei (oder eines Ordners) alle bestehenden Wikilinks anderer Dateien, die auf den alten Pfad/Namen verweisen, automatisch auf den neuen Pfad/Namen aktualisiert werden.
- **Migrations-Quelle**: Eine Datei, deren Inhalt im Zuge einer Link-Migration umgeschrieben wird, weil sie mindestens einen Wikilink auf die umbenannte/verschobene Datei enthält.

## Requirements

### Requirement 1: Lokaler Graph pro Notiz

**User Story:** Als Benutzer möchte ich beim Betrachten einer Notiz einen auf ihre unmittelbare Nachbarschaft beschränkten Graphen öffnen können, damit ich die Verbindungen einer einzelnen Notiz erfasse, ohne vom vault-weiten Graphen überwältigt zu werden.

#### Acceptance Criteria

1. WHEN der Benutzer bei aktivem Datei-Tab den Befehl `graph:open-local` ausführt, THE System SHALL einen Lokalen_Graph für diese Datei in einem neuen Tab öffnen bzw. einen bereits für diese Datei offenen Lokalen-Graph-Tab aktivieren (ersetzt den bisherigen No-Op).
2. IF beim Ausführen von `graph:open-local` kein Datei-Tab aktiv ist (z. B. leerer Zustand, Graph-Tab, Plugin-View), THEN THE Befehl SHALL keine Wirkung haben.
3. THE Lokaler_Graph SHALL ausschließlich Graph_Node und Graph_Edge aus der bereits vorhandenen, vault-weiten `/vaults/:id/graph`-Antwort anzeigen, gefiltert auf die Nachbarschaft der Zentrums-Notiz — es SHALL kein neuer Backend-Endpunkt und keine zusätzliche Server-Anfrage für die Filterung selbst nötig sein.
4. THE Nachbarschafts-Filterung SHALL alle Graph_Node einschließen, die über Graph_Edge (in beliebiger Richtung — Forward_Link oder Backlink) innerhalb des aktuell eingestellten Nachbarschaftsradius von der Zentrums-Notiz erreichbar sind, sowie alle Graph_Edge, deren beide Endpunkte in dieser Knotenmenge liegen.
5. THE Lokaler_Graph SHALL ein Bedienelement zur Einstellung des Nachbarschaftsradius (1–5 Hops, Standard: 1) bereitstellen; bei Änderung SHALL die Filterung ohne erneute Server-Anfrage neu berechnet werden.
6. THE Zentrums-Notiz SHALL im Lokalen_Graph visuell hervorgehoben werden (z. B. größerer Radius, feste Position, abweichende Farbe).
7. WHEN der Benutzer im Lokalen_Graph auf einen anderen Datei-Node klickt, THE System SHALL diese Datei öffnen — konsistent mit dem bestehenden Klick-Verhalten des vault-weiten Graph_View (Requirement „Click: open existing file in tab; no action for unresolved" in `GraphView.tsx`).
8. THE Lokaler_Graph SHALL ein Bedienelement bereitstellen, um die Ansicht auf eine andere Zentrums-Notiz neu zu zentrieren (z. B. „Auf aktive Notiz zentrieren"), ohne dass dafür Knoten-Klicks umgewidmet werden müssen und ohne das bestehende Klick-Verhalten aus Kriterium 7 zu verändern.
9. THE Lokaler_Graph SHALL Tag- und Property-Nodes gemäß der bestehenden `includeTags`/`includeProperties`-Einstellungen aus `graph-config.ts` ein- oder ausblenden, konsistent mit dem vault-weiten Graphen.
10. IF die Zentrums-Notiz weder Forward_Link noch Backlink besitzt, THEN THE Lokaler_Graph SHALL nur den Zentrums-Node ohne Kanten anzeigen (kein Leerzustand/keine Fehlermeldung).
11. WHILE ein Lokaler_Graph für eine Zentrums-Notiz geöffnet ist, THE Ansicht SHALL bei einem Vault_Change_Event (`saved`/`renamed`/`deleted`) des aktuellen Vaults die zugrundeliegenden Graph-Daten neu laden, analog zum bestehenden Live-Update-Muster der Backlinks (siehe `navigation-link-polish`, Requirement 5).
12. IF die Zentrums-Notiz gelöscht wird während ihr Lokaler_Graph offen ist, THEN THE System SHALL eine Fehlermeldung mit dem Dateipfad anzeigen und den Tab in einen Fehlerzustand versetzen (kein automatisches Schließen, damit der Benutzer den Kontext nicht verliert).
13. THE Nachbarschaftsradius-Einstellung SHALL pro Benutzer persistiert werden, über denselben Mechanismus wie die übrige `Graph_Config` (`frontend/src/components/graph-config.ts`, localStorage).

### Requirement 2: Ungelinkte Erwähnungen

**User Story:** Als Benutzer möchte ich beim Betrachten einer Notiz sehen, wo ihr Dateiname in anderen Notizen als reiner Text erwähnt wird, ohne dass dort ein Wikilink existiert, damit ich fehlende Verlinkungen leicht nachträglich ergänzen kann.

#### Acceptance Criteria

1. WHILE eine Datei im Context Panel mit geöffneter Links_View angezeigt wird, THE Links_View SHALL unterhalb der bestehenden Backlinks-Sektion eine neue Sektion „Ungelinkte Erwähnungen" anzeigen.
2. THE System SHALL für die aktive Datei alle anderen Textdateien des Vaults ermitteln, deren Inhalt den Dateinamen der aktiven Datei (ohne Dateiendung) case-insensitive als Teilzeichenkette enthält.
3. THE Ermittlung SHALL Vorkommen ausschließen, die bereits Teil eines Wikilinks sind, der auf die aktive Datei auflöst (diese sind bereits als Backlink gelistet) — als Ungelinkte_Erwähnung SHALL nur tatsächlich unverlinkter Text zählen.
4. THE Ermittlung SHALL denselben Datei-Ausschlussregeln folgen wie die bestehende Volltextsuche (`search-service.ts`): binäre/übergroße Dateien werden übersprungen, maximal 1000 durchsuchte Dateien, 30-Sekunden-Zeitlimit.
5. THE Ungelinkte-Erwähnungen-Sektion SHALL pro Treffer-Datei den Dateipfad und einen kurzen Textausschnitt um das erste Vorkommen anzeigen (analog zu den bestehenden Suchergebnis-Snippets, `SearchHit.matchLine`).
6. WHEN der Benutzer eine Ungelinkte_Erwähnung anklickt, THE System SHALL die entsprechende Datei öffnen (neuer Tab bzw. bestehenden Tab aktivieren) und zur Fundstelle scrollen, konsistent mit dem bestehenden Backlink-Klick-Verhalten (`onLinkClick`).
7. THE Ungelinkte-Erwähnungen-Sektion SHALL pro Treffer eine Aktion „Verlinken" anbieten; deren Ausführung SHALL nur das erste Vorkommen an der Fundstelle durch einen Wikilink auf die aktive Datei ersetzen (nicht alle Vorkommen der Datei), um versehentliches Verlinken unbeabsichtigter Textstellen zu vermeiden.
8. IF keine Ungelinkten Erwähnungen gefunden werden, THEN THE Sektion SHALL einen Platzhaltertext anzeigen (nicht ausgeblendet werden), konsistent mit dem bestehenden Verhalten der Forward-Links- und Backlinks-Sektion bei leerer Liste.
9. WHILE die aktive Datei gewechselt wird, THE System SHALL eine zuvor laufende, noch nicht abgeschlossene Ungelinkte-Erwähnungen-Suche für die vorherige Datei verwerfen (kein verspätetes Überschreiben mit veralteten Daten für die neue Datei).
10. THE Ungelinkte-Erwähnungen-Suche SHALL asynchron nach dem initialen Laden von Forward-Links und Backlinks ausgeführt werden und SHALL das Öffnen bzw. Rendern der Links_View nicht blockieren oder verzögern.
11. WHEN ein Vault_Change_Event (`saved`/`deleted`) für eine beliebige Datei des aktuellen Vaults eintrifft, THE Ungelinkte-Erwähnungen-Sektion SHALL analog zu den Backlinks innerhalb von 1000ms debounced neu geladen werden.
12. IF die Ungelinkte-Erwähnungen-Suche fehlschlägt (z. B. Server-Fehler), THEN THE Sektion SHALL einen Fehlerzustand anzeigen, analog zum bestehenden `backlinksError`-Zustand, und die zuvor angezeigten Ergebnisse (falls vorhanden) verwerfen.

### Requirement 3: Automatische Link-Aktualisierung beim Umbenennen/Verschieben (Link-Migration)

**User Story:** Als Benutzer möchte ich, dass beim Umbenennen oder Verschieben einer Datei oder eines Ordners alle Wikilinks, die anderswo im Vault darauf verweisen, automatisch mit aktualisiert werden, damit meine Links nicht durch alltägliche Datei-Organisation brechen.

#### Acceptance Criteria

1. WHEN eine Markdown-Datei per `renameContent` oder `moveContent` erfolgreich umbenannt/verschoben wird, THE System SHALL alle Migrations-Quellen im Vault ermitteln — Dateien, die mindestens einen Wikilink enthalten, der (nach den bestehenden Auflösungsregeln aus `resolveWikilinkTarget`, inklusive Mehrdeutiger_Link-Behandlung) auf den alten Pfad der umbenannten Datei aufgelöst hätte.
2. THE Ermittlung SHALL nicht ausschließlich auf dem exakten, normalisierten Pfad-Abgleich des bestehenden Link_Index (`getBacklinks`) beruhen, da dieser Wikilinks, die nur den bloßen Dateinamen ohne Ordnerpfad referenzieren (Obsidians übliche Kurzform-Verlinkung, z. B. `[[Notiz]]` für eine Datei in einem Unterordner), nicht zuverlässig erfasst — die Ermittlung SHALL alle Wikilinks mit demselben Auflösungsverhalten wie beim Rendern/Anzeigen der jeweiligen Quell-Datei berücksichtigen.
3. THE System SHALL in jeder ermittelten Migrations-Quelle jedes Wikilink-Vorkommen, das auf die alte Datei verweist, so umschreiben, dass es auf den neuen Pfad/Namen verweist, unter Erhalt von Anzeigetext/Alias (`[[Alt|Anzeigetext]]` → `[[Neu|Anzeigetext]]`) und Anker (`[[Alt#Überschrift]]` → `[[Neu#Überschrift]]`).
4. WHEN mehrere Wikilinks in derselben Migrations-Quelle auf dieselbe umbenannte Datei verweisen, THE System SHALL alle Vorkommen in dieser Datei umschreiben, nicht nur das erste.
5. THE Umschreibung SHALL ausschließlich den Ziel-Bezug jedes betroffenen Wikilinks ändern, nicht dessen umgebenden Text, Anzeigetext-Formatierung oder andere Wikilinks in derselben Datei, die auf andere Dateien verweisen.
6. THE Funktionalität SHALL sowohl für Markdown-Dateien als auch für eingebettete Nicht-Markdown-Dateien gelten (z. B. `![[Bild.png]]`), sofern für die umbenannte Datei Backlinks im Link_Index vorhanden sind.
7. WHEN ein Ordner per `renameContent` oder `moveContent` umbenannt/verschoben wird, THE System SHALL die Link-Migration für jede Markdown-/Embed-Datei durchführen, deren Pfad sich durch die Ordner-Operation ändert — analog zu Kriterien 1–6, angewendet auf jede betroffene Datei einzeln mit ihrem jeweiligen alten und neuen Pfad.
8. THE Rename/Move-Operation SHALL wie bisher mit `{ newPath }` antworten; die Link-Migration SHALL vor Rückgabe der HTTP-Antwort abgeschlossen sein, sodass ein Client, der die Antwort erhält, sich auf bereits aktualisierte Links verlassen kann (keine sichtbare Race Condition zwischen Umbenennen und Link-Aktualisierung).
9. IF das Schreiben einer Migrations-Quelle während der Link-Migration fehlschlägt (z. B. Konflikt, Berechtigungsfehler), THEN THE System SHALL den Rename/Move-Vorgang selbst NICHT rückgängig machen, den Vorgang für die übrigen Migrations-Quellen fortsetzen und in der API-Antwort eine Warnung mit der Liste der nicht aktualisierten Dateien und Fehlergründen zurückgeben.
10. IF die umbenannte/verschobene Datei keine Backlinks bzw. keine auflösbaren Wikilink-Referenzen besitzt, THEN THE System SHALL keine weiteren Dateien anfassen und den Rename/Move-Vorgang mit unveränderter Performance wie bisher ausführen.
11. WHEN eine Migrations-Quelle im Zuge der Link-Migration umgeschrieben wird, THE System SHALL für diese Datei ein Vault_Change_Event (Aktion `saved`) publizieren, analog zum bestehenden Verhalten bei regulärem Speichern, sodass offene Tabs/Sessions (inkl. der Live-Backlinks-Aktualisierung aus `navigation-link-polish`, Requirement 5) die Änderung ohne manuellen Reload sehen.
12. THE Link_Index SHALL nach Abschluss der Migration für die umbenannte Datei und alle Migrations-Quellen konsistente Daten enthalten, sodass Graph_View, Lokaler_Graph und Links_View unmittelbar danach den aktuellen Stand zeigen.
13. THE Link-Migration SHALL das bestehende Verhalten bei nicht auflösbaren bzw. absichtlich unveränderten Wikilinks nicht beeinflussen: Wikilinks in Migrations-Quellen, die auf andere, nicht von der Operation betroffene Dateien verweisen (auch bei gleichem Dateinamen wie die umbenannte Datei, aber aufgelöst zu einer anderen Datei gemäß Mehrdeutiger_Link-Regeln), SHALL unverändert bleiben.
