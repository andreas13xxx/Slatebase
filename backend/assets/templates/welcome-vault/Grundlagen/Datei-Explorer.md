---
tags:
  - grundlagen
---

# Datei-Explorer

Der Datei-Explorer ist die linke Seitenleiste in Slatebase. Er zeigt die gesamte Ordnerstruktur deines Vaults und bietet Funktionen zum Erstellen, Umbenennen, Verschieben und Organisieren von Dateien.

![[Screenshots/datei-explorer.png]]

*Der Datei-Explorer mit Ordnerstruktur*

---

## Dateien erstellen

### Neue Datei

1. Klicke auf das **Blatt-mit-Plus**-Symbol (📄+) oben im Explorer
2. Gib einen Dateinamen ein (z.B. `Meine Notiz.md`)
3. Bestätige mit **Enter**

Die Datei wird im aktuell ausgewählten Ordner erstellt. Ohne Auswahl landet sie im Vault-Stammverzeichnis.

### Neuen Vault erstellen

1. Klicke auf das **+**-Symbol oben im Explorer
2. Gib einen Vault-Namen ein (1–128 Zeichen)
3. Bestätige mit **Enter**

Der neue Vault erscheint sofort im Datei-Explorer als eigener Abschnitt.

### Neuer Ordner

1. Klicke auf das **Ordner+**-Symbol oben im Explorer
2. Gib den Ordnernamen ein
3. Bestätige mit **Enter**

---

## Umbenennen

1. **Rechtsklick** auf die Datei oder den Ordner
2. Wähle **Umbenennen** aus dem Kontextmenü
3. Ändere den Namen und bestätige mit **Enter**
4. Abbrechen mit **Escape**

> [!tip] Tipp
> Wikilinks, die auf eine umbenannte Datei verweisen, werden automatisch aktualisiert — überall im Vault, nicht nur in der Datei, die gerade geöffnet ist. Du musst dich nicht um kaputte Links kümmern.

---

## Verschieben

### Per Drag & Drop

1. Klicke und halte eine Datei oder einen Ordner
2. Ziehe ihn an die gewünschte Position
3. Lasse über dem Zielordner los

Ein blauer Indikator zeigt dir, wohin das Element verschoben wird.

### Per Kontextmenü

1. Rechtsklick auf die Datei
2. Wähle **Verschieben nach...**
3. Wähle den Zielordner aus

### Links überleben den Umzug

Genau wie beim Umbenennen werden beim Verschieben einer Datei oder eines Ordners automatisch alle Wikilinks an anderer Stelle im Vault umgeschrieben, die auf den alten Ort verwiesen haben — auch Links, die nur den bloßen Dateinamen nutzen (z.B. `[[Pasta]]`) statt eines vollständigen Pfads, und selbst wenn ein ganzer Ordner mit vielen Dateien auf einmal verschoben wird.

#### Live-Beispiel

1. Erstelle einen Ordner `Sandbox/Rezepte` und darin eine Datei `Sandbox/Rezepte/Pasta.md`
2. Erstelle eine zweite Datei `Sandbox/Notizen.md` und schreibe `[[Pasta]]` hinein — ein bloßer Link ohne Ordnerpfad
3. Öffne `Sandbox/Notizen.md` — der Link löst sich normal zu `Sandbox/Rezepte/Pasta.md` auf
4. Verschiebe jetzt `Sandbox/Rezepte/Pasta.md` aus `Rezepte/` heraus, direkt nach `Sandbox/` (Drag & Drop oder **Verschieben nach...**)
5. Öffne `Sandbox/Notizen.md` erneut — `[[Pasta]]` löst sich weiterhin auf, jetzt zum neuen Ort, obwohl der Link nie einen Ordner erwähnt hat

---

## Kontextmenü

![[Screenshots/datei-explorer-kontextmenu.png]]

*Kontextmenü per Rechtsklick*

Ein Rechtsklick auf eine Datei oder einen Ordner öffnet das Kontextmenü mit folgenden Optionen:

| Aktion | Beschreibung |
|--------|--------------|
| Öffnen | Datei im Tab öffnen |
| Umbenennen | Namen ändern |
| Verschieben | In anderen Ordner verschieben |
| Löschen | In den Papierkorb verschieben |
| Als Favorit | Lesezeichen für diese Datei hinzufügen/entfernen |

Bei Ordnern stehen zusätzlich zur Verfügung:
- **Neue Datei hier** — Datei im gewählten Ordner erstellen
- **Neuer Unterordner** — Ordner verschachteln

---

## Favoriten

Markiere häufig genutzte Dateien als Favorit:

1. Rechtsklick auf die Datei → **Als Favorit markieren**
2. Oder klicke auf das **Stern-Symbol** neben dem Dateinamen

Favoriten erscheinen sowohl im oberen Bereich der Seitenleiste als auch in einer eigenen **Lesezeichen**-Ansicht (Tab in der linken Seitenleiste), in der du sie per Drag & Drop neu sortieren, umbenennen und per Rechtsklick verwalten kannst — mehr dazu im [[Features/Lesezeichen|Lesezeichen-Guide]].

---

## Ordnerstruktur

Ordner lassen sich auf- und zuklappen:

- **Klick auf den Pfeil** (▶) klappt einen Ordner auf
- **Erneuter Klick** klappt ihn wieder zu
- Verschachtelte Ordner können beliebig tief sein

---

## Schritt-für-Schritt: Projekt organisieren

1. Erstelle einen neuen Ordner `Mein Projekt`
2. Erstelle darin drei Dateien:
   - `Übersicht.md`
   - `Notizen.md`
   - `TODOs.md`
3. Markiere `Übersicht.md` als Favorit
4. Verschiebe eine bestehende Datei per Drag & Drop in den Ordner

---

> [!todo] Übung
> Erstelle in diesem Vault einen neuen Ordner namens `Sandbox` und lege darin eine Datei `Test.md` an. Schreibe etwas hinein, benenne sie dann um in `Mein Test.md`. Zum Schluss markiere sie als Favorit.

---

> [!tip] Best Practice
> Halte deine Ordnerstruktur flach (maximal 2–3 Ebenen). Nutze Tags und Wikilinks statt tiefer Verschachtelung, um Inhalte zu verknüpfen.

---

## Verwandte Seiten

- [[Grundlagen/Editor und Viewer|Editor und Viewer]] — Vorheriger Guide
- [[Features/Lesezeichen|Lesezeichen]] — Favoriten sortieren, umbenennen und weitere Lesezeichen-Typen
- [[Features/Tags und Properties|Tags und Properties]] — Alternative Organisation
- [[Features/Vault-Verwaltung|Vault-Verwaltung]] — Vault-übergreifende Funktionen
