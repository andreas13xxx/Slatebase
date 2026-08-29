# Requirements Document

## Introduction

Vaults sollen sich mit einem oder mehreren externen Git-Remotes synchronisieren lassen, ohne dass dafür ein Browser-Tab geöffnet bleiben oder das obsidian-git-Community-Plugin (das nur eingeschränkt im Browser-Plugin-Kompat-Layer läuft, z.B. ohne SSH und mit CORS-Proxy-Abhängigkeit für HTTPS-Remotes) genutzt werden muss. Git-Sync läuft stattdessen serverseitig im Backend, shellt auf das native `git`-Binary aus und wird vaultspezifisch konfiguriert. Ersetzt/ergänzt die bisherige Browser-only-Lösung; ist unabhängig vom entfernten CouchDB-basierten `vault-sync`-Modul und dessen abgelöster `sync-conflict-resolution`-Spec.

## Glossary

- **Git_Sync_Remote**: Eine einzelne, vaultspezifische Konfiguration aus Name, Remote-URL, Auth-Methode und Sync-Intervall
- **Vault_Branch**: Der lokale Git-Branch eines Vaults — gemeinsam für alle Remotes desselben Vaults, da ein Arbeitsverzeichnis nur auf einem Branch stehen kann
- **Sync_Engine**: Die Komponente, die einen einzelnen Fetch/Merge/Push-Zyklus für einen Remote ausführt
- **Sync_Scheduler**: Der Hintergrunddienst, der fällige, aktivierte Remotes periodisch anstößt
- **Credential**: Das Geheimnis für den Remote-Zugriff — ein Personal Access Token (HTTPS) oder ein privater SSH-Schlüssel (SSH)

## Requirements

### Requirement 1: Vaultspezifische Konfiguration mehrerer Remotes

**User Story:** Als Vault-Besitzer möchte ich mehrere Git-Remotes pro Vault konfigurieren können, damit ich denselben Vault z.B. zusätzlich auf einen zweiten Remote spiegeln kann.

#### Acceptance Criteria

1. THE Git_Sync_API SHALL pro Vault beliebig viele Git_Sync_Remote-Einträge erlauben, bis zu einer Obergrenze von 20 pro Vault
2. THE Git_Sync_API SHALL für jeden Remote Name, Remote-URL, Auth-Methode (`https-token` oder `ssh-key`), Sync-Intervall in Minuten und einen Enabled-Status persistieren
3. THE Git_Sync_API SHALL alle Remotes eines Vaults denselben Vault_Branch verwenden lassen (ein Branch-Feld pro Vault, nicht pro Remote)
4. THE Git_Sync_API SHALL Credentials getrennt von der übrigen Konfiguration speichern und niemals im Klartext in einer API-Antwort zurückgeben

### Requirement 2: Sichere Credential-Speicherung

**User Story:** Als Vault-Besitzer möchte ich, dass mein Personal Access Token oder SSH-Schlüssel sicher gespeichert wird, damit ein Zugriff auf die Datenbank/Dateien allein nicht zur Kompromittierung führt.

#### Acceptance Criteria

1. THE Sync_Engine SHALL Credentials AES-256-GCM-verschlüsselt ablegen, mit einem eigenen Schlüssel getrennt von Plugin-Secrets
2. THE Sync_Engine SHALL Credentials niemals als Klartext-Argument an den `git`-Prozess übergeben (Sichtbarkeit über `ps`/`/proc`), sondern über einen kurzlebigen GIT_ASKPASS-Mechanismus (HTTPS) bzw. eine temporäre, mit Zugriffsrechten 0600 versehene Schlüsseldatei (SSH)
3. THE Sync_Engine SHALL bei SSH-Auth Host-Keys pro Remote in einer eigenen, persistenten `known_hosts`-Datei pinnen (Trust-on-First-Use), nicht bei jedem Lauf zurücksetzen

### Requirement 3: Synchronisationsablauf

**User Story:** Als Vault-Besitzer möchte ich, dass mein Vault automatisch mit dem Remote synchron gehalten wird, ohne meine lokalen Änderungen zu verlieren.

