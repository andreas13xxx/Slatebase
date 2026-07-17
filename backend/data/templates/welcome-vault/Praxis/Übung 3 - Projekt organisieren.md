---
tags: [praxis]
---

# Übung 3 — Projekt organisieren

**Schwierigkeit:** :star::star: Mittel
**Dauer:** ~15 Minuten

---

## Ziel

Du erstellst eine Projektstruktur mit Ordnern, nutzt Tags zur Kategorisierung und erstellst eine Notiz aus einer Vorlage (Template).

## Voraussetzungen

- [[Übung 1 - Erste Notiz]] und [[Übung 2 - Verlinkung]] abgeschlossen
- Du weißt, wie man Dateien und Ordner erstellt

---

## Schritte

> [!todo] Schritt 1: Projektordner anlegen
> 1. Erstelle einen neuen Ordner `Projekte` im Root des Vaults
> 2. Erstelle darin einen Unterordner `Projekte/Mein Projekt`
> 3. Deine Struktur sieht jetzt so aus:
>    ```
>    Projekte/
>    └── Mein Projekt/
>    ```

> [!todo] Schritt 2: Projektnotiz mit Tags erstellen
> 1. Erstelle `Projekte/Mein Projekt/Übersicht.md`
> 2. Schreibe folgenden Inhalt:
>
> ```markdown
> ---
> tags: [projekt, aktiv]
> ---
>
> # Mein Projekt
>
> ## Status
>
> > [!info] Projektstatus
> > **Phase:** Planung
> > **Deadline:** 2025-03-01
> > **Priorität:** Hoch
>
> ## Ziele
>
> - Dokumentation aufbauen
> - Recherche zusammenfassen
> - Meeting-Notizen sammeln
>
> ## Verknüpfte Notizen
>
> - [[Projekte/Mein Projekt/Planung]]
> - [[Projekte/Mein Projekt/Meeting 2025-01-15]]
> ```

> [!todo] Schritt 3: Vorlage nutzen (Template)
> 1. Öffne die Command Palette (`Ctrl+P`)
> 2. Suche nach "Vorlage" oder "Template"
> 3. Wähle **Neue Datei aus Vorlage**
> 4. Wähle die Vorlage **Meeting-Protokoll** aus der Liste
> 5. Gib als Dateinamen ein: `Projekte/Mein Projekt/Meeting 2025-01-15`
> 6. Die Datei wird mit vorausgefüllter Struktur erstellt
>
> Falls kein Template-Befehl verfügbar: Erstelle die Datei manuell nach [[Vorlagen/Meeting-Protokoll]].

> [!todo] Schritt 4: Meeting-Notiz ausfüllen
> Fülle die erstellte Meeting-Notiz mit Teilnehmern, Agenda und Action Items aus. Nutze Tags im Frontmatter:
> ```markdown
> ---
> tags: [meeting, projekt]
> ---
> ```
> Und vergib Aufgaben als Checkboxen (`- [ ] Name: Aufgabe`).

> [!todo] Schritt 5: Tags im Context Panel prüfen
> 1. Öffne das Context Panel (rechte Seitenleiste)
> 2. Wechsle zum Tab **Tags**
> 3. Du siehst alle Tags deines Vaults:
>    - `#projekt` — 2 Dateien
>    - `#meeting` — 1 Datei
>    - `#aktiv` — 1 Datei
> 4. Klicke auf einen Tag, um alle Dateien mit diesem Tag zu sehen

> [!todo] Schritt 6: Planungs-Notiz verlinken
> Erstelle `Projekte/Mein Projekt/Planung.md` mit einer Meilenstein-Tabelle und einem Rückverweis auf `[[Projekte/Mein Projekt/Übersicht]]`.

---

## Erfolgskriterien

- [ ] Die Ordnerstruktur `Projekte/Mein Projekt/` existiert
- [ ] Mindestens 3 Dateien im Projektordner (Übersicht, Meeting, Planung)
- [ ] Jede Datei hat `tags:` im Frontmatter
- [ ] Die Dateien verlinken aufeinander mit `[[...]]`
- [ ] Im Context Panel erscheinen die Tags `#projekt`, `#meeting` etc.

---

## Was du gelernt hast

- Projektstrukturen mit Ordnern organisieren
- Frontmatter-Tags zur Kategorisierung nutzen
- Vorlagen (Templates) für wiederkehrende Formate verwenden
- Callouts für Statusanzeigen einsetzen
- Tags im Context Panel finden und filtern

---

## Weiter geht's

:arrow_right: [[Übung 4 - Suche meistern]] — Finde Inhalte mit Suche und Regex
