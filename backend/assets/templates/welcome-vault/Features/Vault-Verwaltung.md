---
tags: [features]
---

# Vault-Verwaltung

Vaults sind die oberste Organisationseinheit in Slatebase — vergleichbar mit separaten Notizbüchern. Du kannst mehrere Vaults erstellen, sie mit anderen teilen und bei Bedarf löschen oder übertragen.

![[Screenshots/gesamtansicht.png]]

*Vault-Übersicht im Datei-Explorer*

---

## Vault erstellen

1. Öffne "Meine Vaults" (Nutzerprofil-Menü → "Meine Vaults" oder `Ctrl+P` → "Meine Vaults")
2. Klicke auf "Neuer Vault"
3. Gib einen Namen ein (1–128 Zeichen)
4. Der Vault wird sofort erstellt und erscheint im Datei-Explorer

### Namensregeln

- Max. 128 Zeichen
- Keine Sonderzeichen: `/ \ : * ? " < > |`
- Der Name muss innerhalb deiner Vaults eindeutig sein

---

## Vault löschen

Das Löschen eines Vaults ist ein mehrstufiger Vorgang, um versehentlichen Datenverlust zu verhindern:

### Lösch-Workflow

1. Öffne "Meine Vaults"
2. Klicke auf "Löschen" beim gewünschten Vault
3. **Schritt 1:** Bestätigungsdialog — erklärt was gelöscht wird
4. **Schritt 2:** Vault-Namen eintippen zur Bestätigung
5. **Schritt 3:** Endgültige Löschung

### Was wird gelöscht?

- Alle Dateien und Ordner im Vault
- Alle Freigaben an andere Nutzer
- Papierkorb-Inhalte und Versionen
- Link-Index und Vault-Konfiguration

> [!tip] Vor dem Löschen exportieren
> Exportiere den Vault als ZIP (Nutzerprofil-Menü → "Export"), bevor du ihn löschst. So hast du ein Backup, falls du die Daten später doch noch brauchst.

---

## Vault teilen (Freigaben)

Du kannst Vaults mit anderen Slatebase-Nutzern teilen — entweder als Lese- oder Schreibzugriff.

### Freigabe erstellen

1. Öffne "Meine Vaults"
2. Klicke auf "Teilen" beim gewünschten Vault
3. Suche den Nutzer, mit dem du teilen möchtest
4. Wähle die Berechtigung:
   - **Lesen** — Nutzer kann Dateien ansehen, aber nicht ändern
   - **Schreiben** — Nutzer kann Dateien erstellen, bearbeiten und löschen

### Freigabe widerrufen

1. Öffne "Meine Vaults" → Vault auswählen
2. In der Freigabe-Liste: Klicke auf "Entfernen" neben dem Nutzernamen
3. Der Zugriff wird sofort entzogen

### Einschränkungen

- Nur der Vault-Besitzer kann Freigaben verwalten
- Geteilte Nutzer können keine weiteren Freigaben erteilen
- Vault-Konfiguration (Templates-Verzeichnis etc.) bleibt dem Besitzer vorbehalten

---

## Besitz übertragen

Du kannst einen Vault an einen anderen Nutzer übertragen:

### Workflow

1. Öffne "Meine Vaults" → Vault auswählen
2. Klicke auf "Besitz übertragen"
3. Wähle den neuen Besitzer
4. Bestätige die Übertragung

### Voraussetzungen

- **Alle Freigaben müssen vorher widerrufen werden** — der Transfer startet mit einem "sauberen" Vault
- Der neue Besitzer erhält vollen Zugriff
- Du verlierst den Zugriff (es sei denn, der neue Besitzer teilt mit dir)

---

## Statistiken

Jeder Vault zeigt Statistiken, die dir einen Überblick über den Inhalt geben:

### Statistiken abrufen

- **Explorer-Tooltip:** Fahre mit der Maus über den Vault-Namen im Datei-Explorer — ein Tooltip zeigt die Kurzstatistik
- **Meine Vaults:** Die Vault-Übersicht zeigt grundlegende Kennzahlen

### Verfügbare Kennzahlen

| Metrik | Beschreibung |
|--------|--------------|
| Dateien | Gesamtzahl aller Dateien |
| Ordner | Gesamtzahl aller Verzeichnisse |
| Größe | Gesamtgröße aller Dateien |

---

## Praktisches Beispiel

Teste die Vault-Verwaltung mit einem temporären Vault:

1. Erstelle einen neuen Vault namens "Test-Vault"
2. Erstelle einige Dateien darin
3. Prüfe die Statistiken (Tooltip im Explorer)
4. Falls andere Nutzer vorhanden: Teile den Vault mit Leserecht
5. Lösche den Test-Vault über den Lösch-Workflow (tippe den Namen ein)

---

> [!tip] Ein Vault pro Kontext
> Organisiere deine Vaults nach Lebensbereichen oder Projekten:
> - "Arbeit" — Berufliche Notizen, Meetings, Projekte
> - "Persönlich" — Private Notizen, Tagebuch, Ideen
> - "Studium" — Vorlesungen, Zusammenfassungen, Recherche
>
> So kannst du gezielt teilen (z.B. "Arbeit" mit dem Team) ohne private Notizen preiszugeben.

> [!todo] Übung
> 1. Erstelle einen neuen Vault über "Meine Vaults"
> 2. Erstelle mindestens eine Datei darin
> 3. Prüfe die Statistiken im Explorer-Tooltip
> 4. Lösche den Test-Vault wieder (Lösch-Workflow durchlaufen)

---

## Verwandte Features

- [[Grundlagen/Datei-Explorer]] — Vault-Inhalte im Explorer verwalten
- [[Features/Einstellungen]] — Vault-Konfiguration (Templates, Daily Notes)
- [[Features/Sync]] — Vault mit externem Server synchronisieren
- [[Features/Chat]] — Kommunikation mit geteilten Nutzern