#### Acceptance Criteria

1. WHEN ein Sync-Lauf startet UND das Vault-Verzeichnis noch kein Git-Repository ist, THE Sync_Engine SHALL es mit dem konfigurierten Vault_Branch initialisieren
2. THE Sync_Engine SHALL vor jedem Fetch alle lokalen Änderungen committen (Autor "Slatebase Sync <sync@slatebase.local>")
3. WHEN der Fetch fehlschlägt (z.B. leerer/neuer Remote ohne Branch), THE Sync_Engine SHALL den Merge-Schritt überspringen und direkt pushen
4. WHEN der Merge ohne Konflikt gelingt, THE Sync_Engine SHALL anschließend pushen
5. THE Sync_Engine SHALL `.slatebase/` und `.obsidian/` automatisch zur `.gitignore` des Vaults hinzufügen, falls nicht vorhanden

### Requirement 4: Konfliktbehandlung

**User Story:** Als Vault-Besitzer möchte ich Merge-Konflikte direkt im Editor lösen können, ohne einen separaten Konfliktlösungs-Dialog zu benötigen.

#### Acceptance Criteria

1. WHEN ein Merge einen Konflikt erzeugt, THE Sync_Engine SHALL den Merge NICHT abbrechen, sondern die Konfliktmarker im Arbeitsverzeichnis belassen
2. WHEN ein Merge einen Konflikt erzeugt, THE Sync_Engine SHALL den Push-Schritt überspringen und den Lauf als `conflict` protokollieren, inklusive der Liste betroffener Dateien
3. WHEN der Benutzer eine konfliktbehaftete Datei im Markdown-Editor bearbeitet und speichert, THE nächste Sync_Engine-Ausführung SHALL die Datei als normale Änderung committen und den Sync fortsetzen

### Requirement 5: Ausführung — Intervall und manueller Trigger

**User Story:** Als Vault-Besitzer möchte ich sowohl automatische, periodische Synchronisation als auch einen manuellen "Jetzt synchronisieren"-Trigger.

#### Acceptance Criteria

1. THE Sync_Scheduler SHALL jeden aktivierten Remote gemäß seinem konfigurierten Intervall automatisch ausführen
2. THE Git_Sync_API SHALL einen Endpunkt zum sofortigen, manuellen Anstoßen eines einzelnen Remotes bereitstellen
3. THE Sync_Engine SHALL pro Vault höchstens einen Sync-Lauf gleichzeitig ausführen (serialisiert über alle Remotes desselben Vaults), da sie sich ein Arbeitsverzeichnis teilen
4. THE Git_Sync_API SHALL den letzten Lauf-Status (Zeitpunkt, Ergebnis, Fehlermeldung, Konfliktdateien) pro Remote abrufbar machen

### Requirement 6: Feature-Toggle und Zugriffskontrolle

**User Story:** Als Administrator möchte ich Git-Sync serverweit an-/abschalten können, und als Vault-Besitzer möchte ich, dass nur berechtigte Benutzer die Konfiguration ändern können.

#### Acceptance Criteria

1. THE System SHALL Git-Sync hinter einem Feature-Toggle `git-sync` bereitstellen, standardmäßig aktiviert (ein Administrator kann es serverweit deaktivieren)
2. THE Git_Sync_API SHALL Lesezugriff auf Konfiguration/Status nur mit Vault-Leseberechtigung erlauben
3. THE Git_Sync_API SHALL Schreibzugriff (Anlegen, Ändern, Löschen, manueller Trigger) nur mit Vault-Schreibberechtigung erlauben
4. WHEN das Feature `git-sync` serverweit deaktiviert ist, THE Settings-UI SHALL den Navigationseintrag „Git-Synchronisation" sichtbar, aber deaktiviert (disabled) mit einem Tooltip-Hinweis darstellen, und SHALL beim direkten Navigieren zur Sektion einen Hinweistext anzeigen, dass das Feature deaktiviert ist und sich der Benutzer an einen Administrator wenden soll — statt die Sektion vollständig auszublenden oder die API-Requests einfach mit 403 fehlschlagen zu lassen
