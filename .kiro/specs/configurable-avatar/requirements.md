# Configurable Avatar — Requirements

## Zweck

Der Benutzer-Avatar (Profilbild in `UserMenu.tsx` und `ProfilePage.tsx`) ist heute ein
einzelnes Feld `avatarUrl` (externe http(s)-URL) mit Initialen-Fallback. Er soll auf
vier wählbare Quellen erweitert werden:

1. **Initialen** — eine einfärbbare Initialen-Kachel (Hintergrundfarbe + Text, wie Slack/GitHub).
2. **Externe URL** — das bestehende Verhalten, bleibt erhalten.
3. **DiceBear-Galerie** — eine Auswahl generierter Avatare von einem externen Dienst (DiceBear).
4. **Upload / Einfügen** — ein lokal hochgeladenes oder per Zwischenablage eingefügtes Bild,
   client-seitig auf 128×128 herunterskaliert und als Daten-URL im User-Record gespeichert.

## Nicht-Ziele

- Keine serverseitige Bildspeicherung als Datei und keine eigene Ausliefer-Route — ein kleines
  Bild wird als Daten-URL im User-Record gehalten (passt zum „keine DB, Plain Files"-Prinzip).
- Keine eingebaute Offline-Galerie (bewusste Entscheidung: externe DiceBear-Galerie).
- Keine serverseitige Bildbearbeitung/Validierung des Pixelinhalts (nur Größe/MIME/Länge).

## Anforderungen

### R1 — Avatar-Typmodell
Das User-Record erhält ein strukturiertes Avatar-Modell statt nur `avatarUrl`:
- `avatarType`: `'initials' | 'url' | 'dicebear' | 'image'` (Default `'initials'`).
- `avatarUrl`: externe http(s)-URL (nur bei `url`), bleibt wie bisher.
- `avatarColor`: Hex-Farbe `#rrggbb` für die Initialen-Kachel (nur bei `initials`).
- `avatarData`: Daten-URL (`data:image/...`) des hochskalierten/eingefügten Bildes (nur bei `image`).
- `avatarDicebear`: die gewählte DiceBear-Bild-URL (nur bei `dicebear`).

R1.1 Nur das zum aktiven Typ passende Feld wird ausgewertet; die übrigen dürfen gespeichert
bleiben (ein Wechsel zurück stellt die alte Auswahl wieder her), werden aber beim Rendern ignoriert.

R1.2 Rückwärtskompatibilität: ein bestehender User mit gesetztem `avatarUrl` und ohne `avatarType`
wird als `avatarType: 'url'` gelesen; ohne `avatarUrl` als `'initials'`.

### R2 — Initialen-Kachel
R2.1 Zeigt die ersten zwei Zeichen von `displayName` (sonst `username`), großgeschrieben.
R2.2 Hintergrundfarbe ist `avatarColor`; die Textfarbe wird aus der Hintergrundhelligkeit
automatisch auf hell oder dunkel gesetzt (WCAG-Kontrast).
R2.3 Ohne gesetzte `avatarColor` wird eine aus dem Benutzernamen abgeleitete Default-Farbe
verwendet (deterministisch, damit jeder Nutzer eine stabile Farbe hat).
R2.4 Die UI bietet eine kleine Palette vordefinierter Farben plus freie Hex-Eingabe.

### R3 — Externe URL (bestehend)
R3.1 Validierung wie bisher: max 2048 Zeichen, muss mit `http://`/`https://` beginnen, leer erlaubt.
R3.2 Das Bild wird per `<img src>` geladen (keine CSP-Änderung nötig, `imgSrc` erlaubt `https:`).

### R4 — DiceBear-Galerie
R4.1 Die UI zeigt eine Galerie vorgenerierter DiceBear-Avatare: mehrere Stile
(z.B. `identicon`, `bottts`, `avataaars`, `shapes`, `thumbs`), jeweils mehrere Varianten
über unterschiedliche `seed`-Werte.
R4.2 Jede Vorschau ist ein `<img>` mit einer DiceBear-URL (`https://api.dicebear.com/9.x/<style>/svg?seed=<seed>`);
es findet **kein** `fetch`/XHR statt (CSP `connectSrc` ist nur `'self'`), nur Bild-Ladevorgänge über `imgSrc https:`.
R4.3 Auswahl speichert die gewählte URL in `avatarDicebear` und setzt `avatarType: 'dicebear'`.
R4.4 Die DiceBear-URL wird serverseitig validiert: max 2048 Zeichen, Host muss `api.dicebear.com` sein
(exakter Hostvergleich, `https`), sonst Ablehnung. Damit ist `avatarDicebear` kein zweiter offener URL-Kanal.
R4.5 Ein Hinweis in der UI macht transparent, dass dabei ein Drittanbieter-Dienst das Bild liefert
(gleiche Offenheit wie beim Web-Embed-Opt-in).

### R5 — Upload / Einfügen
R5.1 Der Nutzer kann eine Bilddatei (PNG/JPEG/WebP/GIF) über einen Datei-Dialog wählen
oder ein Bild aus der Zwischenablage einfügen (Paste-Event).
R5.2 Das Bild wird client-seitig auf max. 128×128 (seitenverhältnis-erhaltend, zentriert)
herunterskaliert und als `image/png`- oder `image/webp`-Daten-URL erzeugt.
R5.3 Die resultierende Daten-URL darf max. 256 KB groß sein; größere werden abgelehnt
(Fehlermeldung), nicht still beschnitten.
R5.4 Gespeichert in `avatarData`, Typ `avatarType: 'image'`.
R5.5 Serverseitige Validierung: `avatarData` muss leer sein oder mit
`data:image/(png|jpeg|webp|gif);base64,` beginnen und ≤ 256 KB (dekodiert geprüft an der Zeichenlänge).

### R6 — Darstellung überall
R6.1 `UserMenu.tsx` und `ProfilePage.tsx` rendern den Avatar nach `avatarType`:
Initialen-Kachel, `<img src={avatarUrl}>`, `<img src={avatarDicebear}>` oder `<img src={avatarData}>`.
R6.2 Eine gemeinsame Avatar-Render-Komponente (`UserAvatar`) kapselt die Typ-Auswahl, damit
die beiden Stellen (und spätere wie Chat/Präsenz) nicht driften.
R6.3 Das aktive `PROFILE_UPDATED`-Event trägt die neuen Felder; andere Sitzungen desselben Users
sehen den geänderten Avatar nach dem bestehenden Profil-Refresh-Pfad.

### R7 — Sicherheit & Validierung
R7.1 Zwei Schichten wie üblich: Zod im Controller + Business-Validierung.
R7.2 `avatarData`-Größe (256 KB) und MIME-Präfix serverseitig prüfen — eine Daten-URL ist
benutzergesteuerter Inhalt und darf den User-Record nicht aufblähen.
R7.3 `avatarDicebear`-Host-Allowlist serverseitig (R4.4).
R7.4 Keine neue CSP-Regel nötig; falls ein Review das anders sieht, wird die Entscheidung
(kein `connectSrc`-Zusatz, DiceBear nur als `<img>`) dort dokumentiert.

### R8 — i18n & A11y
R8.1 Alle neuen UI-Texte über `t()` in `de.ts` und `en.ts` (Struktur identisch).
R8.2 Farbauswahl, Galerie-Kacheln und Upload-Dropzone tastatur-bedienbar; Galerie-Kacheln
als `role="radio"`/`radiogroup` oder Buttons mit `aria-pressed`; Avatar-`<img>` mit `alt`.
