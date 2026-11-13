---
tags: [features]
---

# Links zu Notizen

Mit einem **Link** verweist du von außen auf eine Notiz in Slatebase — in einer Mail, einem Chat, einem Lesezeichen deines Browsers oder einer anderen Anwendung. Ein Klick öffnet die Notiz direkt, auf Wunsch an einer bestimmten Überschrift.

> [!info] Ein Link ist eine Adresse, kein Zugang
> Wer den Link öffnet, muss angemeldet sein und Zugriff auf den Vault haben. Für Leser ohne Konto gibt es [[Features/Öffentliche Links]].

---

## Link kopieren

- **Befehl:** Öffne die Command Palette (`Strg+P`) und führe **Link zur aktuellen Datei kopieren** aus.
- **Tab-Menü:** Rechtsklick auf den Tab → **Link kopieren**.
- **Datei-Explorer:** Rechtsklick auf eine Datei → **Link kopieren** (auch mit reinem Leserecht).

Ist gerade keine Datei offen (zum Beispiel der Graph), zeigt der Link auf den Vault. Kann der Browser nicht in die Zwischenablage schreiben, blendet Slatebase den Link zum Abschreiben ein.

---

## So sieht ein Link aus

```
https://dein-server/open?vault=<Vault-ID>&file=Ordner%2FNotiz.md
```

Mit Anker springt Slatebase zusätzlich zu einer Überschrift oder einem Block:

| Ziel | Wert von `file` (URL-kodiert) |
|------|-------------------------------|
| Überschrift | `Notiz.md#Meine Überschrift` |
| Block | `Notiz.md#^block-id` |

Statt der Vault-ID akzeptiert Slatebase auch den **Vault-Namen**, solange er eindeutig ist.

---

## Was beim Öffnen passiert

1. Bist du nicht angemeldet, meldest du dich zuerst an — der Link bleibt dabei erhalten (zehn Minuten lang).
2. Slatebase wählt den Vault, öffnet die Notiz als Tab und springt zum Anker.
3. Passt etwas nicht, erscheint immer dieselbe Meldung: *Ziel nicht gefunden oder kein Zugriff*. Der Link verrät bewusst nicht, ob ein Vault oder eine Datei existiert.

---

## Übung

> [!example] Probier es aus
> 1. Öffne eine beliebige Notiz und kopiere ihren Link.
> 2. Öffne einen neuen Browser-Tab und füge den Link ein.
> 3. Die Notiz öffnet sich — melde dich vorher ab, um den Weg über die Anmeldung zu testen.
