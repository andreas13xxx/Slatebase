---
tags: [features]
---

# Statusleiste

Die Statusleiste am unteren Rand von Slatebase zeigt auf einen Blick Informationen zur aktiven Datei und zum aktuellen Vault. Jedes Element lässt sich einzeln ein- oder ausblenden.

---

## Elemente der Statusleiste

| Element | Zeigt | Interaktion |
|---------|-------|-------------|
| Uhr | Aktuelle Uhrzeit | — |
| Vault-Name | Name des geöffneten Vaults | — |
| Wort-/Zeichenanzahl | Wörter und Zeichen der aktiven Datei | Bei markiertem Text zusätzlich die Anzahl der ausgewählten Wörter/Zeichen |
| Cursor-Position | Zeile:Spalte des Cursors | Klick öffnet das "Gehe zu Zeile"-Popover |
| Plugin-Items | Anzeigen von Obsidian-Plugins | Erscheinen am rechten Rand, wenn die Plugin-Kompatibilität aktiv ist |

---

## Sichtbarkeit steuern

1. Öffne die Einstellungen (`Ctrl+,`)
2. Navigiere zu **Darstellung**
3. **Statusleiste anzeigen** — schaltet die gesamte Leiste ein oder aus
4. Darunter hat jedes Element einen eigenen Schalter — so zeigst du z. B. nur die Wortanzahl, ohne Uhr und Cursor-Position

Die Einstellung wirkt sofort ohne Neuladen der Seite.

---

## Gehe zu Zeile

Das "Gehe zu Zeile"-Popover hilft dir, schnell zu einer bestimmten Stelle in langen Dateien zu springen:

1. Klicke auf die **Cursor-Position** in der Statusleiste (z. B. `12:5`)
2. Ein Eingabefeld erscheint
3. Tippe die Zeilennummer ein und bestätige mit `Enter`
4. Der Cursor springt zur eingegebenen Zeile

> [!tip] Tastenkürzel
> Du kannst "Gehe zu Zeile" auch über die [[Features/Command Palette|Command Palette]] (`Ctrl+P`) aufrufen — suche nach "Gehe zu Zeile".

---

## Wort- und Zeichenanzahl im Detail

Die Zählung bezieht sich immer auf die **gesamte** aktive Datei:

- **Wörter** — durch Leerzeichen/Zeilenumbrüche getrennte Einheiten
- **Zeichen** — alle Zeichen inklusive Leerzeichen

Bei aktiver Textauswahl zeigt die Statusleiste zusätzlich die Auswahl-Statistik:

```
245 Wörter / 1.832 Zeichen — 12 Wörter / 87 Zeichen ausgewählt
```

---

## Plugin-Status-Items

Wenn die [[Fortgeschritten/Obsidian Plugins|Obsidian-Plugin-Kompatibilität]] aktiv ist, können Plugins eigene Anzeigen in der Statusleiste registrieren. Diese erscheinen am rechten Rand und aktualisieren sich selbstständig — z. B. zeigt das Calendar-Plugin das aktuelle Datum oder ein Sync-Plugin den Verbindungsstatus.

Plugin-Items lassen sich nicht einzeln ausblenden (nur über das Deaktivieren des jeweiligen Plugins).

---

## Praktisches Beispiel

Du schreibst einen Blog-Beitrag und willst die Wortanzahl im Blick behalten:

1. Öffne Einstellungen → Darstellung
2. Aktiviere die Statusleiste (falls ausgeblendet)
3. Deaktiviere Uhr und Vault-Name — nur Wort-/Zeichenanzahl und Cursor-Position bleiben
4. Beginne zu schreiben — die Zählung aktualisiert sich laufend
5. Markiere einen Absatz, um zu sehen, wie viele Wörter dieser enthält

---

> [!todo] Übung
> Öffne eine beliebige Datei in diesem Vault. Markiere einen Absatz und beobachte, wie die Statusleiste die Auswahl-Statistik anzeigt. Klicke dann auf die Cursor-Position und springe mit "Gehe zu Zeile" an den Anfang der Datei (Zeile 1).

---

## Verwandte Features

- [[Features/Einstellungen|Einstellungen]] — Wo du die Sichtbarkeit steuerst
- [[Features/Command Palette|Command Palette]] — "Gehe zu Zeile" und "Statusleiste ein-/ausblenden" als Befehle
- [[Fortgeschritten/Obsidian Plugins|Obsidian Plugins]] — Plugin-Status-Items
