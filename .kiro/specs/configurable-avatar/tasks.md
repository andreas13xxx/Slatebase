# Configurable Avatar — Tasks

Pro Phase: Review (lint/tsc/npm run build/relevante Tests/Diff) → Commit. Nach allen Phasen:
push, PR, CI grün (max. 3 Iterationen). Dokumentation nach Abschluss der Feature-Phasen.

## Phase 1 — Backend-Datenmodell & Validierung
- [x] 1.1 `UserRecord`, `PublicUserInfo`, `toPublicUserInfo()`, `UpdateProfileData` um
      `avatarType`/`avatarColor`/`avatarData`/`avatarDicebear` erweitern (`backend/src/user/index.ts`).
- [x] 1.2 `normalizeAvatarFields()` beim Laden im UserRepository (alte Records, R1.2).
- [x] 1.3 Zod-Schemas in `validation.ts` (`avatarType`, `avatarColor`, `avatarData`, `avatarDicebear`);
      `updateProfileSchema` erweitern.
- [x] 1.4 Business-`validateAvatarFields()` in `updateProfile`; Feld-Erhalt bei Typwechsel (R1.1).
- [x] 1.5 Tests: `validation.test`, `user/index.test` (Normalisierung + Feld-Erhalt).

## Phase 2 — Frontend-API & State
- [x] 2.1 `PublicUserInfo` (`state/authState.ts`) und `UpdateProfileData` (`api/index.ts`)
      um die vier Felder erweitern; `PROFILE_UPDATED`-Payload trägt sie.
- [x] 2.2 Mocks/Tests synchron halten (Login-Response, authState-Tests — siehe lessons:
      `PublicUserInfo`-Erweiterungen überall nachziehen).

## Phase 3 — Gemeinsame Avatar-Komponente
- [x] 3.1 `utils/UserAvatar`-Helfer: `getInitials`, `colorFromName`, `readableTextColor`.
- [x] 3.2 `components/UserAvatar.tsx` (Typ-Dispatch, Initialen-Kachel, `<img>`).
- [x] 3.3 `UserMenu.tsx` und `ProfilePage.tsx` auf `UserAvatar` umstellen (bisherige Zweige entfernen).
      Hinweis: ProfilePage hat heute keinen eigenen Avatar-Render-Zweig (nur das URL-Textfeld) —
      die Vorschau mit `UserAvatar` entsteht erst mit dem Editor in Phase 6. In Phase 3 wird daher
      nur `UserMenu` umgestellt; Phase 6 baut die ProfilePage-Vorschau auf `UserAvatar` auf.
- [x] 3.4 Tests: Utils-Unit-Tests + `UserAvatar`-Render.

## Phase 4 — Bild-Upload/Paste
- [x] 4.1 `utils/imageResize.ts` (Canvas-Downscale 128×128, webp/png, 256-KB-Grenze).
- [x] 4.2 Upload-Button + Dropzone + Paste-Handler im Avatar-Editor.
      Hinweis: Der Avatar-Editor-Block in ProfilePage entsteht erst in Phase 6 (6.1/6.2).
      Phase 4 liefert die reine `imageResize`-Utility + Paste-Extraktion + Tests; die
      Button/Dropzone/Paste-Verdrahtung wird in Phase 6 beim Editor-Zusammenbau eingehängt.
- [x] 4.3 Tests: `imageResize` (Downscale, Ablehnung > 256 KB).

## Phase 5 — DiceBear-Galerie
- [x] 5.1 `utils/dicebear.ts` (Builder + Stilliste, kein Netzwerkcode).
- [x] 5.2 Galerie-Grid im Avatar-Editor (Stile × seeds, Auswahl, Drittanbieter-Hinweis).
      Hinweis: Wie bei Phase 4.2 entsteht das Grid beim Editor-Zusammenbau in Phase 6; Phase 5
      liefert nur den reinen Builder (`dicebear.ts`) + Test.
- [x] 5.3 Tests: Builder-Unit-Test.

## Phase 6 — Initialen-Farbe & Editor-Zusammenbau
- [x] 6.1 Farb-Palette + Hex-Input; Typ-Umschalter (`radiogroup`) im Avatar-Editor.
- [x] 6.2 Profil-PATCH sendet `avatarType` + vier Felder; Vorschau live.
- [x] 6.3 i18n-Keys in `de.ts` und `en.ts`.
- [x] 6.4 A11y: `*.a11y.test.tsx` (radiogroup, alt, Dropzone-Button); `ProfilePage.test` erweitern.

> Phase 6 baut `components/AvatarEditor.tsx` (Vorschau via `UserAvatar`, `radiogroup`-Typumschalter,
> Initialen-Farbpalette + Hex, DiceBear-Galerie, Upload/Dropzone/Paste) und hängt sie in `ProfilePage`
> ein — damit sind die in Phase 3.3 / 4.2 / 5.2 zurückgestellten UI-Teile jetzt umgesetzt. Das alte
> reine „Avatar-URL"-Textfeld ist durch den Editor ersetzt (URL bleibt als Typ `url`).

## Phase 7 — Doku
- [x] 7.1 `structure.md` (UserAvatar, imageResize, dicebear) und ggf. `docs/` aktualisieren.
- [x] 7.2 README-Feature-Zeile zum Avatar, falls vorhanden. (README nennt den Avatar bisher nicht — keine Zeile vorhanden, nichts zu ändern.)
