# Öffentliche Freigabe-Links — Requirements

## Kontext

Freigaben (`/vaults/:vaultId/shares`) gelten heute nur zwischen Slatebase-Nutzern. Diese Spec beschreibt **Freigabe-Links**:
Eine Notiz bekommt einen Link, den jeder ohne Konto im Browser öffnen kann.

## Entschieden

| Punkt | Entscheidung |
|---|---|
| Zugriff | **Nur lesen.** Keine Gast-Bearbeitung (kein Gast-Konto, keine Echtzeit-Zusammenarbeit für Gäste) |
| Aktualität | **Live.** Der Link zeigt immer den aktuellen Stand der Notiz, kein Snapshot |
| Umfang v1 | Einzelne Notiz; **alle Einbettungen** (Notizen, Bilder, Medien) fest eingebunden, Bases/Canvas nicht |
| Einbettungsfehler | sichtbarer Hinweis an der Stelle, kein stilles Weglassen |
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
2.3 **Einbettungen werden immer fest in die Leseansicht eingebunden**, damit die geteilte Notiz aussieht wie im Editor:
    Notizen (`![[Notiz]]`, `![[Notiz#Abschnitt]]`, `![[Notiz#^block]]`), Bilder, PDFs, Audio und Video. Die Auflösung
    geschieht serverseitig bei jedem Abruf (Live-Stand); das Frontend rendert mit der vorhandenen Reading-View-Pipeline.
2.3a Eingebettete Dateien werden über `GET /public/s/:token/asset` ausgeliefert, nur wenn die Notiz oder eine
    eingebettete Notiz sie tatsächlich einbettet (transitive Allowlist). Beliebige Pfade sind nicht abrufbar.
2.4 Wikilinks (`[[Notiz]]`) und Markdown-Links auf andere Notizen erscheinen als normaler Text, ohne Link und ohne
    Hinweis auf deren Existenz. Nur Einbettungen werden aufgelöst, bloße Verweise nie.
2.5 Grenzen der Auflösung: höchstens 3 Ebenen, Zyklen werden erkannt, das Gesamtergebnis hat ein Größenlimit.
2.5a **Nicht aufgelöst** werden Bases (`.base`), Canvas (`.canvas`), Abfrage- und Plugin-Blöcke, weil sie Daten aus dem
    übrigen Vault ziehen würden.
2.5b **Nicht auflösbare Einbettungen** (gelöscht, nicht lesbar, zu tief, Zyklus, zu groß, nicht unterstützter Typ)
    erscheinen als sichtbarer Hinweis an der Stelle der Einbettung (z. B. „Eingebetteter Inhalt nicht verfügbar“),
    wie im Editor. Der Hinweis nennt keinen Pfad und keinen Grund, der Rückschlüsse auf den Vault erlaubt.
2.6 Ein abgelaufener oder widerrufener Link und ein nie existierender Token sind von außen nicht unterscheidbar (404).
2.7 Passwortgeschützte Links verlangen die Eingabe, bevor Inhalt oder Assets ausgeliefert werden.

### 3. Sicherheit

3.1 Alle Dateizugriffe laufen über `validateFilePath()`; Dot-Dateien (`.slatebase/`, `.obsidian/`) sind nie ausliefierbar.
3.2 Rate-Limit pro IP für die öffentlichen Routen, strenger für falsche Passwörter.
3.3 Passwörter werden nur als Hash gespeichert (scrypt, wie bei Nutzerpasswörtern).
3.4 Antworten tragen `Cache-Control: no-store`, `X-Robots-Tag: noindex` und eine restriktive CSP.
3.5 Rohes HTML wird über dieselbe Allowlist bereinigt wie in Live Preview und Reading View (`plugins/inline-html.ts`).
3.6 Frontmatter-Properties werden nicht ausgeliefert, auch nicht die eingebetteter Notizen, außer dem Titel der
    freigegebenen Notiz. Kein Pfad, kein Vault-Name, keine Nutzerdaten.
3.6a Dot-Dateien und -Ordner (`.slatebase/`, `.obsidian/`) sind auch als Einbettung nie auflösbar.
3.7 Erzeugen, Ändern, Widerrufen und jeder erfolgreiche oder fehlgeschlagene Zugriff gehen ins Audit-Log
    (Token nur gekürzt).
3.8 Ist das Feature ausgeschaltet, liefern alle öffentlichen Routen 404 und bestehende Links bleiben gespeichert.

### 4. Oberfläche (Deutsch)

4.1 Dialog „Teilen“ an der Notiz: Link erzeugen, kopieren, Passwort, Ablauf, widerrufen. Mit `useFocusTrap`.
4.1a Der Dialog zeigt vor dem Teilen, was der Link zusätzlich enthält („Eingebettet: Preisliste, Logo.png, …“), samt
    Hinweisen auf nicht auflösbare Einbettungen und dem Satz „Der Link zeigt immer den aktuellen Stand“.
4.2 Öffentliche Seite `/s/:token` außerhalb der App-Shell: nur Titel und gerenderter Inhalt, Hell/Dunkel nach
    Systemeinstellung, kein Slatebase-Menü, ohne Nutzerdaten.
4.3 Vollständige Tastaturbedienung; neue Komponenten haben einen `*.a11y.test.tsx`.

### 5. Betrieb

5.1 README („Operating Model“) nennt, welche Pfade öffentlich erreichbar sein müssen (`/s/*`, `/api/v1/public/*`).
5.2 In-Memory-Zustand (Rate-Limiter, Passwort-Sitzungen der Gäste) ist zulässig; Single-Instance.
