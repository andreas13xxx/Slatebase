# Requirements Document

## Introduction

Slatebase hat heute umfangreiche Unit- und Integrationstests (Vitest, 80 Backend- und 154 Frontend-Testdateien) sowie eine Playwright-Konfiguration im Frontend (`frontend/playwright.config.ts`). Es existiert jedoch **kein echter End-to-End-Test**: Die einzige vorhandene Spec (`frontend/e2e/demo-recording.spec.ts`) enthält keine Assertions, dient nur der Aufnahme eines Marketing-GIFs und läuft nicht in der CI. Dadurch ist ungetestet, ob Backend und Frontend als reales, über HTTP verbundenes System (inkl. Auth, Realtime/SSE, Dateisystem-Persistenz und Docker-Deployment) tatsächlich zusammen funktionieren.

Dieses Feature führt eine echte E2E-Test-Suite ein, die den vollständigen Stack (Browser → Frontend → Backend → Dateisystem) gegen kritische Nutzer-Workflows prüft, in CI automatisiert läuft und wartbar bleibt, wenn die Anwendung wächst.

## Glossary

- **E2E_Suite**: Die Gesamtheit der Playwright-Testdateien unter `frontend/e2e/`, die echte Browser-Interaktionen gegen einen laufenden Backend+Frontend-Stack ausführen und Assertions prüfen.
- **Dev_Stack_Run**: Testlauf der E2E_Suite gegen `npm run dev` (Vite Dev-Server, Port 5173) und den Backend-Dev-Prozess (`tsx watch`, Port 3000) — schnell, für jeden Push/PR.
- **Docker_Stack_Run**: Testlauf der E2E_Suite gegen die per `docker-compose.dev.yml` gebauten Produktions-nahen Container (Nginx-Frontend, Node-Backend) — realitätsnah, für Nightly/Release.
- **Test_Data_Isolation**: Mechanismus, der jedem E2E-Testlauf ein eigenes, leeres Datenverzeichnis (Vaults, Benutzer, Sessions) zuweist und nach Lauf-Ende entfernt.
- **Page_Object**: Eine Klasse/Modul unter `frontend/e2e/pages/`, die Selektoren und Interaktionen einer UI-Fläche (z.B. Editor, Vault-Explorer, Admin-Bereich) kapselt.
- **Realtime_Scenario**: Ein E2E-Test, der zwei parallele Browser-Kontexte (zwei "Nutzer") gegen denselben Vault verwendet, um SSE-getriebene Live-Updates zu verifizieren.
- **CI_E2E_Job**: Der GitHub-Actions-Job/Workflow, der die E2E_Suite automatisiert ausführt und Artefakte (Report, Traces, Screenshots) veröffentlicht.
- **Stable_Selector**: Ein `data-testid`-Attribut, das gezielt für Testzugriff in die Komponente eingefügt wird, im Gegensatz zu CSS-Klassen oder `title`-Attributen, die sich aus rein visuellen/i18n-Gründen ändern können.

## Requirements

### Requirement 1: Testumgebungs-Strategie

**User Story:** Als Entwickler möchte ich E2E-Tests sowohl schnell im Dev-Modus als auch realitätsnah gegen die echten Docker-Images laufen lassen können, sodass ich schnelles Feedback bekomme, ohne die Produktions-Nähe zu verlieren.

#### Acceptance Criteria

