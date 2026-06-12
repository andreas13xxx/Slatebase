# Requirements Document

## Introduction

Automatisierte Release-Pipeline für Slatebase: GitHub Actions für Continuous Integration (Lint, Test, Build), automatische Semantic Versioning mit Changelog-Generierung, Multi-Arch Docker-Image-Build (amd64 + arm64), Push zu GitHub Container Registry (GHCR) und optional DockerHub, sowie ein Version-Check im Admin-Bereich der UI.

Dieses Feature hat keine Code-Abhängigkeiten zu bestehenden Features und ist rein DevOps/Infrastruktur. Es ermöglicht professionelle Releases, automatisierte Qualitätssicherung und einfache Bereitstellung für Self-Hoster.

## Glossary

- **CI_Pipeline**: Der GitHub Actions Workflow, der bei jedem Push und Pull Request automatisch Lint, Tests und Build für Backend und Frontend ausführt.
- **Release_Pipeline**: Der GitHub Actions Workflow, der bei einem Merge auf den `main`-Branch eine neue Version erstellt, einen Changelog generiert und Docker-Images baut und publiziert.
- **GHCR**: GitHub Container Registry (ghcr.io) — die primäre Container-Registry für Slatebase Docker-Images.
- **Semantic_Version**: Versionsnummer im Format `MAJOR.MINOR.PATCH` gemäß Semantic Versioning 2.0 (semver.org).
- **Conventional_Commit**: Commit-Message-Format mit Typ-Prefix (feat:, fix:, refactor:, etc.) das die automatische Versionierung steuert.
- **Version_Endpoint**: Ein Backend-API-Endpoint, der die aktuell installierte Version der Slatebase-Instanz zurückgibt.
- **Version_Check_UI**: Eine Komponente im Admin-Bereich, die die installierte Version mit der neuesten Version auf GitHub vergleicht und bei Updates benachrichtigt.
- **Multi_Arch_Build**: Docker-Image-Build für mehrere CPU-Architekturen (linux/amd64 und linux/arm64) mittels Docker Buildx.
- **GitHub_Release**: Ein GitHub Release-Objekt mit Tag, Titel, Changelog-Body und optionalen Assets.

## Requirements

### Requirement 1: CI-Pipeline bei Push und Pull Request

**User Story:** Als Entwickler möchte ich, dass bei jedem Push und Pull Request automatisch Lint, Tests und Build ausgeführt werden, sodass Fehler frühzeitig erkannt werden.

#### Acceptance Criteria

1. WHEN ein Push auf einen beliebigen Branch erfolgt, THE CI_Pipeline SHALL Lint für das Frontend ausführen.
2. WHEN ein Push auf einen beliebigen Branch erfolgt, THE CI_Pipeline SHALL Tests für Backend und Frontend ausführen.
3. WHEN ein Push auf einen beliebigen Branch erfolgt, THE CI_Pipeline SHALL den Build für Backend und Frontend ausführen.
4. WHEN ein Pull Request erstellt oder aktualisiert wird, THE CI_Pipeline SHALL die gleichen Lint-, Test- und Build-Schritte ausführen wie bei einem Push.
5. IF ein Lint-, Test- oder Build-Schritt fehlschlägt, THEN THE CI_Pipeline SHALL den gesamten Workflow als fehlgeschlagen markieren und den Pull Request am Merge hindern.
6. THE CI_Pipeline SHALL Backend- und Frontend-Jobs parallel ausführen, wobei innerhalb des Frontend-Jobs die Reihenfolge Lint → Test → Build eingehalten wird.
7. THE CI_Pipeline SHALL Node.js Version 24.x (latest minor/patch der Major-Version 24) als Runtime verwenden.
8. WHEN ein Lint-, Test- oder Build-Schritt innerhalb eines Jobs fehlschlägt, THE CI_Pipeline SHALL die nachfolgenden Schritte desselben Jobs überspringen.

### Requirement 2: Automatische Semantic Versioning

**User Story:** Als Maintainer möchte ich, dass Versionsnummern automatisch basierend auf Commit-Messages berechnet werden, sodass ich mich nicht manuell um Versionierung kümmern muss.

#### Acceptance Criteria

1. WHEN ein Merge auf den `main`-Branch Commits mit Prefix `feat:` enthält, THE Release_Pipeline SHALL die MINOR-Version inkrementieren und die PATCH-Version auf 0 zurücksetzen.
2. WHEN ein Merge auf den `main`-Branch Commits mit Prefix `fix:` enthält, THE Release_Pipeline SHALL die PATCH-Version inkrementieren.
3. WHEN ein Merge auf den `main`-Branch Commits mit `BREAKING CHANGE` im Body oder `!` nach dem Typ-Prefix enthält, THE Release_Pipeline SHALL die MAJOR-Version inkrementieren und MINOR sowie PATCH auf 0 zurücksetzen.
4. WHEN ein Merge auf den `main`-Branch Commits mit mehreren versionierungsrelevanten Kategorien enthält, THE Release_Pipeline SHALL nur die höchste Kategorie anwenden (MAJOR > MINOR > PATCH).
5. WHEN ein Merge auf den `main`-Branch keine Commits mit versionierungsrelevanten Prefixes enthält (nur `docs:`, `chore:`, `refactor:`, `test:`), THE Release_Pipeline SHALL keinen neuen Release erstellen.
6. IF noch kein Release-Tag im Repository existiert, THEN THE Release_Pipeline SHALL die erste Version als `v0.1.0` generieren.

