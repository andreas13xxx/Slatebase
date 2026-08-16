---
tags: [features]
---

# CSS-Snippets

Mit CSS-Snippets passt du das Erscheinungsbild von Slatebase mit eigenem CSS an — pro Vault gespeichert, ohne dafür ein ganzes Theme oder ein Plugin zu brauchen.

---

## CSS-Snippets verwalten

1. Öffne die Einstellungen (`Ctrl+,`)
2. Navigiere zu **Darstellung**
3. Der Abschnitt **CSS-Snippets** zeigt alle Snippets des aktuellen Vaults

![[Screenshots/settings-panel.png]]

*Das Einstellungs-Panel — CSS-Snippets finden sich im Abschnitt „Darstellung"*

---

## Ein Snippet hochladen

1. Klicke auf **Hochladen**
2. Wähle eine bestehende `.css`-Datei aus (maximal 512 KB)
3. Das Snippet erscheint in der Liste — zunächst deaktiviert

## Ein neues Snippet erstellen

1. Klicke auf **Neu erstellen**
2. Vergib einen Namen (die Endung `.css` wird automatisch ergänzt)
3. Ein eingebetteter Editor öffnet sich — schreibe dein CSS direkt hinein
4. Klicke auf **Speichern**

---

## Aktivieren und Bearbeiten

- **Aktivieren/Deaktivieren:** Schalter neben jedem Snippet — die Änderung wirkt sofort, ohne die Seite neu zu laden
- **Bearbeiten:** Stift-Symbol öffnet den eingebetteten Editor erneut
- **Löschen:** Papierkorb-Symbol, mit Bestätigungsabfrage

Aktivierte Snippets werden automatisch angewendet, sobald du den Vault öffnest oder zu ihm wechselst.

---

## Was CSS-Snippets von Plugin-CSS unterscheidet

Falls du die [[Fortgeschritten/Obsidian Plugins|Obsidian-Plugin-Kompatibilität]] nutzt: Plugin-eigenes CSS wirkt ausschließlich auf die Oberfläche des jeweiligen Plugins. CSS-Snippets sind anders gedacht — sie wirken **global** auf die gesamte Slatebase-Oberfläche, genau wie ein CSS-Snippet in Obsidian selbst. Regeln wie `body { }` oder `:root { --variable: wert; }` sind hier ausdrücklich erwünscht.

---

## Praktisches Beispiel

Passe die Akzentfarbe der Oberfläche an:

1. Öffne Einstellungen → Darstellung → CSS-Snippets → **Neu erstellen**
2. Nenne das Snippet `akzentfarbe`
3. Schreibe in den Editor:
   ```css
   :root {
     --accent: #ff6b6b;
   }
   ```
4. Speichere und aktiviere das Snippet über den Schalter
5. Die Akzentfarbe der Oberfläche ändert sich sofort

> [!tip] Variablennamen finden
> Slatebase nutzt CSS Custom Properties für Design Tokens. Öffne die Browser-Entwicklertools (`F12`), inspiziere ein Element und schau in den `:root`-Regeln nach, welche Variable du überschreiben möchtest.

---

> [!todo] Übung
> Erstelle ein Snippet, das die Schriftgröße der Seitenleiste vergrößert (`.file-explorer { font-size: 14px; }`). Aktiviere es, prüfe das Ergebnis, und deaktiviere es anschließend wieder.

---

## Verwandte Features

- [[Features/Einstellungen|Einstellungen]] — Wo du CSS-Snippets findest
- [[Fortgeschritten/Obsidian Plugins|Obsidian-Plugin-Kompatibilität]] — Plugin-CSS im Vergleich