1. THE E2E_Suite SHALL wahlweise als Dev_Stack_Run oder als Docker_Stack_Run ausführbar sein, gesteuert über eine Umgebungsvariable (`E2E_BASE_URL` o.ä.), ohne dass Testcode dafür verzweigt werden muss.
2. WHEN ein Dev_Stack_Run gestartet wird, THE E2E_Suite SHALL sowohl den Backend- als auch den Frontend-Dev-Prozess automatisiert starten und auf Erreichbarkeit warten, bevor Tests ausgeführt werden.
3. WHEN ein Docker_Stack_Run gestartet wird, THE E2E_Suite SHALL gegen die via `docker-compose.dev.yml` gebauten Container laufen und den Backend-Healthcheck (`/api/v1/vaults`) als Bereitschaftssignal verwenden.
4. THE CI_E2E_Job SHALL einen Dev_Stack_Run bei Pull-Request-Events gegen `master` ausführen (nicht bei jedem Push auf einen Feature-Branch), um den bereits bestehenden Doppel-Trigger (`push` + `pull_request`) von `ci.yml` nicht zusätzlich für den teuersten CI-Job zu verdoppeln.
5. THE CI_E2E_Job SHALL nur ausgeführt werden, WENN sich Dateien unterhalb von `frontend/**` oder `backend/**` geändert haben (Path-Filter), sodass reine Doku-/Steering-/Spec-Änderungen (`.kiro/**`, `*.md` im Root) keinen E2E-Lauf auslösen.
6. THE CI_E2E_Job SHALL für Pull Requests gegen `master` als verpflichtender Merge-Gate-Check konfiguriert sein (Requirement für den Merge).
7. THE CI_E2E_Job SHALL mindestens einmal täglich (Nightly) sowie vor jedem Release einen Docker_Stack_Run ausführen, unabhängig von Push-/PR-Aktivität.

### Requirement 2: Testdaten-Isolation

**User Story:** Als Entwickler möchte ich, dass jeder E2E-Lauf mit einem sauberen, isolierten Datenstand beginnt, sodass Tests deterministisch sind und sich nicht gegenseitig beeinflussen oder echte Nutzerdaten gefährden.

#### Acceptance Criteria

1. WHEN ein E2E-Lauf startet, THE Test_Data_Isolation SHALL dem Backend ein leeres, für diesen Lauf eindeutiges Datenverzeichnis zuweisen (z.B. via `SLATEBASE_DATA_DIR`/Bind-Mount), sodass keine bestehenden Vaults oder Benutzer wiederverwendet werden.
2. WHEN ein E2E-Lauf endet (erfolgreich oder fehlgeschlagen), THE Test_Data_Isolation SHALL das für den Lauf angelegte Datenverzeichnis entfernen.
3. THE E2E_Suite SHALL benötigte Ausgangsdaten (Admin-Benutzer, Test-Vault, Testdateien) über einen Setup-Schritt (API-Aufrufe oder Fixtures) selbst anlegen, statt manuell vorbereitete Fixtures im Repository vorauszusetzen.
4. IF parallele Testläufe (z.B. mehrere CI-Jobs) gleichzeitig laufen, THEN THE Test_Data_Isolation SHALL sicherstellen, dass sich deren Datenverzeichnisse und Ports nicht überschneiden.

### Requirement 3: Kritische Workflow-Abdeckung

**User Story:** Als Maintainer möchte ich, dass die wichtigsten Nutzer-Workflows durch echte E2E-Tests mit Assertions abgesichert sind, sodass Regressionen im Zusammenspiel von Frontend und Backend vor dem Release auffallen.

#### Acceptance Criteria

1. THE E2E_Suite SHALL den Login-Flow abdecken, einschließlich erzwungenem Passwortwechsel beim ersten Login.
2. THE E2E_Suite SHALL Vault-CRUD (Anlegen, Umbenennen, Löschen) und das Wechseln zwischen mehreren Vaults abdecken.
3. THE E2E_Suite SHALL den Datei-Explorer (Datei/Ordner anlegen, umbenennen, verschieben, löschen) abdecken.
4. THE E2E_Suite SHALL den Markdown-Editor abdecken: Datei öffnen, Inhalt bearbeiten, Autosave abwarten und verifizieren (Persistenz nach Reload), sowie Wechsel zwischen Source- und Live-Preview-Modus.
5. THE E2E_Suite SHALL Tab-Verwaltung und Navigation (mehrere Tabs offen, Tab-Wechsel, Schließen) abdecken.
6. THE E2E_Suite SHALL Vault-Sharing zwischen zwei Benutzern als Realtime_Scenario abdecken, inklusive Sichtbarkeit der Freigabe beim zweiten Benutzer ohne manuellen Reload.
7. THE E2E_Suite SHALL mindestens einen Admin-Workflow (Benutzerverwaltung oder Feature-Toggles) abdecken.
8. WHERE eine der oben genannten Flows aus Aufwandsgründen zurückgestellt wird, SHALL dies im Design-Dokument explizit als spätere Phase benannt werden, statt stillschweigend zu fehlen.

