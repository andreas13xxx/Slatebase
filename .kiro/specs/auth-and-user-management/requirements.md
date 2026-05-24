# Requirements Document

## Introduction

Slatebase ist derzeit ohne Authentifizierung — alle API-Endpunkte sind offen zugänglich. Dieses Feature führt eine vollständige Nutzerverwaltung mit Authentifizierung, Rollen und Berechtigungen ein. Benutzer müssen sich anmelden, bevor sie auf Vaults zugreifen können. Administratoren erhalten erweiterte Berechtigungen zur Server- und Benutzerverwaltung. Beim ersten Start wird ein Standard-Admin-Konto bereitgestellt.

## Glossary

- **System**: Die Slatebase-Anwendung (Backend + Frontend) als Ganzes
- **Auth_Service**: Die Backend-Komponente, die Authentifizierung und Session-Management durchführt
- **User_Service**: Die Backend-Komponente, die Benutzerdaten und -profile verwaltet
- **Role_Service**: Die Backend-Komponente, die Rollen und Berechtigungen verwaltet
- **Vault_Service**: Die bestehende Backend-Komponente für Vault-Operationen
- **Frontend**: Die React-SPA, die dem Benutzer die Oberfläche bereitstellt
- **Benutzer**: Eine registrierte Person mit einem Konto im System
- **Administrator**: Ein Benutzer mit der Rolle „admin" und erweiterten Berechtigungen
- **Session**: Ein authentifizierter Zustand eines Benutzers nach erfolgreichem Login
- **Vault_Freigabe**: Die Berechtigung eines Benutzers, auf den Vault eines anderen Benutzers zuzugreifen
- **Benutzerprofil**: Die Gesamtheit der Einstellungen und Metadaten eines Benutzers
- **Opaker_Token**: Ein zufällig generierter String ohne eingebettete Informationen, der serverseitig gespeichert wird. Der Server hält eine Zuordnung: Token → Benutzer-ID, Rolle, Ablaufzeitpunkt
- **CSRF_Token**: Ein serverseitig generierter Einmalwert, der bei zustandsändernden Anfragen mitgesendet werden muss, um Cross-Site Request Forgery zu verhindern
- **Audit_Log**: Ein unveränderliches Protokoll sicherheitsrelevanter Aktionen im System, gespeichert als Append-Only-Dateien

## Requirements

### Requirement 1: Benutzer-Authentifizierung

**User Story:** Als Benutzer möchte ich mich mit Benutzername und Passwort anmelden, damit nur autorisierte Personen auf meine Vaults zugreifen können.

#### Acceptance Criteria

1. WHEN ein Benutzer einen Benutzernamen (1–64 Zeichen) und ein Passwort (8–128 Zeichen) übermittelt und die Anmeldedaten mit einem registrierten Konto übereinstimmen, THE Auth_Service SHALL eine Session mit einer Gültigkeitsdauer von 24 Stunden erstellen und einen Opaker_Token (zufällig generierter String) zurückgeben, wobei der Server eine Zuordnung Token → Benutzer-ID, Rolle, Ablaufzeitpunkt speichert
2. IF ein Benutzer einen nicht existierenden Benutzernamen oder ein falsches Passwort übermittelt, THEN THE Auth_Service SHALL die Anmeldung ablehnen und eine Fehlerantwort mit Status 401 zurückgeben, ohne preiszugeben ob der Benutzername oder das Passwort falsch war
3. WHILE keine gültige Session besteht, THE System SHALL alle API-Endpunkte außer dem Login-Endpunkt mit Status 401 ablehnen
4. WHEN ein Benutzer sich abmeldet, THE Auth_Service SHALL die Session ungültig machen und das Token invalidieren
5. IF ein Session-Token abgelaufen ist, THEN THE Auth_Service SHALL die Anfrage mit Status 401 ablehnen und in der Antwort angeben, dass die Session abgelaufen ist
6. IF ein Benutzer 5 fehlgeschlagene Anmeldeversuche innerhalb von 15 Minuten für denselben Benutzernamen übermittelt, THEN THE Auth_Service SHALL weitere Anmeldeversuche für diesen Benutzernamen für 15 Minuten mit Status 429 ablehnen
7. IF ein Benutzer einen Benutzernamen mit weniger als 1 oder mehr als 64 Zeichen oder ein Passwort mit weniger als 8 oder mehr als 128 Zeichen übermittelt, THEN THE Auth_Service SHALL die Anfrage mit Status 400 ablehnen und eine Fehlermeldung zurückgeben, die auf das ungültige Eingabeformat hinweist

