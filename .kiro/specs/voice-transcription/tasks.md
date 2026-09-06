# Implementation Plan: Voice Transcription (Diktieren)

## Overview

Natives Diktier-Feature mit self-hosted Whisper: Frontend nimmt via `MediaRecorder` auf, Backend reicht das Audio an ein betreiber-konfiguriertes Whisper-Backend weiter und gibt Text zurück, Editor fügt ihn am Cursor ein. Optional Audio als Vault-Anhang + Embed, mehrsprachig. Feature-getoggelt (kalt, default aus), admin-abschaltbar, mit Serveranforderungs-Warnung. Kein Compat-Plugin — Begründung/Vorlagen in `PLUGIN-COMPAT.md`.

Reihenfolge: Backend zuerst vollständig (Tasks 1–5), dann Frontend (6–9), dann Verdrahtung/Doku (10–11).

## Tasks

- [x] 1. Backend-Datenmodell, Konfiguration, Validierung
  - [x] 1.1 Erstelle `backend/src/transcription/types.ts`, `errors.ts`, `validation.ts` (Request-/Result-/Config-Typen, `SUPPORTED_TRANSCRIPTION_LANGUAGES`, Fehlerklassen) + Barrel `index.ts`
  - [x] 1.2 Erstelle `backend/src/transcription/config.ts` (`loadTranscriptionConfig()`: Backend-URL env-only, Timeout/Max-Audiogröße/Sprachliste aus neuer `transcription`-Sektion in `config/index.ts` + Env-Overrides; `getTranscriptionConfig()` in `IConfigService` ergänzt)
  - [x] 1.3 Erstelle `backend/src/transcription/config.test.ts` (15 Tests: backendUrl env-only/leer/nicht-URL, timeout/maxAudio env↔config, MB→Bytes, Sprachliste)
  - _Requirements: 2.4, 4.3, 5.2_
  - _Verifiziert: `npx tsc --noEmit` clean; betroffene Tests grün (config/mcp/transcription 52, plus 7 Mock-betroffene Dateien 140). Hinweis: `node_modules` war beim Start veraltet (zod v3 statt v4, `undici` fehlte) → `npm ci` ausgeführt._
  - _Mit-angepasst (IConfigService-Mocks um `getTranscriptionConfig`/`transcription`): `mcp/config.test.ts`, `integration.test.ts`, `import/index.test.ts`, `business/index.test.ts`, `business/vault-deletion.test.ts`, `cleanup/cleanup-job.test.ts`, `api/adminRoutes.test.ts`, `api/welcomeVaultRoutes.test.ts`_

- [x] 2. Whisper-Client
  - [x] 2.1 `backend/src/transcription/whisper-client.ts` (`WhisperClient`: multipart `audio_file`-POST + optionales `language`-Feld, `AbortSignal.timeout`, Fehler-Mapping timeout→`TranscriptionTimeoutError`/sonst→`TranscriptionBackendUnavailableError`, lenientes `text`/`language`/`detected_language`-Parsing). `IWhisperClient` in `types.ts`.
  - [x] 2.2 `whisper-client.test.ts` — 11 Tests grün (fetch via `vi.stubGlobal`)
  - _Requirements: 4.2, 4.4_

- [x] 3. Transcription-Service
  - [x] 3.1 `backend/src/transcription/transcription-service.ts` (`isConfigured()`, `getSupportedLanguages()`, `transcribe()` mit Größen-Check + lazy Client via `WhisperClientFactory`, kein Persistieren)
  - [x] 3.2 `transcription-service.test.ts` — 12 Tests grün
  - _Requirements: 2.3, 4.1, 4.2, 4.5_

- [x] 4. REST-API
  - [x] 4.1 `backend/src/api/transcriptionRoutes.ts` (`POST /vaults/:vaultId/transcribe`, multipart `audio` + `language`/`saveAudio`, Antwort `{ text, detectedLanguage? }`, `'auto'`→undefined)
  - [x] 4.2 `checkWriteAccess` + `SlidingWindowRateLimiter` pro userId; Feature-Guard als Middleware im Composition Root (Task 5); Fehler-Mapping 503/413/504/502/500
  - [x] 4.3 `transcriptionRoutes.test.ts` — 14 Tests grün (403 kein Schreibrecht, 503 ohne Backend, 429 Rate-Limit, 413/504/502/500, 200 Happy-Path)
  - _Requirements: 4.1, 4.3, 4.4, 5.4, 5.5, 7.1_

- [x] 5. Backend-Verdrahtung
  - [x] 5.1 Feature-Toggle `voice-transcription` registriert (`defaultEnabled: false`, `type: 'cold'`), Feature-Guard-Middleware auf `/vaults/:vaultId/transcribe`
  - [x] 5.2 Config/WhisperClient-Factory/Service instanziiert, Route gemountet, Barrel `transcription/index.ts`; Startup-`warn`, wenn Toggle an aber Backend-URL fehlt
  - _Requirements: 5.1, 5.2_