### Requirement 3: Changelog-Generierung

**User Story:** Als Benutzer möchte ich bei jedem Release einen strukturierten Changelog erhalten, sodass ich nachvollziehen kann, was sich geändert hat.

#### Acceptance Criteria

1. WHEN ein neuer Release erstellt wird, THE Release_Pipeline SHALL einen Changelog generieren, der alle Commits seit dem letzten Release-Tag enthält. IF kein vorheriger Release-Tag existiert, THEN THE Release_Pipeline SHALL alle Commits seit dem initialen Commit einbeziehen.
2. WHEN der Changelog generiert wird, THE Release_Pipeline SHALL die Commits nach folgenden Kategorien gruppieren: Features (Prefix `feat:`), Bugfixes (Prefix `fix:`), Breaking Changes (Commits mit `BREAKING CHANGE:` im Footer oder `!` nach dem Typ-Prefix). Commits mit anderen Prefixen (`refactor:`, `docs:`, `chore:`, `test:`) SHALL in einer Kategorie "Sonstige Änderungen" zusammengefasst werden.
3. WHEN der Changelog generiert wird, THE Release_Pipeline SHALL den generierten Changelog als Body des GitHub_Release verwenden.
4. WHEN der Changelog generiert wird, THE Release_Pipeline SHALL die `CHANGELOG.md`-Datei im Repository aktualisieren, indem der neue Release-Abschnitt am Anfang der Datei eingefügt wird (neuester Release zuerst), und die Änderung automatisch committen.
5. IF ein Commit keinem Conventional-Commits-Format entspricht (kein erkennbarer Typ-Prefix), THEN THE Release_Pipeline SHALL diesen Commit in der Kategorie "Sonstige Änderungen" auflisten.

### Requirement 4: Multi-Arch Docker-Image-Build

**User Story:** Als Self-Hoster möchte ich Docker-Images erhalten, die sowohl auf x86-64-Servern als auch auf ARM64-Geräten (Raspberry Pi, Apple Silicon) laufen, sodass ich Slatebase auf meiner bevorzugten Hardware betreiben kann.

#### Acceptance Criteria

1. WHEN ein GitHub Release mit einem Semver-Tag veröffentlicht wird, THE Release_Pipeline SHALL Docker-Images für die Architekturen `linux/amd64` und `linux/arm64` bauen und als Multi-Architecture-Manifest-List unter einem einzigen Image-Tag veröffentlichen.
2. THE Release_Pipeline SHALL separate Images für Backend (`slatebase-backend`) und Frontend (`slatebase-frontend`) bauen, wobei jedes Image mit dem Semver-Tag des Releases und zusätzlich mit `latest` getaggt wird.
3. THE Release_Pipeline SHALL Docker Buildx mit QEMU-Emulation für Cross-Architecture-Builds verwenden.
4. THE Release_Pipeline SHALL die bestehenden Dockerfiles in `backend/Dockerfile` und `frontend/Dockerfile` verwenden.
5. IF der Build für eine der Ziel-Architekturen fehlschlägt, THEN THE Release_Pipeline SHALL keine Images veröffentlichen und den Pipeline-Lauf als fehlgeschlagen markieren.

### Requirement 5: Push zu GHCR

**User Story:** Als Self-Hoster möchte ich die Docker-Images über GHCR (ghcr.io) beziehen können, sodass ich ohne zusätzlichen Account-Setup Images pullen kann.

#### Acceptance Criteria

1. WHEN ein neuer Release erstellt wird, THE Release_Pipeline SHALL die Multi-Arch Docker-Images zu `ghcr.io/andreas13xxx/slatebase-backend` und `ghcr.io/andreas13xxx/slatebase-frontend` pushen.
2. THE Release_Pipeline SHALL die Images mit dem Versions-Tag (z.B. `v0.1.0`) taggen.
3. THE Release_Pipeline SHALL die Images zusätzlich mit dem Tag `latest` taggen.
4. THE Release_Pipeline SHALL die Images mit Standard-OCI-Labels versehen: `org.opencontainers.image.version`, `org.opencontainers.image.description`, `org.opencontainers.image.source`, `org.opencontainers.image.licenses`.
5. THE Release_Pipeline SHALL die GHCR-Packages als `public` konfigurieren, sodass ein `docker pull` ohne Authentifizierung möglich ist.

### Requirement 6: Optionaler Push zu DockerHub

**User Story:** Als Self-Hoster möchte ich die Docker-Images optional auch über DockerHub beziehen können, sodass ich meine bevorzugte Registry verwenden kann.

