# Server-Side Plugins — Requirements

## Motivation

Viele Obsidian Community Plugins nutzen Node.js-APIs (`tls`, `net`, `crypto`, `fs`, `child_process`, `buffer`, `events`, `stream`) für Datenimport, Netzwerkkommunikation oder Dateisystem-Operationen. Diese Plugins können im Browser nicht ausgeführt werden, da die benötigten Module dort nicht existieren.

Beispiele:
- **IMAP Mail Importer** — nutzt `tls`, `net`, `crypto` für IMAP-Verbindungen
- **Git-basierte Plugins** — brauchen `child_process` oder `fs`
- **Export-Plugins** — nutzen `fs` für lokale Dateisystem-Operationen
- **Datenbank-Plugins** — brauchen native Bindings

Diese Plugins haben typischerweise eine klare Trennung: Datenlogik (serverseitig ausführbar) und UI (Settings-Tab, Statusanzeige). Ziel dieses Features ist es, die Datenlogik serverseitig auszuführen während die UI über eine Bridge an das Frontend kommuniziert.

## Funktionale Anforderungen

### R1: Plugin-Klassifikation

- R1.1: Das System MUSS Plugins automatisch als "browser-only", "server-capable" oder "hybrid" klassifizieren können.
- R1.2: Die Klassifikation basiert auf statischer Analyse der `require()`/`import`-Aufrufe im Bundle.
- R1.3: Plugins die ausschließlich Node.js-Module nutzen (kein DOM-Zugriff) werden als "server-capable" klassifiziert.
- R1.4: Plugins die sowohl Node.js-Module als auch DOM-APIs nutzen werden als "hybrid" klassifiziert.
- R1.5: Plugins die nur Browser-APIs/DOM nutzen bleiben "browser-only" (bestehende Frontend-Ausführung).
- R1.6: Die Klassifikation wird in der Plugin-Registry gespeichert und in der UI angezeigt. Sie ergänzt das bereits vorhandene Registry-Feld `compatibilityLevel: 'full' | 'partial' | 'unsupported' | 'unknown'` (`backend/src/plugin/types.ts`, `PluginRegistryData`) um eine zweite, unabhängige Achse — `compatibilityLevel` bewertet Browser-Kompatibilität, `executionType` bestimmt den Ausführungsort. Ein Plugin mit `compatibilityLevel: 'unsupported'` wegen `isDesktopOnly: true` ist der Hauptkandidat für `executionType: 'server-capable'`, aber die beiden Felder sind nicht 1:1 austauschbar (z. B. kann ein Plugin `compatibilityLevel: 'partial'` und trotzdem `executionType: 'server-capable'` sein).
- R1.7: Die Node.js-Modul-Erkennung (R1.2) SOLL die bestehende `detectNodeModules()`-Logik aus `frontend/src/plugins/compat/compatibility-analyzer.ts` wiederverwenden bzw. in ein gemeinsames Modul extrahieren, statt sie für den Backend-Classifier neu zu implementieren — sonst laufen die Node-Modul-Listen (`NODE_BUILTIN_MODULES` dort vs. die in R5.6/Task 7 benötigten Module) auseinander. Bekannte Lücke bei der Übernahme: `NODE_BUILTIN_MODULES` enthält aktuell weder `events` noch `url`, obwohl R5.6 beide als bereitzustellende Built-ins listet — bei der Extraktion mit aufnehmen.

### R2: Server-Side Execution Environment

- R2.1: Das Backend MUSS eine isolierte Ausführungsumgebung für Plugins bereitstellen (`vm` oder `isolated-vm`).
- R2.2: Jede Plugin-Instanz läuft in einem eigenen Kontext (Speicher-Isolation zwischen Plugins).
- R2.3: Plugins erhalten Zugriff auf einen Vault-I/O-Layer (Dateien lesen/schreiben im Vault-Verzeichnis).
- R2.4: Plugins erhalten eingeschränkten Netzwerk-Zugriff (konfigurierbar per Plugin via Allowlist).
- R2.5: Plugins erhalten KEINEN Zugriff auf das Host-Filesystem außerhalb des Vault-Verzeichnisses.
- R2.6: Plugins erhalten KEINEN Zugriff auf andere Vaults oder System-Ressourcen.
- R2.7: Die Ausführungsumgebung MUSS einen DOM-Stub bereitstellen (jsdom oder minimale Implementierung) für `PluginSettingTab`/`Setting`-Kompatibilität.
- R2.8: CPU-Limits: Plugin-Ausführung wird nach 30 Sekunden pro Operation abgebrochen.
- R2.9: Memory-Limits: Max 128 MB Heap pro Plugin-Instanz.