- [x] 6. Checkpoint — Backend `npx tsc --noEmit` clean; `npm run test:coverage` Schwellen gehalten (62.5/52/69.4/63.2 ≥ 58/47/65/59), `transcription/` ~98%. (2 Full-Suite-Fehler `chat-integration`/`secret-store` = Windows/Last-Flakiness, isoliert grün.)

- [x] 7. Frontend: Aufnahme + Client
  - [x] 7.1 `frontend/src/editor/dictation/dictation-recorder.ts` (`MediaRecorder`-Wrapper, `pickSupportedMimeType`, `getUserMedia`-Fehler → `DictationRecorderError` mit `reason`)
  - [x] 7.2 `IApiClient.transcribe(vaultId, Blob, { language })` + `TranscriptionResult`/`TranscribeOptions` in `api/index.ts`
  - [x] 7.3 `MediaRecorder`-Mock in `test-setup.ts`; `dictation-recorder.test.ts` — 9 Tests grün
  - _Requirements: 1.2, 1.5, 3.4_

- [x] 8. Frontend: Controller + Editor-Integration
  - [x] 8.1 `frontend/src/editor/dictation/dictation-controller.ts` (Modul-Singleton, State-Machine idle/recording/processing/error, `view.dispatch`-Insert; optional Anhang via `getVaultConfig` + `uploadFiles` → `![[…]]`)
  - [x] 8.2 Command `voice:toggle-dictation` in `CommandPaletteContainer.tsx` (gated `isEnabled('voice-transcription')` + `hasWriteAccess`; Start blockt ohne aktiven Editor via Controller)
  - [x] 8.3 `frontend/src/hooks/useTranscriptionLanguage.ts` (über `vaultSettingsStore`, non-React-Getter für den Command)
  - [x] 8.4 `dictation-controller.test.ts` — 13 Tests grün (Insert, Anhang-Pfad, Anhang-Fehler behält Transkript, Fehlerpfad ohne Insert)
  - _Requirements: 1.1, 1.3, 1.4, 2.1, 2.2, 3.1, 3.2, 3.3, 7.2_

- [x] 9. Frontend: Indikator-UI + a11y
  - [x] 9.1 `DictationIndicator.tsx` + `.css` (Sprachauswahl, „Audio speichern"-Toggle, Verarbeitungszeit-Hinweis, `role="status"`/`aria-live`, Fehler `role="alert"`); in `App.tsx` gemountet (gated)
  - [x] 9.2 `DictationIndicator.a11y.test.tsx` — 4 Tests axe-clean (idle/recording/processing/error)
  - _Requirements: 1.5, 2.1, 6.2, 7.2, 7.3_

- [x] 10. Warnhinweise + Serverkonfig-Sichtbarkeit
  - [x] 10.1 `FeatureTogglesSection` zeigt `FEATURE_WARNINGS['voice-transcription']` (Rechenintensiv/GPU/Backend-URL, `role="note"`)
  - [x] 10.2 Diktier-UI nur gerendert wenn Feature an; „Backend nicht konfiguriert" (503) wird als Fehlerhinweis im Indikator angezeigt, nicht roh durchgereicht
  - _Requirements: 5.3, 6.1, 6.2_

- [x] 11. Doku + Deployment
  - [x] 11.1 `docker-compose.yml`: auskommentierter `onerahmet/openai-whisper-asr-webservice`-Service + GPU-`deploy.resources`-Block; `SLATEBASE_TRANSCRIPTION_*`-Env in `backend/.env.example`
  - [x] 11.2 `product.md` (Feature + Feature-Toggle-Liste), `structure.md` (backend `transcription/`, frontend `editor/dictation/`, Hook, Indicator); `implementation-plan.md` Prio 10 ergänzt
  - [x] 11.3 `PLUGIN-COMPAT.md`-Abschnitt vorhanden + Querverweis geprüft
  - _Requirements: 6.1, 6.3_

- [x] 12. Checkpoint — Frontend `npx eslint . --quiet` 0 Errors (Fix `no-useless-assignment`), `npm run build` exit 0, `npm run test:coverage` Schwellen gehalten (52.4/44.6/48.6/54.1 ≥ 46/38/43/48), `editor/dictation` ~93%. Keine neuen i18n-Keys (direkte deutsche Strings, konsistent mit git-sync/mail-import/CSS-Snippet-Sections). (3 Full-Suite-Fehler in `plugins/compat/*` = 5s-Timeout-Flakiness unter Last, isoliert 49/49 grün.)

## Notes

- Whisper-Backend ist NICHT Teil des Slatebase-Images — Betreiber stellt es bereit, URL per Env. Ohne konfigurierte URL bleibt das Feature funktional aus, auch bei aktivem Toggle.
- Kein Reuse des `/api/v1/proxy`-Pfades (dessen 30 s/10 MB-Limits + SSRF-Schutz passen nicht; Whisper-Ziel ist eine vertrauenswürdige, konfigurierte Server-URL).
- Audio wird server-seitig nie persistiert; nur der optionale Vault-Anhang läuft über den bestehenden `/upload`-Pfad.
- Kein PBT — Unit-/Integrationstests mit konkreten Edge Cases, passend zur Projektkonvention.
