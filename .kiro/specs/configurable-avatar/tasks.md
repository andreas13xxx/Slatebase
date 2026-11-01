# Configurable Avatar — Tasks

Pro Phase: Review (lint/tsc/npm run build/relevante Tests/Diff) → Commit. Nach allen Phasen:
push, PR, CI grün (max. 3 Iterationen). Dokumentation nach Abschluss der Feature-Phasen.

## Phase 1 — Backend-Datenmodell & Validierung
- [ ] 1.1 `UserRecord`, `PublicUserInfo`, `toPublicUserInfo()`, `UpdateProfileData` um
      `avatarType`/`avatarColor`/`avatarData`/`avatarDicebear` erweitern (`backend/src/user/index.ts`).
- [ ] 1.2 `normalizeAvatarFields()` beim Laden im UserRepository (alte Records, R1.2).
- [ ] 1.3 Zod-Schemas in `validation.ts` (`avatarType`, `avatarColor`, `avatarData`, `avatarDicebear`);
      `updateProfileSchema` erweitern.
- [ ] 1.4 Business-`validateAvatarFields()` in `updateProfile`; Feld-Erhalt bei Typwechsel (R1.1).
- [ ] 1.5 Tests: `validation.test`, `user/index.test` (Normalisierung + Feld-Erhalt).

## Phase 2 — Frontend-API & State
- [ ] 2.1 `PublicUserInfo` (`state/authState.ts`) und `UpdateProfileData` (`api/index.ts`)
      um die vier Felder erweitern; `PROFILE_UPDATED`-Payload trägt sie.
- [ ] 2.2 Mocks/Tests synchron halten (Login-Response, authState-Tests — siehe lessons:
      `PublicUserInfo`-Erweiterungen überall nachziehen).

## Phase 3 — Gemeinsame Avatar-Komponente
- [ ] 3.1 `utils/UserAvatar`-Helfer: `getInitials`, `colorFromName`, `readableTextColor`.
- [ ] 3.2 `components/UserAvatar.tsx` (Typ-Dispatch, Initialen-Kachel, `<img>`).
- [ ] 3.3 `UserMenu.tsx` und `ProfilePage.tsx` auf `UserAvatar` umstellen (bisherige Zweige entfernen).
      Hinweis: ProfilePage hat heute keinen eigenen Avatar-Render-Zweig (nur das URL-Textfeld) —
      die Vorschau mit `UserAvatar` entsteht erst mit dem Editor in Phase 6. In Phase 3 wird daher
      nur `UserMenu` umgestellt; Phase 6 baut die ProfilePage-Vorschau auf `UserAvatar` auf.
- [ ] 3.4 Tests: Utils-Unit-Tests + `UserAvatar`-Render.

## Phase 4 — Bild-Upload/Paste
- [ ] 4.1 `utils/imageResize.ts` (Canvas-Downscale 128×128, webp/png, 256-KB-Grenze).
- [ ] 4.2 Upload-Button + Dropzone + Paste-Handler im Avatar-Editor.
- [ ] 4.3 Tests: `imageResize` (Downscale, Ablehnung > 256 KB).

## Phase 5 — DiceBear-Galerie
- [ ] 5.1 `utils/dicebear.ts` (Builder + Stilliste, kein Netzwerkcode).
- [ ] 5.2 Galerie-Grid im Avatar-Editor (Stile × seeds, Auswahl, Drittanbieter-Hinweis).
- [ ] 5.3 Tests: Builder-Unit-Test.

## Phase 6 — Initialen-Farbe & Editor-Zusammenbau
- [ ] 6.1 Farb-Palette + Hex-Input; Typ-Umschalter (`radiogroup`) im Avatar-Editor.
- [ ] 6.2 Profil-PATCH sendet `avatarType` + vier Felder; Vorschau live.
- [ ] 6.3 i18n-Keys in `de.ts` und `en.ts`.
- [ ] 6.4 A11y: `*.a11y.test.tsx` (radiogroup, alt, Dropzone-Button); `ProfilePage.test` erweitern.

## Phase 7 — Doku
- [ ] 7.1 `structure.md` (UserAvatar, imageResize, dicebear) und ggf. `docs/` aktualisieren.
- [ ] 7.2 README-Feature-Zeile zum Avatar, falls vorhanden.