### R3: Plugin-Lifecycle (Server-Side)

- R3.1: Server-Side-Plugins werden beim Backend-Start automatisch geladen (wenn als "active" markiert).
- R3.2: `onload()` wird beim Laden aufgerufen — Timer und Intervalle werden unterstützt.
- R3.3: `onunload()` wird beim Stoppen/Deaktivieren aufgerufen — alle Ressourcen werden bereinigt.
- R3.4: Plugins können bei Vault-Wechsel nicht umgeladen werden (serverseitige Plugins sind vault-bound).
- R3.5: Fehler in einem Plugin dürfen andere Plugins und den Server-Betrieb nicht beeinträchtigen.

### R4: Settings-Bridge (Server → Frontend)

- R4.1: Server-Side-Plugins können `addSettingTab()` aufrufen — der SettingTab wird serverseitig evaluiert.
- R4.2: Die resultierende DOM-Struktur (aus `containerEl`) wird als serialisiertes HTML an das Frontend übertragen.
- R4.3: Das Frontend rendert das HTML im Settings-Modal und leitet User-Interaktionen (Input-Changes, Button-Clicks) via API an das Backend zurück.
- R4.4: Das Backend ruft die entsprechenden Event-Handler auf und sendet den aktualisierten DOM-Zustand zurück.
- R4.5: Alternative: Settings werden als JSON-Schema definiert und das Frontend generiert die UI automatisch (einfacher aber weniger kompatibel).

### R5: Obsidian API Shims (Server-Side)

- R5.1: `this.app.vault.read/modify/create/delete` — delegiert an den VaultService.
- R5.2: `this.loadData()/saveData()` — delegiert an PluginStore Settings.
- R5.3: `requestUrl()` — HTTP-Requests mit konfigurierbarer Allowlist.
- R5.4: `Notice` — wird als Event an das Frontend gesendet (Toast-Anzeige).
- R5.5: `this.addCommand()` — Commands werden registriert und an die Frontend-CommandRegistry gebrückt.
- R5.6: Node.js built-in Module (`tls`, `net`, `crypto`, `buffer`, `events`, `stream`, `path`, `url`) — werden nativ bereitgestellt.
- R5.7: `this.app.workspace` — eingeschränkt: kein DOM, aber `getActiveFile()` via State-Sync.
- R5.8: `this.app.metadataCache` — serverseitig aus Vault-Dateien befüllbar (Frontmatter, Links, Tags).

### R6: Scheduling & Background Tasks

- R6.1: Server-Side-Plugins können `setInterval`/`setTimeout` nutzen für periodische Tasks.
- R6.2: Intervalle werden beim Plugin-Stop automatisch bereinigt.
- R6.3: Ein Plugin-Scheduler kann konfigurierbare Cron-artige Ausführung ermöglichen (optional, V2).
- R6.4: Background Tasks laufen unabhängig von Frontend-Verbindungen (Plugin arbeitet auch wenn kein Browser-Tab offen ist).

### R7: Monitoring & Logs

- R7.1: Plugin-Konsolen-Ausgaben (`console.log/warn/error`) werden im Sync-Log-Format gesammelt.
- R7.2: Plugins haben ein eigenes Log (abrufbar via API: `GET /vaults/:vaultId/plugins/:pluginId/logs`).
- R7.3: CPU/Memory-Verbrauch pro Plugin wird erfasst und bei Überschreitung gewarnt.
- R7.4: Das Frontend zeigt Plugin-Status (running/stopped/error) und letzten Log-Eintrag in der Plugin-Liste.

