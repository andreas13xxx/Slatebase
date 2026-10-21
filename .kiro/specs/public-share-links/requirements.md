# Öffentliche Freigabe-Links — Requirements

## Kontext

Freigaben (`/vaults/:vaultId/shares`) gelten heute nur zwischen Slatebase-Nutzern. Diese Spec beschreibt **Freigabe-Links**:
Eine Notiz bekommt einen Link, den jeder ohne Konto im Browser öffnen kann.

## Entschieden

| Punkt | Entscheidung |
|---|---|
| Zugriff | **Nur lesen.** Keine Gast-Bearbeitung (kein Gast-Konto, keine Echtzeit-Zusammenarbeit für Gäste) |
| Aktualität | **Live.** Der Link zeigt immer den aktuellen Stand der Notiz, kein Snapshot |
| Umfang v1 | Einzelne Notiz samt eingebetteter Bilder/Anhänge |
| Feature-Toggle | `public-shares`, standardmäßig **aus** (wie `bases`); nur ein Admin schaltet ihn ein |

## Nicht-Ziele

- Gast-Bearbeitung, Kommentare oder Gast-Identitäten
- Snapshots / Versionsstände eines Links
- Freigabe ganzer Ordner oder Vaults (spätere Phase)
- Automatische Mitfreigabe verlinkter Notizen
- Suchmaschinen-Indexierung

## Anforderungen

### 1. Link erzeugen und verwalten

1.1 Ein Nutzer mit Schreibrecht auf den Vault kann für eine Notiz einen Link erzeugen, auflisten und widerrufen.
1.2 Der Token hat mindestens 128 Bit Zufall und ist nicht aus Vault, Pfad oder Zeit ableitbar.
1.3 Pro Notiz gibt es höchstens einen aktiven Link; erneutes Erzeugen liefert den bestehenden.
1.4 Optional: Ablaufdatum und Passwort. Beides lässt sich nachträglich ändern oder entfernen.
1.5 Widerruf wirkt sofort; der Link liefert danach 404.
1.6 „Meine Links“ in den Einstellungen listet alle eigenen Links mit Notiz, Erstellung, Ablauf, letztem Zugriff.

### 2. Öffentlicher Zugriff

2.1 `GET /api/v1/public/s/:token` liefert die Notiz ohne Login, ohne CSRF und ohne Session-Cookie-Pflicht.
2.2 Inhalt ist immer der aktuelle Dateistand. Wird die Notiz umbenannt oder verschoben, bleibt der Link gültig
    (Token folgt der Datei); wird sie gelöscht oder in den Papierkorb verschoben, liefert er 404.
2.3 Eingebettete Dateien (`![[bild.png]]`, `![](pfad)`) werden über `GET /public/s/:token/asset` ausgeliefert, nur
    wenn die Notiz sie tatsächlich einbettet. Beliebige Pfade sind nicht abrufbar.
2.4 Wikilinks auf andere Notizen erscheinen als normaler Text, ohne Link und ohne Hinweis auf deren Existenz.
2.5 Transklusionen (`![[Notiz]]`) werden nicht aufgelöst, sondern als Platzhalter dargestellt.
2.6 Ein abgelaufener oder widerrufener Link und ein nie existierender Token sind von außen nicht unterscheidbar (404).
2.7 Passwortgeschützte Links verlangen die Eingabe, bevor Inhalt oder Assets ausgeliefert werden.

### 3. Sicherheit

3.1 Alle Dateizugriffe laufen über `validateFilePath()`; Dot-Dateien (`.slatebase/`, `.obsidian/`) sind nie ausliefierbar.
3.2 Rate-Limit pro IP für die öffentlichen Routen, strenger für falsche Passwörter.
3.3 Passwörter werden nur als Hash gespeichert (scrypt, wie bei Nutzerpasswörtern).
3.4 Antworten tragen `Cache-Control: no-store`, `X-Robots-Tag: noindex` und eine restriktive CSP.
3.5 Rohes HTML wird über dieselbe Allowlist bereinigt wie in Live Preview und Reading View (`plugins/inline-html.ts`).
3.6 Frontmatter-Properties werden nicht ausgeliefert, außer dem Titel. Kein Pfad, kein Vault-Name, keine Nutzerdaten.
3.7 Erzeugen, Ändern, Widerrufen und jeder erfolgreiche oder fehlgeschlagene Zugriff gehen ins Audit-Log
    (Token nur gekürzt).
3.8 Ist das Feature ausgeschaltet, liefern alle öffentlichen Routen 404 und bestehende Links bleiben gespeichert.

### 4. Oberfläche (Deutsch)

4.1 Dialog „Teilen“ an der Notiz: Link erzeugen, kopieren, Passwort, Ablauf, widerrufen. Mit `useFocusTrap`.
4.2 Öffentliche Seite `/s/:token` außerhalb der App-Shell: nur Titel und gerenderter Inhalt, Hell/Dunkel nach
    Systemeinstellung, kein Slatebase-Menü, ohne Nutzerdaten.
4.3 Vollständige Tastaturbedienung; neue Komponenten haben einen `*.a11y.test.tsx`.

### 5. Betrieb

5.1 README („Operating Model“) nennt, welche Pfade öffentlich erreichbar sein müssen (`/s/*`, `/api/v1/public/*`).
5.2 In-Memory-Zustand (Rate-Limiter, Passwort-Sitzungen der Gäste) ist zulässig; Single-Instance.