### Requirement 2: Ersteinrichtung mit Standard-Admin-Konto

**User Story:** Als Erstbenutzer möchte ich mich beim ersten Start mit Standard-Zugangsdaten anmelden können, damit ich das System initial einrichten kann.

#### Acceptance Criteria

1. WHEN das System startet und keine Benutzer existieren, THE User_Service SHALL einen Administrator-Benutzer mit Benutzername „admin" und Passwort „admin" anlegen
2. WHEN der Standard-Admin sich erstmalig anmeldet, THE Frontend SHALL den Benutzer auffordern, sein Passwort zu ändern, bevor andere Aktionen möglich sind
3. WHILE der Standard-Admin sein initiales Passwort nicht geändert hat, THE System SHALL ausschließlich die Passwort-Änderung als Aktion zulassen
4. WHEN der Standard-Admin ein neues Passwort setzt, das mindestens 8 Zeichen lang ist und sich vom bisherigen Passwort unterscheidet, THE User_Service SHALL das Passwort aktualisieren und den Zwangs-Änderungsstatus entfernen
5. IF der Standard-Admin ein neues Passwort setzt, das weniger als 8 Zeichen enthält oder mit dem bisherigen Passwort identisch ist, THEN THE User_Service SHALL die Änderung ablehnen und eine Fehlermeldung zurückgeben, die den Ablehnungsgrund angibt

### Requirement 3: Benutzerprofil-Verwaltung

**User Story:** Als Benutzer möchte ich mein Profil mit persönlichen Einstellungen pflegen, damit das System an meine Bedürfnisse angepasst ist.

#### Acceptance Criteria

