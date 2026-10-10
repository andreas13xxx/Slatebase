---
tags: [features]
---

# Geteilte Ansichten (Split Panes)

Mit geteilten Ansichten arbeitest du an mehreren Notizen gleichzeitig nebeneinander. Du teilst den Editor-Bereich in zwei oder mehr **Panes** — jeder Pane hat seine eigene Tab-Leiste und zeigt eine andere Notiz. So vergleichst du zwei Dokumente, hast eine Referenz offen, während du in einer anderen schreibst, oder behältst eine Übersicht neben dem Detail.

Stell es dir wie geteilte Fenster in einem Editor vor: ein Arbeitsbereich, mehrere Blickwinkel.

---

## Einen Pane teilen

Du teilst immer den **aktiven** Pane (den, in dem du zuletzt geklickt hast):

- **Über die [[Features/Command Palette|Command Palette]]** (`Ctrl+P`): **„Rechts teilen"** legt den neuen Pane daneben (nebeneinander), **„Unten teilen"** darunter (gestapelt). Beide zeigen zunächst dieselbe Notiz — wie in Obsidian.
- **Per Tab-Ziehen:** Zieh einen Tab an den **Rand** eines Panes (oben, unten, links, rechts). Eine Drop-Zone leuchtet auf; lässt du dort los, entsteht ein neuer Pane in der passenden Richtung und der Tab wandert hinein.

Ein neu erzeugter Pane wird automatisch der aktive.

---

## Tabs zwischen Panes bewegen

Jeder Pane hat seine **eigene Datei-Tab-Leiste**:

- **In einen anderen Pane ziehen:** Zieh einen Tab auf die Tab-Leiste eines anderen Panes — er wandert dorthin.
- **Innerhalb desselben Panes:** Ziehen sortiert die Tabs nur um (wie gewohnt).

Die Settings-/Seiten-Tabs (Profil, Admin usw.) bleiben in der app-weiten Leiste oben — sie gehören nicht in einen Editor-Pane.

---

## Größe anpassen

Zwischen zwei Panes sitzt ein **Trenngriff**. Zieh ihn mit der Maus, um das Verhältnis zu ändern. Der Griff ist auch per Tastatur bedienbar (fokussieren mit `Tab`, dann Pfeiltasten) — barrierefrei, mit angekündigtem Wert.

Ein Pane kann eine Mindestgröße nicht unterschreiten, damit kein Pane auf null schrumpft.

---

## Panes schließen

- Schließe den **letzten Tab** eines Panes, und der Pane verschwindet; die anderen rücken nach.
- Der **letzte verbleibende Pane** bleibt immer bestehen (notfalls leer) — es gibt immer mindestens einen Arbeitsbereich.

---

## Layout bleibt erhalten

Dein Split-Layout wird pro Vault gespeichert: Struktur, Größen, offene Tabs und der aktive Pane. Nach einem **Neuladen** der Seite ist dein Layout wieder da (der Inhalt der Tabs wird frisch geladen). Wechselst du den Vault und zurück, findest du das jeweils eigene Layout vor.

> [!note] Von Einzel-Tabs zu Panes
> Ein vor diesem Feature gespeicherter Arbeitsbereich (eine einzelne Tab-Reihe) wird beim ersten Laden automatisch in einen einzelnen Pane übernommen — du verlierst keine offenen Tabs.

---

## Plugins

Obsidian-Plugins, die „in einem Split öffnen" anbieten (`createLeafBySplit`, `splitActiveLeaf`, „Open to the right"), erzeugen jetzt einen echten Pane statt nur eines neuen Tabs. Das View des Plugins landet im neuen Pane.

---

## Tipp

> [!tip] Vergleichen leicht gemacht
> Öffne zwei Versionen oder zwei verwandte Notizen nebeneinander: eine Notiz öffnen, **„Rechts teilen"** ausführen, dann im neuen Pane über den [[Features/Command Palette|Schnellwechsler]] (`Ctrl+O`) die zweite Notiz öffnen. Jetzt siehst du beide gleichzeitig.

---

## Übung

1. Öffne eine beliebige Notiz.
2. Führe über die Command Palette **„Rechts teilen"** aus — der Editor zeigt jetzt zwei Panes nebeneinander.
3. Öffne im rechten Pane eine zweite Notiz (`Ctrl+O`).
4. Zieh den Trenngriff in der Mitte, um die Panes unterschiedlich breit zu machen.
5. Lade die Seite neu — dein geteiltes Layout ist wieder da.

---

## Verwandte Features

- [[Features/Command Palette|Command Palette]] — die Split-Befehle und der Schnellwechsler
- [[Features/Lesezeichen|Lesezeichen]] — häufig gebrauchte Notizen schnell in einen Pane holen
- [[Features/Live Preview Editor|Live Preview Editor]] — jeder Pane hat seinen eigenen Editor-Modus
