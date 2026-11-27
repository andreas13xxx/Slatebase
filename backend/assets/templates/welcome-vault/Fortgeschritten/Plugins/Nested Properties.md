---
tags: [fortgeschritten, plugins]
---

# Nested Properties Plugin

Nested Properties (von mnaoumov) zeigt verschachtelte Frontmatter-Werte im Eigenschaften-Editor als aufklappbare Gruppen — Objekte in Objekten, Listen mit gemischten Einträgen — und macht sie dort bearbeitbar. Der eingebaute Eigenschaften-Editor von Obsidian kann verschachtelte Objekte nicht selbst darstellen; genau diese Lücke füllt das Plugin.

> [!example] Live-Beispiele in diesem Vault
> Drei Notizen mit echtem verschachteltem Frontmatter zum direkten Ausprobieren:
> - [[Fortgeschritten/Plugins/Beispiel-Adresse (Nested Properties)]] — Adresse mit Unterobjekt `geo` (`latitude`/`longitude`)
> - [[Fortgeschritten/Plugins/Beispiel-Projekt (Nested Properties)]] — Projekt mit mehreren Ebenen von Unterobjekten
> - [[Fortgeschritten/Plugins/Beispiel-Gemischte-Liste (Nested Properties)]] — Liste mit Text, Zahl, Wahrheitswert und Objekten

> [!warning] Experimentell
> Die Plugin-Kompatibilität in Slatebase ist experimentell. Der Admin muss das Feature `obsidian-plugin-compat` aktivieren (Admin → Feature-Toggles, siehe [[Admin/Feature-Toggles]]), sonst gibt es keine Plugin-Verwaltung.

---

## Voraussetzungen

- Feature-Toggle `obsidian-plugin-compat` aktiviert
- Nested-Properties-Plugin installiert und aktiviert

---

## Installation

1. **Plugin-Verwaltung** → Tab **"Verfügbare Plugins"** öffnen und nach "Nested Properties" suchen
2. **Installieren** klicken, dann den **Aktivierungs-Schalter** einschalten
3. Eine der Beispielnotizen oben öffnen und die Eigenschaften ansehen

Nicht gelistet, oder ein bestimmter Fork/eine bestimmte Version nötig? Stattdessen die Plugin-ZIP von GitHub herunterladen und unter **"Installierte Plugins" → Plugin hochladen** verwenden.

---

## Was du ohne das Plugin siehst

Verschachtelte Werte (ein Objekt, oder eine Liste mit mehr als nur Text) zeigt der Eigenschaften-Editor auch ohne das Plugin an, und zwar als kleines YAML-Feld ("Verschachtelter Wert (YAML)"). Du bearbeitest den Wert dort als YAML-Text; ungültiges YAML wird als solches gemeldet. Mit dem Plugin ersetzt eine Gruppen-Darstellung dieses Feld.

---

## Bedienung im Eigenschaften-Editor

Der Eigenschaften-Editor erscheint in der Seitenleiste (Reiter **Eigenschaften**), in Live Preview als Eigenschaften-Block oben in der Notiz und in der Hover-Vorschau.

- **Gruppen auf-/zuklappen** — Verschachtelte Werte erscheinen als Gruppe mit einem Pfeil. Ein Klick darauf klappt die Gruppe auf oder zu; der Pfeil zeigt wie in Obsidian nach unten, wenn die Gruppe offen ist.
- **Typ per Icon ändern** — Ein Klick auf das Icon vor dem Namen einer Eigenschaft öffnet das Typ-Menü (Text, Zahl, Datum usw.). Das gilt für Eigenschaften der obersten Ebene.
- **Eigenschaft hinzufügen** — Unten im Editor über **Eigenschaft hinzufügen**. Innerhalb einer Gruppe bringt das Plugin eigene Schaltflächen zum Hinzufügen von Einträgen mit.
- **Werte ändern** — Ein Wert wird übernommen, wenn du das Feld verlässt oder Enter drückst. Slatebase schreibt das Frontmatter dabei verlustfrei zurück, einschließlich verschachtelter Objekte und gemischter Listen.

> [!info] Typen
> Welche Typen das Menü anbietet, siehst du direkt im Menü; die Zuordnung eines Typs zu einem Schlüssel gilt für den ganzen Vault ([[Features/Tags und Properties]]).

---

## Lese- und Bearbeitungsansicht

| Ansicht | Verhalten |
|---------|-----------|
| Quelltext / Live Preview, Seitenleiste | Bearbeitbar, sofern du Schreibrechte im Vault hast |
| Lese-Ansicht | Nur Anzeige — Gruppen lassen sich auf- und zuklappen, aber nichts ändern, hinzufügen, löschen oder umtypen |
| Hover-Vorschau | Bearbeitbar mit Schreibrechten, sonst nur Anzeige |

Die Lese-Ansicht zeichnet die Werte mit demselben Plugin-Widget wie der Editor, nur eingefroren: Eingabefelder sind gesperrt, Schaltflächen ausgeblendet.

---

## Einschränkungen

- Meldet das Plugin etwas, was es in Slatebase nicht tun kann, steht das in der Browser-Konsole (F12).
- Nicht geprüft und deshalb hier nicht beschrieben: Verhalten verschachtelter Schlüssel in Bases-Abfragen und in der Eigenschaften-Übersicht.

---

> [!todo] Übung
> 1. Installiere und aktiviere das Nested-Properties-Plugin
> 2. Öffne [[Fortgeschritten/Plugins/Beispiel-Adresse (Nested Properties)]] und klappe die Gruppe `adresse` und darin `geo` auf
> 3. Ändere die `latitude` und verlasse das Feld — prüfe im Quelltext-Modus, dass nur diese Zeile im Frontmatter geändert wurde
> 4. Wechsle in die Lese-Ansicht und prüfe, dass sich die Werte nicht mehr ändern lassen
> 5. Öffne [[Fortgeschritten/Plugins/Beispiel-Gemischte-Liste (Nested Properties)]] und sieh dir die Liste mit gemischten Einträgen an

---

## Verwandte Features

- [[Fortgeschritten/Obsidian Plugins]] — Plugin-Grundlagen
- [[Features/Tags und Properties]] — Eigenschaften und ihre Typen
- [[Fortgeschritten/Plugins/Outliner]] — Ein weiteres Plugin für verschachtelte Strukturen (Listen)
