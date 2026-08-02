---
tags: [admin]
---

# Vault-Übersicht (Admin)

Die Admin-Vault-Übersicht zeigt dir alle Vaults auf der gesamten Slatebase-Instanz — unabhängig davon, wem sie gehören. Du siehst Speicherverbrauch, Besitzer und kannst bei Bedarf Vaults löschen.

---

## Vault-Übersicht öffnen

| Methode | Beschreibung |
|---------|--------------|
| Einstellungen (`Ctrl+,`) | Administration → Vault-Übersicht |
| Command Palette (`Ctrl+P`) | "Vault-Übersicht" oder "Admin Vaults" suchen |

---

## Angezeigte Informationen

Die Vault-Übersicht zeigt eine Tabelle aller Vaults:

| Spalte | Inhalt |
|--------|--------|
| Vault-Name | Name des Vaults |
| Besitzer | Benutzername des Eigentümers |
| Dateien | Anzahl der Dateien im Vault |
| Ordner | Anzahl der Verzeichnisse |
| Größe | Gesamtgröße aller Dateien |
| Erstellt | Erstellungsdatum |

---

## Vault als Admin löschen

In Ausnahmefällen kannst du als Admin einen Vault löschen, der einem anderen Nutzer gehört:

1. Finde den Vault in der Übersicht
2. Klicke auf "Löschen"
3. Bestätige durch Eintippen des Vault-Namens

### Wann ist das sinnvoll?

- Nutzer-Account wurde gelöscht, Vault blieb zurück (Fehlerfall)
- Vault verbraucht übermäßig viel Speicher
- Nutzer ist nicht erreichbar und Vault muss entfernt werden

> [!warning] Admin-Löschung ist endgültig
> Im Gegensatz zum normalen Lösch-Workflow hat der Admin keinen Export-Schritt. Stelle sicher, dass der Vault keine wichtigen Daten enthält, oder exportiere ihn vorher selbst (falls du Lesezugriff hast).

---

## Speicherverbrauch überwachen

Die Vault-Übersicht eignet sich zur Überwachung des Speicherverbrauchs:

### Sortierung nach Größe

- Klicke auf den Spaltenheader "Größe" zum Sortieren
- Die größten Vaults erscheinen oben
- So identifizierst du schnell Speicherfresser

### Typische Größenordnungen

| Vault-Typ | Typische Größe |
|-----------|---------------|
| Reiner Text (Markdown) | 1–50 MB |
| Mit eingebetteten Bildern | 50–500 MB |
| Mit PDF-Anhängen | 100 MB – 2 GB |
| Projekt-Dokumentation | 10–100 MB |

---

## Unterschied zur Nutzersicht

| Aspekt | Nutzersicht ("Meine Vaults") | Admin-Übersicht |
|--------|------------------------------|-----------------|
| Sichtbare Vaults | Nur eigene | Alle auf dem Server |
| Teilen/Übertragen | Ja | Nein (nur löschen) |
| Statistiken | Eigene Vaults | Alle Vaults |
| Zugriff auf Inhalte | Ja | Nur über Freigabe |

> [!tip] Kein Inhaltszugriff
> Als Admin siehst du die Vault-Metadaten (Name, Größe, Besitzer), aber **nicht den Inhalt**. Um Dateien in einem fremden Vault zu sehen, muss der Besitzer dir eine Freigabe erteilen. Das schützt die Privatsphäre der Nutzer.

---

## Praktisches Beispiel

Führe eine Speicher-Inventur durch:

1. Öffne die Vault-Übersicht
2. Sortiere nach Größe (absteigend)
3. Identifiziere die 3 größten Vaults
4. Prüfe, ob die Besitzer aktive Nutzer sind
5. Bei inaktiven Nutzern: Kontaktiere sie bezüglich Aufräumen

---

> [!todo] Übung
> 1. Öffne die Admin-Vault-Übersicht
> 2. Zähle die Gesamtanzahl der Vaults auf deiner Instanz
> 3. Finde den größten Vault
> 4. Prüfe, welcher Nutzer die meisten Vaults besitzt

---

## Verwandte Features

- [[Features/Vault-Verwaltung]] — Vault-Operationen aus Nutzersicht
- [[Admin/Benutzerverwaltung]] — Nutzer verwalten und ggf. löschen
- [[Admin/Server-Konfiguration]] — Speicher-Einstellungen
- [[Admin/Audit-Log]] — Vault-Löschungen nachvollziehen
