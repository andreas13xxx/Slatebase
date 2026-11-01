# Configurable Avatar — Design

## Datenmodell

Neue Felder auf `UserRecord`, `PublicUserInfo` (und `toPublicUserInfo()`), `UpdateProfileData`
in `backend/src/user/index.ts` sowie `PublicUserInfo` in `frontend/src/state/authState.ts`
und `UpdateProfileData` in `frontend/src/api/index.ts`:

```ts
avatarType: 'initials' | 'url' | 'dicebear' | 'image'
avatarUrl: string        // bestehend; nur bei 'url'
avatarColor: string      // '' oder '#rrggbb'; nur bei 'initials'
avatarData: string       // '' oder 'data:image/...;base64,...'; nur bei 'image'
avatarDicebear: string   // '' oder 'https://api.dicebear.com/...'; nur bei 'dicebear'
```

`exactOptionalPropertyTypes` ist im Backend an: optionale Felder in `UpdateProfileData` als
`field?: T | undefined` deklarieren (wie bei `FavoriteEntry`, siehe lessons-learned).

### Migration / Defaults (R1.2)
Beim Lesen eines alten Records ohne `avatarType`:
- `avatarUrl` nicht leer → `avatarType = 'url'`
- sonst → `avatarType = 'initials'`
Umgesetzt im UserRepository-Leser (eine `normalizeAvatarFields(record)`-Hilfsfunktion beim Laden),
nicht als Einmal-Migration auf Platte — die Felder bekommen ihren Default erst beim nächsten Save.
Fehlende `avatarColor`/`avatarData`/`avatarDicebear` → `''`.

## Backend

### Validierung (`backend/src/user/validation.ts`)
- `avatarTypeSchema = z.enum(['initials','url','dicebear','image'])`
- `avatarColorSchema`: `''` oder `/^#[0-9a-fA-F]{6}$/`
- `avatarDicebearSchema`: `''` oder (max 2048, `new URL()` parst, `protocol === 'https:'`,
  `hostname === 'api.dicebear.com'`)
- `avatarDataSchema`: `''` oder (`/^data:image\/(png|jpeg|webp|gif);base64,/`, Gesamtlänge
  ≤ 358_000 Zeichen ≈ 256 KB Rohbytes bei base64-Overhead 4/3)
- `updateProfileSchema` um `avatarType`, `avatarColor`, `avatarData`, `avatarDicebear`
  (alle `.optional()`) erweitern; `avatarUrlSchema` bleibt.

### Business-Validierung (`backend/src/user/index.ts`, `updateProfile`)
Zweite Schicht: dieselben vier Prüfungen als `validateAvatarFields()`, wirft die bestehenden
Validierungs-Fehlerklassen. Beim Setzen von `avatarType` werden die zum Typ passenden Felder
übernommen; nicht passende Felder bleiben unverändert erhalten (R1.1).

### Route
Keine neue Route — `PUT /users/me` (bestehender Profil-Update-Pfad) trägt die neuen Felder.
`createUserSchema` bleibt unverändert (Avatar wird nur im Profil gesetzt, nicht beim Anlegen).

## Frontend

### Gemeinsame Render-Komponente `UserAvatar` (`frontend/src/components/UserAvatar.tsx`)
Props: `{ user: PublicUserInfo; size?: number; className?: string }`.
Logik:
- `'image'` & `avatarData` → `<img src={avatarData}>`
- `'dicebear'` & `avatarDicebear` → `<img src={avatarDicebear}>`
- `'url'` & `avatarUrl` → `<img src={avatarUrl}>`
- sonst → Initialen-Kachel: `backgroundColor = avatarColor || colorFromName(username)`,
  Textfarbe aus `readableTextColor(bg)` (Luminanz-Schwelle).
Reine Helfer (`colorFromName`, `readableTextColor`, `getInitials`) in `UserAvatar.ts`-Utils,
unit-getestet ohne DOM. `UserMenu.tsx` und `ProfilePage.tsx` nutzen diese Komponente statt
ihrer eigenen Initialen/`<img>`-Zweige.

### Bild-Downscaling (`frontend/src/utils/imageResize.ts`)
`resizeImageToDataUrl(file: Blob, max = 128): Promise<string>` — lädt in ein `<canvas>`,
zeichnet seitenverhältnis-erhaltend zentriert in max×max, exportiert `toDataURL('image/webp', 0.9)`
mit PNG-Fallback, lehnt ab wenn Ergebnis > 256 KB. Paste: `ClipboardEvent.clipboardData.items`
nach `type.startsWith('image/')` filtern → `getAsFile()` → selber Pfad.

### Avatar-Editor in `ProfilePage.tsx`
Neuer Block oben in der Profil-Sektion ersetzt das reine URL-Feld:
1. Vorschau (`UserAvatar`, groß).
2. Typ-Umschalter (4 Optionen, `radiogroup`).
3. Je nach Typ:
   - Initialen: Farb-Palette (vordefiniert) + Hex-Input.
   - URL: bestehendes URL-Feld.
   - DiceBear: Galerie-Grid aus `<img>`-Kacheln (Stile × seeds, Seeds aus `username` + Index
     abgeleitet, damit stabil); Klick wählt aus. Drittanbieter-Hinweis.
   - Bild: Datei-Dialog-Button + Dropzone + Paste-Hinweis; zeigt Fehler bei > 256 KB.
Der Profil-`PATCH` sendet `avatarType` plus die vier Feldwerte (unveränderte bleiben erhalten).

### DiceBear-URL-Bau (`frontend/src/utils/dicebear.ts`)
Reiner Builder `dicebearUrl(style, seed)` → `https://api.dicebear.com/9.x/${style}/svg?seed=${encodeURIComponent(seed)}`.
Feste Stilliste als Konstante. Kein Netzwerkcode — nur Strings; das Laden macht `<img>`.

## Sicherheit
- CSP unverändert: `imgSrc` erlaubt bereits `https:` und `data:`; `connectSrc 'self'` bleibt,
  weil kein `fetch` zu DiceBear erfolgt (nur `<img>`).
- `avatarData`-Größe und MIME serverseitig geprüft (R7.2); `avatarDicebear`-Host-Allowlist (R7.3).

## Tests
- Backend: `validation.test` für die vier neuen Schemas (gültig/ungültig, Grenzlängen,
  fremder DiceBear-Host, zu große Daten-URL); `user/index.test` für `normalizeAvatarFields`
  (alte Records) und Feld-Erhalt bei Typwechsel.
- Frontend: `UserAvatar`-Utils (`colorFromName` deterministisch, `readableTextColor`-Schwelle,
  `getInitials`); `imageResize` (Downscale-Grenze, >256 KB-Ablehnung — jsdom-Canvas ggf. mocken);
  `dicebear`-Builder; `ProfilePage.test` um Typwechsel + Galerie-Auswahl + Upload erweitern.
- A11y: `UserAvatar`/Avatar-Editor `*.a11y.test.tsx` (radiogroup, alt-Text, Dropzone-Button).