#### Acceptance Criteria

1. WHERE die Repository-Secrets `DOCKERHUB_USERNAME` und `DOCKERHUB_TOKEN` konfiguriert sind, THE Release_Pipeline SHALL die Docker-Images zusätzlich zu DockerHub pushen.
2. WHILE keine DockerHub-Credentials als Repository-Secrets konfiguriert sind, THE Release_Pipeline SHALL den DockerHub-Push überspringen ohne den Workflow als fehlgeschlagen zu markieren.
3. WHERE DockerHub aktiviert ist, THE Release_Pipeline SHALL die gleichen Tags (Version + `latest`) wie bei GHCR verwenden.
4. IF die DockerHub-Credentials ungültig sind und der Login fehlschlägt, THEN THE Release_Pipeline SHALL den DockerHub-Push überspringen und eine Warnung im Workflow-Log ausgeben, ohne den Gesamtlauf als fehlgeschlagen zu markieren.

### Requirement 7: GitHub Release erstellen

**User Story:** Als Benutzer möchte ich bei jedem Release ein GitHub Release-Objekt mit Changelog erhalten, sodass ich neue Versionen über die GitHub-UI einsehen kann.

#### Acceptance Criteria

1. WHEN eine neue Version berechnet wurde, THE Release_Pipeline SHALL ein veröffentlichtes (nicht-Draft) GitHub_Release erstellen, das mit dem entsprechenden Versions-Tag verknüpft ist.
2. WHEN eine neue Version berechnet wurde, THE Release_Pipeline SHALL den generierten Changelog als Release-Body im Markdown-Format verwenden.
3. WHEN eine neue Version berechnet wurde, THE Release_Pipeline SHALL den Release-Titel im Format `Slatebase vX.Y.Z` setzen.
4. WHILE die berechnete MAJOR-Version `0` ist, THE Release_Pipeline SHALL das GitHub_Release als Pre-Release markieren.
5. IF die Erstellung des GitHub_Release fehlschlägt, THEN THE Release_Pipeline SHALL den Workflow als fehlgeschlagen markieren und den Fehler im Workflow-Log ausgeben.

### Requirement 8: Version-Endpoint im Backend

**User Story:** Als Administrator möchte ich über einen API-Endpoint die aktuell installierte Version der Slatebase-Instanz abfragen können, sodass die UI den Versionsstand anzeigen kann.

#### Acceptance Criteria

1. THE Version_Endpoint SHALL unter `GET /api/v1/version` erreichbar sein und HTTP-Status 200 zurückgeben.
2. THE Version_Endpoint SHALL ohne Authentifizierung zugänglich sein.
3. THE Version_Endpoint SHALL die aktuelle Version als JSON im Format `{ "version": "X.Y.Z" }` mit Content-Type `application/json` zurückgeben.
4. THE Version_Endpoint SHALL die Version aus der Umgebungsvariable `SLATEBASE_VERSION` lesen. IF die Umgebungsvariable nicht gesetzt ist, THEN SHALL die Version aus einer Datei `version.json` im Projektverzeichnis gelesen werden.
5. IF weder Umgebungsvariable noch Datei verfügbar ist, THEN THE Version_Endpoint SHALL `{ "version": "development" }` zurückgeben.

### Requirement 9: Version-Check in der Admin-UI

**User Story:** Als Administrator möchte ich im Admin-Bereich sehen, ob eine neuere Version von Slatebase verfügbar ist, sodass ich rechtzeitig Updates durchführen kann.

#### Acceptance Criteria

1. WHEN die Admin-Seite geladen wird, THE Version_Check_UI SHALL die aktuell installierte Version vom Version_Endpoint abrufen und während des Ladevorgangs einen Lade-Indikator anzeigen.
2. WHEN die Admin-Seite geladen wird, THE Version_Check_UI SHALL die neueste verfügbare Version von der GitHub Releases API abrufen mit einem Timeout von 10 Sekunden.
3. WHILE die installierte Version der neuesten Version entspricht, THE Version_Check_UI SHALL den Status "Aktuell" mit der installierten Versionsnummer anzeigen.
4. WHILE eine neuere Version auf GitHub verfügbar ist, THE Version_Check_UI SHALL eine Update-Benachrichtigung mit der neuen Versionsnummer und einem Link zum Release anzeigen.
5. IF der GitHub-API-Aufruf fehlschlägt (Netzwerkfehler, Rate Limit, Timeout), THEN THE Version_Check_UI SHALL nur die installierte Version anzeigen ohne Fehlermeldung.
6. THE Version_Check_UI SHALL den Vergleich clientseitig per Semver-Vergleich durchführen.
7. WHILE die installierte Version `development` ist, THE Version_Check_UI SHALL den Hinweis "Entwicklungsversion" anzeigen und keinen Versionsvergleich durchführen.
8. IF der Version_Endpoint nicht erreichbar ist oder einen Fehler zurückgibt, THEN THE Version_Check_UI SHALL eine Fehlermeldung anzeigen die auf die fehlende Verbindung zum Backend hinweist.
