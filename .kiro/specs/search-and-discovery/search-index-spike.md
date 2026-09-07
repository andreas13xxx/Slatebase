# Spike: Such-Index (AP11)

Datum: 2026-09-07. Ergänzt `design.md`s ursprüngliche Design-Entscheidung 1
("Kein Index für Phase 1 ... erst bei Performance-Bedarf (>10.000 Dateien)").
Dieser Spike liefert die Messung, die diese Entscheidung jetzt überprüfbar
macht — **keine Implementierung**.

## Messung

`SearchService.search()` gegen generierte Fixture-Vaults, real gebautes
Backend (`dist/`), eine Suche mit genau wenigen Treffern (kein Best-Case
Short-Circuit durch `maxResults`):

| Dateien im Vault | `search()` gesamt | davon `getVaultTree()` | durchsuchte Dateien | `truncated` |
|---:|---:|---:|---:|---|
| 1.000  | 1386 ms | 120 ms (9 %)  | 1.000 | nein |
| 5.000  | 1929 ms | 482 ms (25 %) | 1.000 | ja — `file_limit` |
| 20.000 | 3615 ms | 1773 ms (49 %)| 1.000 | ja — `file_limit` |

Zwei unabhängige Befunde:

1. **Die Suche selbst ist auf 1.000 Dateien gedeckelt** (`MAX_FILES`), unabhängig
   von der Vault-Größe — bei 5.000+ Dateien wird nie der ganze Vault durchsucht.
   Das ist bereits korrekt als `truncated: true` mit `truncationReason` an
   Frontend durchgereicht (`state/searchState.ts`, `SearchPanel.tsx`) und dort
   sichtbar angezeigt. **Der im Auftrag beschriebene Zustand "wird still
   abgeschnitten" existiert im aktuellen Code nicht mehr** — das wurde bereits
   in `dd9f2eb` (2026-08-21, "properties editor, search operators...")
   eingeführt, vor dem in diesem AP-Paket referenzierten Stand vom 06.09.2026.
   Verifiziert: Backend (`search-service.ts` Z. 73–75, 204 f.), Route
   (`api/searchRoutes.ts` reicht die volle `SearchResponse` durch), Frontend
   (`state/searchActions.ts`, `state/searchState.ts`, `SearchPanel.tsx` Z. 585–589).
   **Kein Code-Änderung nötig für den "sofort umsetzbar"-Teil dieses APs.**

2. **`getVaultTree()` wird bei jeder Suche komplett neu gelesen** (bewusst so,
   AP7: "Always read fresh from disk"), und dessen Kosten skalieren mit der
   *gesamten* Vault-Größe — nicht mit den 1.000 durchsuchten Dateien. Bei
   20.000 Dateien sind das fast 50 % der Suchdauer, nur um die Dateiliste zu
   bekommen, bevor überhaupt eine Zeile gelesen wird. Das ist der eigentliche
   Skalierungsengpass, nicht die String-Suche selbst.

## Optionsvergleich

### Option A — `node:sqlite` mit FTS5

Verifiziert lauffähig ohne Flag in der hier verwendeten Node-Version (24.19,
Projekt fordert `>=22` in `package.json`): `DatabaseSync`, virtuelle
`fts5`-Tabelle, `INSERT`/`MATCH`-Query funktionieren out of the box.

| Kriterium | Bewertung |
|---|---|
| Neue Abhängigkeit | Keine — Node-Core-Modul |
| Indexgröße auf Platte | Eigene `.db`-Datei pro Vault (SQLite verwaltet Speicher selbst, kein Full-Text-Index im Prozess-Heap) |
| Rebuild-Dauer | Einmaliger Scan + Batch-`INSERT`, vermutlich vergleichbar mit `LinkIndexService.rebuild()`s Scan-Kosten (dominiert von Datei-I/O, nicht vom Index-Aufbau) |
| Speicherbedarf | Gering und vom Prozess entkoppelt — SQLite hält den Index nicht im Node-Heap |
| Inkrementelle Updates | `DELETE` + `INSERT` pro geändertem Dokument, angehängt an dieselben Schreibpfade, die `LinkIndexService.updateFile()`/`removeFile()`/`renameFile()` bereits bedienen |
| Externe Änderungen (Git-Sync) | Gleiches Problem wie bei jedem Index: kein kostenloses Filesystem-Change-Signal. Braucht denselben Mechanismus, den ein Eigenbau auch bräuchte (Rebuild-Trigger oder mtime-Vergleich) |
| Ranking/Funktionalität | BM25-Ranking, Phrasensuche, Prefix-Suche bereits eingebaut — müsste bei einem Eigenbau erst entwickelt werden |
| Nebenläufigkeit | Bonus, nicht Kernnutzen: SQLite-Transaktionen sind eine robustere Grundlage als Read-Modify-Write auf JSON-Dateien — falls das Muster sich bewährt, ist es später auch für AP9-artige Kandidaten interessant. Für dieses AP nicht bewertet. |

### Option B — Eigener invertierter Index nach `LinkIndexService`-Muster

| Kriterium | Bewertung |
|---|---|
| Neue Abhängigkeit | Keine |
| Indexgröße auf Platte | JSON-Snapshot analog `link-index.json`, aber mit Posting-Listen pro Term — bei Volltext-Tokens deutlich größer als der reine Link/Tag/Property-Index heute |
| Rebuild-Dauer | Vergleichbar mit Option A (dominiert von Datei-I/O), zusätzlich Tokenisierungskosten |
| Speicherbedarf | Vollständig im Node-Heap (wie `forwardLinks`/`backlinks`/... aktuell) — bei 20.000+ Dateien mit Volltext-Posting-Listen ein echtes Risiko, das `LinkIndexService` heute nicht hat, weil es nur Links/Tags/Properties, nicht Fließtext, indiziert |
| Inkrementelle Updates | Gleicher Mechanismus wie `LinkIndexService.updateFile()` — architektonisch der geringste Bruch mit dem Bestehenden |
| Externe Änderungen | Gleiches Problem wie Option A |
| Ranking/Funktionalität | Muss selbst gebaut werden: Tokenisierung, Relevanz-Ranking, Phrasen-/Prefix-Matching. Relevanz-Ranking ist ein eigenes, nicht triviales Problemfeld |

## Empfehlung

**Option A (`node:sqlite` + FTS5)**, wenn ein Index tatsächlich gebaut wird.
Ausschlaggebend: keine neue Abhängigkeit, Index lebt außerhalb des
Node-Heaps (löst das Speicherproblem, das ein Eigenbau bei Volltext neu
einführen würde), Ranking/Phrasen-/Prefix-Suche kommt fertig mit. Option B
gewinnt nur beim Kriterium "folgt dem bestehenden Muster" — das rechtfertigt
nicht, Relevanz-Ranking und Tokenisierung selbst zu entwickeln.

**Nicht Teil dieses APs:** Die eigentliche Implementierung. Diese Empfehlung
ist eine Entscheidungsvorlage für den Maintainer, kein Startschuss.

## Sofort umsetzbar, unabhängig vom Index (Teil dieses APs)

Geprüft und bereits vorhanden — siehe Befund 1 oben. Keine Änderung nötig.