### R8: Sicherheit

- R8.1: Netzwerk-Zugriff ist standardmäßig DEAKTIVIERT — muss pro Plugin explizit erlaubt werden.
- R8.2: Filesystem-Zugriff ist auf das Vault-Verzeichnis beschränkt (Path-Traversal-Schutz).
- R8.3: Keine Code-Execution außerhalb der Sandbox (`eval`, `Function()`, `child_process` sind geblockt).
- R8.4: Plugin-Updates werden vom Admin genehmigt (kein Auto-Update).
- R8.5: Audit-Logging: Alle Plugin-Aktionen (Datei-Änderungen, Netzwerk-Requests) werden protokolliert.
- R8.6: Die `vm`-basierte Server-Sandbox (R2.1) löst den in `SECURITY-AUDIT.md` (Fix-Backlog #4) offenen Punkt "echte Plugin-Sandbox-Isolation (Worker/VM statt Proxy-basierter Soft-Isolation)" für **server-capable** Plugins ein. Die Browser-seitige Ausführung von browser-only-Plugins bleibt bewusst bei der dokumentierten Proxy-basierten Soft-Isolation (`frontend/src/plugins/compat/sandbox.ts`, Abschnitt "SECURITY NOTE") — deren Trust-Modell ändert sich durch dieses Feature nicht; eine echte Browser-Isolation (Worker/iframe) ist laut Audit eine separate, hier nicht enthaltene Zukunftsentscheidung.

### R9: Security-Hardening-Nachsorge (übernommen aus `security-hardening`)

`implementation-plan.md` (Prio 11) und `SECURITY-AUDIT.md` (Fix-Backlog) weisen drei offene, als "Low"-Severity eingestufte Rate-Limiting-Lücken explizit dieser Spec zu, statt einen eigenen Security-Nachfolge-Pass zu eröffnen. Alle drei nutzen die bestehende `SlidingWindowRateLimiter`-Infrastruktur (`backend/src/shared/sliding-window-rate-limiter.ts`, bereits für Login/Passwort-Änderung/MCP-Tokens im Einsatz).

- R9.1: `POST /proxy` erhält einen Per-User-Rate-Limiter (60 Requests/Minute pro `userId`) — mitigiert SSRF-Amplification über eine kompromittierte Session (URL-Allowlist, 30s-Timeout und 50-MB-Response-Cap bestehen bereits, siehe `SECURITY-AUDIT.md`).
- R9.2: `POST /vaults/:vaultId/shares` erhält einen Per-User-Rate-Limiter (20/Stunde pro `userId`).
- R9.3: `GET /search` und `GET /vaults/:vaultId/search` erhalten einen Per-User-Rate-Limiter sowie ein Timeout in `SearchService` (Schutz vor DoS durch aufwändige Regex-Queries).
- R9.4: Diese drei Punkte sind unabhängig von der Plugin-Sandbox-Architektur (R1–R8) und können parallel/vorab umgesetzt werden — sie hängen nicht von der Klassifikation oder dem Runtime Manager ab.

## Nicht-funktionale Anforderungen

- NF1: Server-Side-Plugin-Laden darf den Backend-Start um maximal 5 Sekunden verzögern (lazy loading nach Server-Start).
- NF2: Ein fehlerhaftes Plugin darf den Server nicht zum Absturz bringen (Process Isolation oder Error Boundaries).
- NF3: Memory-Overhead pro aktivem Plugin: max 128 MB (konfigurierbar).
- NF4: Kompatibilität mit bestehender Frontend-Plugin-Infrastruktur (gleiche Registry, gleiche Settings-Persistenz).

## Abgrenzung

- Reine Frontend-Plugins (browser-only) werden NICHT verändert — bestehende Frontend-Ausführung bleibt erhalten.
- Hybrid-Plugins werden NICHT in V1 unterstützt — nur rein server-capable oder rein browser-only.
- Kein Echtzeit-DOM-Sync zwischen Server und Frontend (kein Remote-DOM-Rendering in V1).
- Kein Plugin-Marketplace/Auto-Download — Plugins werden weiterhin manuell als ZIP hochgeladen.