1. THE User_Service SHALL für jeden Benutzer folgende Profilfelder speichern: Anzeigename (1–50 Zeichen), E-Mail-Adresse (maximal 254 Zeichen, RFC 5322-konform), Avatar-URL (maximal 2048 Zeichen, muss mit http:// oder https:// beginnen), bevorzugte Sprache (einer der Werte: "de", "en") und Farbschema-Präferenz (einer der Werte: "light", "dark", "system")
2. WHEN ein Benutzer sein Profil aktualisiert, THE User_Service SHALL die geänderten Felder gemäß den in Kriterium 1 definierten Regeln validieren, persistieren und eine Bestätigung mit den aktualisierten Profildaten innerhalb von 2 Sekunden zurückgeben
3. IF ein Benutzer eine E-Mail-Adresse angibt die nicht RFC 5322-konform ist oder 254 Zeichen überschreitet, THEN THE User_Service SHALL die gesamte Änderungsanfrage ablehnen, keine Felder persistieren und eine Fehlermeldung zurückgeben die das ungültige Feld benennt
4. WHEN ein Benutzer sein Passwort ändern möchte, THE User_Service SHALL das aktuelle Passwort zur Bestätigung verlangen und das neue Passwort nur setzen wenn es mindestens 8 und maximal 128 Zeichen lang ist
5. IF das zur Bestätigung eingegebene aktuelle Passwort nicht mit dem gespeicherten Passwort übereinstimmt, THEN THE User_Service SHALL die Passwortänderung ablehnen, das bestehende Passwort beibehalten und eine Fehlermeldung zurückgeben die auf falsche Anmeldedaten hinweist
6. IF bei einer Profilaktualisierung ein Feld die definierten Längengrenzen überschreitet oder einen ungültigen Wert für Sprache bzw. Farbschema enthält, THEN THE User_Service SHALL die gesamte Änderungsanfrage ablehnen und eine Fehlermeldung zurückgeben die das betroffene Feld und die Verletzung benennt
7. THE User_Service SHALL Benutzerdaten als JSON-Datei im Dateisystem unter dem Pfad `data/users/` persistieren

### Requirement 4: Rollenbasierte Zugriffskontrolle

**User Story:** Als Administrator möchte ich Benutzern Rollen zuweisen, damit unterschiedliche Berechtigungsstufen im System existieren.

#### Acceptance Criteria

1. THE Role_Service SHALL mindestens zwei Rollen bereitstellen: „admin" (Administrator) und „user" (normaler Benutzer)
2. WHEN ein neuer Benutzer angelegt wird, THE Role_Service SHALL dem Benutzer die Rolle „user" als Standard zuweisen
3. WHEN ein Administrator die Rolle eines Benutzers ändert, THE Role_Service SHALL die neue Rolle so anwenden, dass die nächste Anfrage des betroffenen Benutzers bereits mit der neuen Rolle autorisiert wird, ohne dass ein erneutes Einloggen erforderlich ist
4. IF ein Benutzer ohne Administrator-Rolle eine administrative Aktion ausführt (Rollen zuweisen, Benutzer anlegen oder löschen, Systemkonfiguration ändern), THEN THE System SHALL die Anfrage mit Status 403 ablehnen und eine Fehlermeldung zurückgeben, die auf fehlende Berechtigung hinweist
5. IF der einzige verbleibende Benutzer mit der Rolle „admin" versucht, seine eigene Admin-Rolle zu entfernen, THEN THE System SHALL die Anfrage mit Status 409 ablehnen und eine Fehlermeldung zurückgeben, die darauf hinweist, dass mindestens ein Administrator existieren muss

### Requirement 5: Benutzerverwaltung durch Administratoren

**User Story:** Als Administrator möchte ich Benutzer anlegen, bearbeiten und entfernen können, damit ich die Zugänge zum System kontrolliere.

#### Acceptance Criteria

1. WHEN ein Administrator einen neuen Benutzer anlegt, THE User_Service SHALL den Benutzer mit Benutzername (3–64 Zeichen, alphanumerisch plus Bindestrich und Unterstrich), initialem Passwort (mindestens 8 Zeichen) und einer Rolle aus der Menge {admin, user} erstellen
2. WHEN ein Administrator einen Benutzer entfernt, THE User_Service SHALL das Benutzerkonto und alle zugehörigen Sessions löschen
3. WHEN ein Administrator das Passwort eines Benutzers zurücksetzt, THE User_Service SHALL ein neues temporäres Passwort mit mindestens 8 Zeichen generieren, den Zwangs-Änderungsstatus aktivieren und das temporäre Passwort in der Antwort zurückgeben
4. IF ein Administrator versucht, den letzten Administrator-Benutzer zu löschen, THEN THE User_Service SHALL die Löschung ablehnen und eine Fehlermeldung zurückgeben, die angibt, dass mindestens ein Administrator existieren muss
5. WHEN ein Administrator die Benutzerliste abruft, THE User_Service SHALL alle Benutzer mit Benutzername, Anzeigename, E-Mail, Rolle und Erstellungsdatum zurückgeben, sortiert nach Benutzername aufsteigend, mit maximal 100 Einträgen pro Seite
6. IF ein Administrator versucht, einen Benutzer mit einem bereits existierenden Benutzernamen anzulegen, THEN THE User_Service SHALL die Erstellung ablehnen und eine Fehlermeldung zurückgeben, die auf den Namenskonflikt hinweist
7. IF ein Administrator versucht, einen nicht existierenden Benutzer zu bearbeiten oder zu entfernen, THEN THE User_Service SHALL die Anfrage ablehnen und eine Fehlermeldung zurückgeben, die angibt, dass der Benutzer nicht gefunden wurde
8. IF ein Administrator einen Benutzer mit fehlenden oder ungültigen Pflichtfeldern (Benutzername, Passwort oder Rolle) anlegt, THEN THE User_Service SHALL die Erstellung ablehnen und eine Fehlermeldung zurückgeben, die die ungültigen Felder benennt

### Requirement 6: Vault-Freigabe

**User Story:** Als Benutzer möchte ich meine Vaults mit anderen Benutzern teilen, damit wir gemeinsam an Wissenssammlungen arbeiten können.

#### Acceptance Criteria

1. WHEN ein Vault-Besitzer einen Vault für einen anderen Benutzer freigibt, THE Vault_Service SHALL die Freigabe mit der angegebenen Berechtigungsstufe („read" oder „write") und der Benutzer-ID des Empfängers speichern
2. WHILE ein Benutzer eine „read"-Freigabe für einen Vault hat, THE Vault_Service SHALL dem Benutzer ausschließlich lesenden Zugriff auf den Vault gewähren und Schreiboperationen mit einer Fehlermeldung ablehnen, die auf fehlende Schreibberechtigung hinweist
3. WHILE ein Benutzer eine „write"-Freigabe für einen Vault hat, THE Vault_Service SHALL dem Benutzer lesenden und schreibenden Zugriff auf den Vault gewähren
4. WHEN ein Vault-Besitzer eine Freigabe widerruft, THE Vault_Service SHALL den Zugriff des betreffenden Benutzers innerhalb derselben Anfrage entziehen, sodass nachfolgende Zugriffe des Benutzers abgelehnt werden
5. WHEN ein Benutzer auf einen Vault zugreift, für den er weder Besitzer noch Freigabeempfänger ist, THE Vault_Service SHALL die Anfrage mit einer Fehlermeldung ablehnen, die auf fehlende Zugriffsberechtigung hinweist
6. THE Vault_Service SHALL jedem Vault genau einen Besitzer zuordnen (den Benutzer, der den Vault erstellt hat), und maximal 20 Freigaben pro Vault zulassen
7. IF ein Vault-Besitzer einen Vault für einen nicht existierenden Benutzer oder für sich selbst freigibt, THEN THE Vault_Service SHALL die Freigabe ablehnen und eine Fehlermeldung zurückgeben, die den Ablehnungsgrund angibt
8. THE Vault_Service SHALL erlauben, dass ein Vault gleichzeitig mit mehreren Benutzern in unterschiedlichen Berechtigungsstufen (read/write) geteilt wird
9. WHEN ein Vault-Besitzer die Berechtigungsstufe einer bestehenden „read"-Freigabe auf „write" ändern möchte, THE Vault_Service SHALL die Berechtigungsstufe aktualisieren und eine Bestätigung zurückgeben
10. IF ein Vault-Besitzer einen Vault löschen möchte und der Vault aktive Freigaben hat, THEN THE Vault_Service SHALL die Löschung ablehnen und eine Fehlermeldung zurückgeben, die darauf hinweist, dass der Vault noch geteilt ist
11. IF ein Vault-Besitzer einen Vault mit aktiven „write"-Freigaben löschen möchte, THEN THE Vault_Service SHALL den Besitzer warnen und zwei Optionen anbieten: (a) alle Freigaben beenden und den Vault löschen, oder (b) den Besitz an genau einen anderen Benutzer übertragen
12. WHEN ein Vault-Besitzer den Besitz eines Vaults an einen anderen Benutzer überträgt, THE Vault_Service SHALL sicherstellen, dass alle anderen Freigaben (außer an den Übertragungsempfänger) zuvor widerrufen wurden, den Besitz auf den Empfänger übertragen und dem bisherigen Besitzer jeglichen Zugriff entziehen
13. IF ein Vault-Besitzer den Besitz übertragen möchte und noch Freigaben an andere Benutzer als den Übertragungsempfänger bestehen, THEN THE Vault_Service SHALL die Übertragung ablehnen und eine Fehlermeldung zurückgeben, die darauf hinweist, dass zuerst alle anderen Freigaben widerrufen werden müssen
14. IF ein Benutzerkonto gelöscht werden soll und der Benutzer noch Vaults besitzt, THEN THE User_Service SHALL die Kontolöschung ablehnen und eine Fehlermeldung zurückgeben, die darauf hinweist, dass alle Vaults zuerst gelöscht oder übertragen werden müssen

### Requirement 7: Server-Administration

**User Story:** Als Administrator möchte ich Servereinstellungen verwalten können, damit ich den Betrieb des Systems steuern kann.

#### Acceptance Criteria

1. WHEN ein Administrator die Servereinstellungen abruft, THE System SHALL die aktuelle Konfiguration als JSON-Objekt mit den Feldern Port, Host, erlaubte Origins, maximale Dateigröße (in Bytes) und Log-Level zurückgeben
2. WHEN ein Administrator Servereinstellungen ändert, THE System SHALL die neuen Werte gegen folgende Regeln validieren: Port ist eine Ganzzahl von 1 bis 65535, Host ist ein nicht-leerer String, Log-Level ist einer der Werte "debug", "info", "warn" oder "error", maximale Dateigröße ist eine positive Ganzzahl, erlaubte Origins ist ein Array aus Strings — und bei erfolgreicher Validierung die Werte in der Konfigurationsdatei persistieren
3. WHEN ein Administrator einen Server-Neustart auslöst, THE System SHALL laufende Anfragen innerhalb von maximal 10 Sekunden abschließen, den Server herunterfahren und anschließend neu starten
4. IF ein Benutzer ohne Administrator-Rolle Servereinstellungen abruft oder ändert, THEN THE System SHALL die Anfrage mit Status 403 ablehnen und eine Fehlermeldung zurückgeben, die auf fehlende Berechtigung hinweist
5. IF ein Administrator eine ungültige Konfiguration übermittelt (Port außerhalb 1–65535, ungültiges Log-Level, oder negativer Wert für maximale Dateigröße), THEN THE System SHALL die Änderung ablehnen, keine Werte persistieren und eine Validierungsfehlermeldung zurückgeben, die das betroffene Feld und den Grund benennt
6. IF die Konfigurationsdatei nicht geschrieben werden kann (fehlende Schreibrechte oder Speicherplatz), THEN THE System SHALL die Änderung ablehnen, die bisherige Konfiguration beibehalten und eine Fehlermeldung zurückgeben, die auf den Persistierungsfehler hinweist

### Requirement 8: Passwort-Sicherheit

**User Story:** Als Systembetreiber möchte ich, dass Passwörter sicher gespeichert werden, damit Benutzerdaten bei einem Datenleck geschützt sind.

#### Acceptance Criteria

1. THE Auth_Service SHALL Passwörter ausschließlich als kryptographische Hashes (bcrypt mit Cost-Factor ≥ 10 oder argon2id) speichern
2. THE Auth_Service SHALL Klartext-Passwörter zu keinem Zeitpunkt im Log oder in API-Antworten ausgeben
3. WHEN ein Benutzer ein neues Passwort setzt, THE Auth_Service SHALL eine Mindestlänge von 8 Zeichen und eine Maximallänge von 128 Zeichen erzwingen
4. IF ein Benutzer ein Passwort setzt, das kürzer als 8 Zeichen oder länger als 128 Zeichen ist, THEN THE Auth_Service SHALL die Änderung ablehnen und eine Fehlermeldung zurückgeben, die die zulässige Länge (8–128 Zeichen) benennt
5. IF das Hashing des Passworts fehlschlägt, THEN THE Auth_Service SHALL die Registrierung oder Passwortänderung ablehnen und eine Fehlermeldung zurückgeben, die auf einen internen Fehler hinweist, ohne technische Details preiszugeben

### Requirement 9: Login-Oberfläche

**User Story:** Als Benutzer möchte ich eine Login-Seite sehen, wenn ich nicht angemeldet bin, damit ich mich authentifizieren kann.

#### Acceptance Criteria

1. WHILE keine gültige Session besteht (kein Session-Token vorhanden oder Token vom Auth_Service als ungültig abgelehnt), THE Frontend SHALL eine Login-Seite mit einem Feld für Benutzername (maximal 128 Zeichen) und einem Feld für Passwort (maximal 256 Zeichen) anzeigen, wobei beide Felder mit sichtbaren Labels versehen sind
2. WHEN der Benutzer das Login-Formular absendet, THE Frontend SHALL prüfen, ob beide Felder nicht leer sind, und bei Bestehen der Prüfung die Anmeldedaten an den Auth_Service übermitteln und den Absende-Button bis zum Erhalt der Antwort deaktivieren
3. IF der Benutzer das Login-Formular mit mindestens einem leeren Feld absendet, THEN THE Frontend SHALL eine Validierungsmeldung am jeweiligen leeren Feld anzeigen und keine Anfrage an den Auth_Service senden
4. WHEN die Anmeldung erfolgreich ist, THE Frontend SHALL das Session-Token speichern und zur Hauptansicht navigieren, wobei das Token bei allen nachfolgenden API-Anfragen als Authentifizierungsnachweis mitgesendet wird
5. WHEN die Anmeldung fehlschlägt, THE Frontend SHALL eine generische Fehlermeldung anzeigen, die nicht unterscheidet, ob Benutzername oder Passwort falsch war
6. WHEN der Benutzer sich abmeldet, THE Frontend SHALL das gespeicherte Session-Token entfernen und zur Login-Seite navigieren
7. IF eine API-Anfrage mit einem HTTP-401-Status beantwortet wird, THEN THE Frontend SHALL das gespeicherte Session-Token entfernen und zur Login-Seite navigieren

### Requirement 10: CSRF-Schutz

**User Story:** Als Systembetreiber möchte ich Schutz gegen Cross-Site Request Forgery-Angriffe, damit authentifizierte Sessions nicht durch bösartige Websites ausgenutzt werden können.

#### Acceptance Criteria

1. THE Auth_Service SHALL bei jeder Session-Erstellung einen CSRF_Token generieren und diesen dem Client bereitstellen
2. WHEN eine zustandsändernde API-Anfrage (POST, PUT, DELETE) eingeht, THE Auth_Service SHALL prüfen, ob ein gültiger CSRF_Token in der Anfrage enthalten ist
3. IF eine zustandsändernde API-Anfrage keinen gültigen CSRF_Token enthält, THEN THE Auth_Service SHALL die Anfrage mit Status 403 ablehnen und eine Fehlermeldung zurückgeben, die auf einen fehlenden oder ungültigen CSRF_Token hinweist
4. WHEN eine neue Session erstellt wird, THE Auth_Service SHALL den CSRF_Token pro Session generieren und bei Session-Erneuerung einen neuen CSRF_Token ausstellen

### Requirement 11: Multi-Session-Management

**User Story:** Als Benutzer möchte ich das System von mehreren Geräten gleichzeitig nutzen, und als Administrator möchte ich aktive Sessions verwalten können.

#### Acceptance Criteria

1. THE Auth_Service SHALL mehrere gleichzeitige Sessions für denselben Benutzer zulassen
2. THE Auth_Service SHALL gleichzeitige Anmeldungen verschiedener Benutzer unabhängig voneinander verwalten
3. WHEN ein Benutzer seine aktiven Sessions abruft, THE Auth_Service SHALL eine Liste aller Sessions mit Geräte-/Browser-Information, letzter Aktivität und Erstellungszeitpunkt zurückgeben
4. WHEN ein Benutzer eine einzelne Session invalidiert, THE Auth_Service SHALL die angegebene Session beenden und den zugehörigen Token ungültig machen
5. WHEN ein Benutzer alle Sessions außer der aktuellen invalidiert, THE Auth_Service SHALL alle anderen Sessions des Benutzers beenden und deren Tokens ungültig machen
6. WHEN ein Administrator die Sessions eines Benutzers abruft, THE Auth_Service SHALL alle aktiven Sessions des angegebenen Benutzers mit Geräte-/Browser-Information, letzter Aktivität und Erstellungszeitpunkt zurückgeben
7. WHEN ein Administrator eine Session eines Benutzers invalidiert, THE Auth_Service SHALL die angegebene Session beenden und den zugehörigen Token ungültig machen
8. WHEN zwei Sessions gleichzeitig dieselbe Datei bearbeiten, THE Vault_Service SHALL den Konflikt über einen Versions-/ETag-Mechanismus erkennen und den zweiten Schreibvorgang mit Status 409 ablehnen und eine Fehlermeldung zurückgeben, die darauf hinweist, dass die Datei zwischenzeitlich geändert wurde

### Requirement 12: Audit-Log

**User Story:** Als Systembetreiber möchte ich sicherheitsrelevante Aktionen protokollieren, damit ich unbefugte Zugriffe oder verdächtige Aktivitäten nachvollziehen kann.

#### Acceptance Criteria

1. THE System SHALL folgende Aktionen im Audit_Log protokollieren: erfolgreiche Anmeldungen, fehlgeschlagene Anmeldeversuche, Passwortänderungen, Rollenänderungen, Benutzererstellung, Benutzerlöschung, Kontosperrungen, Vault-Freigabeänderungen und Serverkonfigurationsänderungen
2. THE System SHALL jeden Audit_Log-Eintrag mit folgenden Feldern speichern: Zeitstempel (ISO 8601), Benutzer-ID (sofern zutreffend), Aktionstyp, Ziel (betroffene Ressource), IP-Adresse und Erfolg/Fehlschlag-Status
3. THE System SHALL Audit_Log-Einträge als Append-Only-Dateien im Verzeichnis `data/audit/` persistieren
4. WHEN ein Administrator Audit-Logs über die API abruft, THE System SHALL die Einträge paginiert (maximal 100 pro Seite) und filterbar nach Aktionstyp und Datumsbereich zurückgeben
5. THE System SHALL sicherstellen, dass Audit_Log-Einträge keine sensiblen Daten enthalten (keine Passwörter, keine Token-Werte)

### Requirement 13: Account-Selbstlöschung

**User Story:** Als Benutzer möchte ich mein eigenes Konto löschen können, damit ich meine Daten aus dem System entfernen kann.

#### Acceptance Criteria

1. WHEN ein Benutzer sein eigenes Konto löschen möchte, THE User_Service SHALL die Löschung durchführen, sofern der Benutzer keine Vaults besitzt
2. IF ein Benutzer sein Konto löschen möchte und noch Vaults besitzt, THEN THE User_Service SHALL die Löschung ablehnen und eine Fehlermeldung zurückgeben, die darauf hinweist, dass alle Vaults zuerst gelöscht oder übertragen werden müssen
3. WHEN ein Benutzer die Kontolöschung anfordert, THE User_Service SHALL das aktuelle Passwort zur Bestätigung verlangen
4. IF das zur Bestätigung eingegebene Passwort nicht mit dem gespeicherten Passwort übereinstimmt, THEN THE User_Service SHALL die Kontolöschung ablehnen und eine Fehlermeldung zurückgeben, die auf falsche Anmeldedaten hinweist
5. WHEN ein Benutzerkonto gelöscht wird, THE Auth_Service SHALL alle aktiven Sessions des Benutzers sofort invalidieren
6. IF der letzte verbleibende Administrator versucht, sein eigenes Konto zu löschen, THEN THE User_Service SHALL die Löschung ablehnen und eine Fehlermeldung zurückgeben, die darauf hinweist, dass mindestens ein Administrator existieren muss

### Requirement 14: Account-Sperrung

**User Story:** Als Administrator möchte ich Benutzerkonten sperren können, ohne sie zu löschen, damit ich den Zugang temporär einschränken und gleichzeitig Daten erhalten kann.

#### Acceptance Criteria

1. WHEN ein Administrator ein Benutzerkonto sperrt, THE User_Service SHALL den Sperrstatus des Kontos setzen und alle aktiven Sessions des Benutzers sofort invalidieren
2. WHILE ein Benutzerkonto gesperrt ist, THE Auth_Service SHALL Anmeldeversuche mit Status 403 ablehnen und eine Fehlermeldung zurückgeben, die darauf hinweist, dass das Konto gesperrt ist
3. WHEN ein Administrator ein Benutzerkonto entsperrt, THE User_Service SHALL den Sperrstatus entfernen, sodass der Benutzer sich wieder anmelden kann
4. WHILE ein Benutzerkonto gesperrt ist, THE Vault_Service SHALL alle Vaults und Freigaben des gesperrten Benutzers unverändert beibehalten
5. IF ein Administrator versucht, das letzte verbleibende Administrator-Konto zu sperren, THEN THE User_Service SHALL die Sperrung ablehnen und eine Fehlermeldung zurückgeben, die darauf hinweist, dass mindestens ein aktiver Administrator existieren muss
6. WHEN ein Administrator die Benutzerliste abruft, THE User_Service SHALL den Sperrstatus jedes Benutzers als Feld in der Antwort enthalten

### Requirement 15: Vault-Löschung und Besitz-Transfer

**User Story:** Als Vault-Besitzer möchte ich klare Regeln für das Löschen geteilter Vaults, damit keine Daten unerwartet verloren gehen.

#### Acceptance Criteria

1. WHEN ein Vault-Besitzer einen Vault ohne aktive Freigaben löscht, THE Vault_Service SHALL den Vault und alle zugehörigen Daten entfernen
2. IF ein Vault-Besitzer einen Vault löschen möchte und der Vault ausschließlich „read"-Freigaben hat, THEN THE Vault_Service SHALL dem Besitzer ermöglichen, alle Freigaben zu widerrufen und anschließend den Vault zu löschen
3. IF ein Vault-Besitzer einen Vault löschen möchte und der Vault aktive „write"-Freigaben hat, THEN THE Vault_Service SHALL den Besitzer warnen und zwei Optionen anbieten: (a) alle Freigaben beenden und den Vault löschen, oder (b) den Besitz an genau einen bestimmten Benutzer übertragen
4. WHEN ein Vault-Besitzer den Besitz an einen anderen Benutzer überträgt, THE Vault_Service SHALL die Übertragung nur an genau einen Benutzer zulassen
5. WHEN ein Vault-Besitzer den Besitz überträgt, THE Vault_Service SHALL sicherstellen, dass alle Freigaben an andere Benutzer als den Übertragungsempfänger zuvor widerrufen wurden
6. WHEN der Besitz erfolgreich übertragen wurde, THE Vault_Service SHALL dem neuen Besitzer volle Kontrolle gewähren und dem bisherigen Besitzer jeglichen Zugriff entziehen
7. THE Frontend SHALL einen geführten Workflow bereitstellen, der den Vault-Besitzer durch die Schritte der Vault-Löschung oder Besitz-Übertragung leitet