### Requirement 4: Stabile Selektoren und wartbare Struktur

**User Story:** Als Entwickler möchte ich, dass E2E-Tests nicht bei jeder CSS-Änderung brechen, sodass die Suite langfristig wartbar bleibt und nicht als Wartungslast wahrgenommen wird.

#### Acceptance Criteria

1. THE E2E_Suite SHALL für neu geschriebene Tests bevorzugt Stable_Selector (`data-testid`) statt CSS-Klassen oder `title`-Attributen verwenden.
2. THE E2E_Suite SHALL wiederkehrende UI-Interaktionen (Login, Vault-Auswahl, Datei öffnen) über Page_Object kapseln, sodass ein UI-Refactoring nur an einer Stelle nachgezogen werden muss.
3. THE E2E_Suite SHALL keine festen `waitForTimeout`-Wartezeiten als primäres Synchronisationsmittel verwenden, sondern auf konkrete Zustände (Element sichtbar, Netzwerk-Response, Text-Inhalt) warten.
4. THE E2E_Suite SHALL bestehende, für den E2E-Zweck fehlende `data-testid`-Attribute schrittweise ergänzen, beginnend mit den in Requirement 3 genannten Flows.

### Requirement 5: CI-Integration und Diagnosefähigkeit

**User Story:** Als Entwickler möchte ich bei einem fehlgeschlagenen E2E-Test in der CI schnell erkennen können, was schiefgelaufen ist, sodass ich den Fehler ohne lokalen Nachbau reproduzieren kann.

#### Acceptance Criteria

1. WHEN ein E2E-Test in der CI fehlschlägt, THE CI_E2E_Job SHALL einen Playwright-HTML-Report sowie Trace- und Screenshot-Dateien des fehlgeschlagenen Tests als Workflow-Artefakt bereitstellen.
2. THE CI_E2E_Job SHALL den Dev_Stack_Run als eigenständigen Job/Workflow-Schritt ausführen, der einen fehlschlagenden Build/PR nicht durch andere, unabhängige Jobs verdeckt.
3. IF ein E2E-Test flakey ist (wiederholt inkonsistent fehlschlägt ohne Code-Änderung), THEN THE E2E_Suite SHALL über die Playwright-Retry-Konfiguration in CI (bestehend: 2 Retries) hinaus keine stillschweigenden Retries im Testcode selbst verwenden, die das Symptom verdecken.
4. THE CI_E2E_Job SHALL bei rotem Docker_Stack_Run (Nightly/Release) eine sichtbare Benachrichtigung erzeugen (z.B. fehlgeschlagener Workflow-Run in GitHub Actions).

### Requirement 6: Abgrenzung zum bestehenden Demo-Skript

**User Story:** Als Entwickler möchte ich zwischen der echten Test-Suite und dem bestehenden Demo-Aufnahme-Skript klar unterscheiden können, sodass beide unabhängig voneinander gepflegt werden können, ohne sich gegenseitig zu stören.

#### Acceptance Criteria

1. THE E2E_Suite SHALL `frontend/e2e/demo-recording.spec.ts` von der regulären Testausführung (`npm run test:e2e`, CI_E2E_Job) ausschließen, da dieses Skript keine Assertions enthält und einen anderen Zweck (Video-Aufnahme) verfolgt.
2. THE E2E_Suite SHALL eine klare Verzeichniskonvention einführen, die reale Tests (`frontend/e2e/specs/` o.ä.) von Hilfsskripten wie der Demo-Aufnahme trennt.
