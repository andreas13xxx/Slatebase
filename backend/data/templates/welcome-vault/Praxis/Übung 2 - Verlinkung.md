---
tags: [praxis]
---

# Übung 2 — Verlinkung

**Schwierigkeit:** :star::star: Mittel
**Dauer:** ~10 Minuten

---

## Ziel

Du erstellst drei verknüpfte Notizen, prüfst die Backlinks im Context Panel und erkundest den Knowledge Graph.

## Voraussetzungen

- [[Übung 1 - Erste Notiz]] abgeschlossen (Ordner `Sandbox` existiert)
- Du kennst den Wechsel zwischen Edit- und View-Modus

---

## Schritte

> [!todo] Schritt 1: Erste Notiz mit Link erstellen
> 1. Erstelle eine neue Datei `Sandbox/Pflanzen.md`
> 2. Schreibe folgenden Inhalt:
>
> ```markdown
> # Pflanzen
>
> Meine Lieblingspflanzen für den Balkon:
>
> - [[Sandbox/Basilikum]] — braucht viel Sonne
> - [[Sandbox/Lavendel]] — pflegeleicht und duftet
>
> Mehr Infos zur Pflege gibt es in [[Sandbox/Garten-Tipps]].
> ```
>
> Die `[[...]]`-Syntax erstellt **Wikilinks** zu anderen Notizen.

> [!todo] Schritt 2: Verlinkte Notizen erstellen
> 1. Klicke im View-Modus auf den Link `[[Sandbox/Basilikum]]`
>    - Falls die Datei nicht existiert, erstelle sie manuell als `Sandbox/Basilikum.md`
> 2. Schreibe in `Basilikum.md`:
>
> ```markdown
> # Basilikum
>
> tags: #garten #kräuter
>
> - Standort: sonnig
> - Gießen: regelmäßig, aber keine Staunässe
> - Ernte: Blätter von oben abzupfen
>
> Siehe auch: [[Sandbox/Pflanzen]]
> ```
>
> 3. Erstelle `Sandbox/Lavendel.md`:
>
> ```markdown
> # Lavendel
>
> tags: #garten #blumen
>
> - Standort: vollsonnig
> - Gießen: sparsam (Trockenheit verträgt er gut)
> - Rückschnitt: nach der Blüte im Spätsommer
>
> Gehört zu meinen [[Sandbox/Pflanzen]].
> ```

> [!todo] Schritt 3: Backlinks prüfen
> 1. Öffne die Datei `Sandbox/Pflanzen.md`
> 2. Öffne das **Context Panel** (rechte Seitenleiste)
> 3. Wechsle zum Tab **Links**
> 4. Du siehst unter "Backlinks":
>    - `Basilikum` — verlinkt hierher
>    - `Lavendel` — verlinkt hierher

> [!todo] Schritt 4: Knowledge Graph öffnen
> 1. Öffne den Knowledge Graph:
>    - Command Palette (`Ctrl+P`) → "Graph" suchen
>    - Oder über die Sidebar
> 2. Du siehst Knoten für deine Dateien und Verbindungslinien zwischen ihnen
> 3. Ziehe an einem Knoten, um das Layout zu verändern
> 4. Klicke auf einen Knoten, um die Datei zu öffnen

> [!todo] Schritt 5: Einen toten Link finden
> Die Datei `Garten-Tipps` existiert noch nicht. Im View-Modus wird der Link `[[Sandbox/Garten-Tipps]]` als **gestrichelt unterstrichen** dargestellt (unresolved link). Das ist normal — du kannst die Datei später erstellen.

---

## Erfolgskriterien

- [ ] Drei Dateien existieren: `Pflanzen.md`, `Basilikum.md`, `Lavendel.md`
- [ ] Alle Dateien verlinken aufeinander mit `[[...]]`-Syntax
- [ ] Im Context Panel von `Pflanzen.md` erscheinen 2 Backlinks
- [ ] Der Graph zeigt die Verbindungen als Linien zwischen den Knoten
- [ ] Der Link zu `Garten-Tipps` wird als unresolved (gestrichelt) angezeigt

---

## Was du gelernt hast

- Wikilink-Syntax: `[[Dateiname]]` erstellt Verknüpfungen
- Backlinks zeigen dir, welche Notizen auf die aktuelle verweisen
- Der Knowledge Graph visualisiert dein Netzwerk
- Unresolved Links (tote Links) sind normal und werden automatisch aufgelöst, sobald die Zieldatei existiert

---

## Weiter geht's

:arrow_right: [[Übung 3 - Projekt organisieren]] — Ordner, Tags und Vorlagen nutzen
