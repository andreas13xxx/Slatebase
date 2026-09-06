# Design Document: Voice Transcription (Diktieren)

## Overview

Native Diktier-/Spracherkennungsfunktion mit self-hosted Whisper. Das Frontend nimmt Mikrofon-Audio via `MediaRecorder` auf und lädt es an einen neuen Backend-Endpunkt; das Backend reicht das Audio an ein vom Betreiber konfiguriertes **Transcription_Backend** (whisper.cpp/faster-whisper über HTTP) weiter und gibt den Text zurück; der Editor fügt ihn an der Cursorposition ein. Optional wird die Aufnahme als Vault-Anhang gespeichert und als Audio-Embed verlinkt.

Bewusst gewählt statt eines Compat-Plugins (Begründung + Vorlagen: `PLUGIN-COMPAT.md`, Abschnitt „Diktier-/Spracherkennungs-Plugins → native Lösung statt Compat-Layer").

**Kernprinzipien:**
- Audio verlässt den eigenen Server nie — kein externer Dienst, keine API-Gebühren.
- Rechenintensiv → feature-getoggelt (kalt), admin-abschaltbar, nur aktiv mit konfiguriertem Backend; sichtbare Serveranforderungs-Warnung.
- Aufnahme im Browser braucht keine Compat-Schicht: `navigator.mediaDevices` ist ohnehin verfügbar, setzt aber HTTPS voraus.
- Wiederverwenden statt neu bauen: Upload-/`createBinary`-Pfad für Anhänge, `vaultSettingsStore` für Sprach-/Optionsgedächtnis, `SlidingWindowRateLimiter` fürs Rate-Limit, `createFeatureGuard` fürs Toggle, Audio-Embed-Rendering ist bereits vorhanden.

## Architecture

### Neue Dateien — Backend

| Pfad | Verantwortung |
|------|---------------|
| `backend/src/transcription/index.ts` | Barrel-Export |
| `backend/src/transcription/types.ts` | `ITranscriptionService`, `TranscriptionRequest`, `TranscriptionResult`, `TranscriptionConfig`, `SUPPORTED_TRANSCRIPTION_LANGUAGES` |
| `backend/src/transcription/config.ts` | `loadTranscriptionConfig()` — Backend-URL, Timeout, Max-Audiogröße, Sprachliste aus Env/Server-Config |
| `backend/src/transcription/errors.ts` | `TranscriptionBackendUnavailableError`, `TranscriptionNotConfiguredError`, `AudioTooLargeError`, `TranscriptionTimeoutError` |
| `backend/src/transcription/validation.ts` | Zod-Schemas für Sprach-/Formatparameter des Requests |
| `backend/src/transcription/whisper-client.ts` | `WhisperClient` — HTTP-Wrapper um das Transcription_Backend (Audio-POST, Timeout, Fehler-Mapping) |
| `backend/src/transcription/transcription-service.ts` | `TranscriptionService implements ITranscriptionService` — orchestriert Validierung → WhisperClient → Ergebnis; persistiert Audio NICHT |
| `backend/src/api/transcriptionRoutes.ts` | `POST /vaults/:vaultId/transcribe` (multipart), Feature-Guard, `checkWriteAccess`, Rate-Limit |

### Neue/geänderte Dateien — Frontend

| Pfad | Verantwortung |
|------|---------------|
| `frontend/src/editor/dictation/dictation-recorder.ts` | `MediaRecorder`-Wrapper: Start/Stop, Blob-Erzeugung, `getUserMedia`-Fehlerbehandlung, gewähltes Audioformat |
| `frontend/src/editor/dictation/dictation-controller.ts` | Orchestriert Aufnahme → Upload an `apiClient.transcribe()` → Text-Insert am Cursor (`EditorShim`/CM6-Dispatch), optional Audio-Anhang + Embed |
| `frontend/src/components/DictationIndicator.tsx` | Aufnahme-/Verarbeitungs-Overlay (Sprachauswahl, „Audio speichern"-Toggle, `role="status"`/`aria-live`, Verarbeitungszeit-Hinweis) |
| `frontend/src/components/DictationIndicator.css` | Styles (Design Tokens) |
| `frontend/src/hooks/useTranscriptionLanguage.ts` | Sprach- + „Audio speichern"-Präferenz, dünner Wrapper über `vaultSettingsStore` (per Nutzer+Vault, analog `useSpellcheck.ts`) |
| `frontend/src/api/index.ts` (erweitert) | `IApiClient.transcribe(vaultId, audioBlob, opts)` |
| `frontend/src/components/CommandPaletteContainer.tsx` (erweitert) | Command `voice:toggle-dictation` (braucht `commandRegistry`, gehört daher hierher — siehe App.tsx-Hinweis in lessons-learned) |

### Datenfluss

```
Editor: Command "Diktat starten"
        │
        ▼
DictationRecorder.start()  ── getUserMedia ──▶ MediaRecorder (audio/webm)
        │  (Stop)
        ▼
Blob ──▶ apiClient.transcribe(vaultId, blob, { language, saveAudio })
        │
        ▼   POST /api/v1/vaults/:vaultId/transcribe  (Feature-Guard, checkWriteAccess, Rate-Limit)
TranscriptionService.transcribe()
        │
        ▼   WhisperClient.transcribe(audio, language)   ── HTTP ──▶ self-hosted Whisper
        │◀── { text, detectedLanguage? }
        ▼
Response { text, detectedLanguage? }
        │
        ├─▶ Text am Cursor einfügen (CM6 dispatch)
        └─▶ (optional) Blob via /upload in Attachments-Ordner  ──▶ ![[audio.webm]] am Cursor
```

Audio wird server-seitig nur *durchgereicht*, nie gespeichert. Der einzige persistierte Artefakt-Pfad ist der optionale Vault-Anhang, der über den bestehenden Upload-Endpunkt läuft (nicht über den Transkriptions-Endpunkt).

## Components and Interfaces

```typescript
// backend/src/transcription/types.ts
export interface TranscriptionRequest {
  audio: Buffer
  contentType: string
  /** Whisper-Sprachcode ('de', 'en', …) oder undefined für Auto-Erkennung */
  language?: string | undefined
}

export interface TranscriptionResult {
  text: string
  /** Vom Backend erkannte Sprache, falls Auto-Erkennung lief */
  detectedLanguage?: string | undefined
}

export interface TranscriptionConfig {
  /** Basis-URL des self-hosted Whisper-Backends; leer/undefined = nicht konfiguriert */
  backendUrl: string | undefined
  timeoutMs: number
  maxAudioBytes: number
  supportedLanguages: string[]
}

export interface ITranscriptionService {
  isConfigured(): boolean
  transcribe(req: TranscriptionRequest): Promise<TranscriptionResult>
}
```

```typescript
// backend/src/transcription/whisper-client.ts
export interface IWhisperClient {
  transcribe(audio: Buffer, contentType: string, language?: string): Promise<TranscriptionResult>
}
```

```typescript
// frontend/src/editor/dictation/dictation-recorder.ts
export interface DictationRecorderResult {
  blob: Blob
  contentType: string
}
export interface IDictationRecorder {
  start(): Promise<void>
  stop(): Promise<DictationRecorderResult>
  isRecording(): boolean
}
```

### Whisper-Backend-Anbindung

- Erwartet ein HTTP-Endpoint, der Audio (multipart oder raw body) + optionalen Sprachparameter entgegennimmt und JSON mit dem Text zurückgibt. Kompatibel gehalten zu gängigen self-hosted Setups (whisper.cpp-Server, faster-whisper hinter einer kleinen HTTP-Hülle, `openai/whisper`-kompatible lokale Server). Das genaue Request-/Response-Mapping kapselt `WhisperClient`, damit ein anderes Backend nur diese eine Datei berührt.
- Konfiguration: `SLATEBASE_TRANSCRIPTION_BACKEND_URL` (Pflicht, sonst Feature inaktiv), `SLATEBASE_TRANSCRIPTION_TIMEOUT_MS` (Default z. B. 120000 — Whisper ist langsam), `SLATEBASE_TRANSCRIPTION_MAX_AUDIO_MB`.
- Kein Reuse des `/api/v1/proxy`-Pfades: Der ist für plugin-initiierte Cross-Origin-Requests mit SSRF-Schutz + 30 s / 10 MB gedacht; Whisper braucht längere Timeouts und größere Bodies, und der Aufruf ist server-intern (vertrauenswürdige, konfigurierte URL), kein nutzergesteuertes Ziel.

### Audioformat & Einfügen

- Aufnahme als `audio/webm;codecs=opus` (breite Browser-Unterstützung, kompakt), Fallback auf das erste vom Browser via `MediaRecorder.isTypeSupported()` unterstützte Format.
- Text-Insert über den aktiven CM6-`EditorView` (`view.dispatch` mit Insert an der Selektion) — derselbe Mechanismus wie andere `editor:*`-Kommandos; korrekt für Undo-History.
- Optionaler Anhang: Blob → `/upload` mit `targetDir` = Attachments-Verzeichnis des Vaults (aus `vault-config`), eindeutiger Dateiname; danach `![[<name>]]`-Embed am Cursor (das Audio-Embed-Rendering existiert bereits, siehe `plugins/embed/`).

## Data Models

Keine neue Dauer-Persistenz im Vault oder in `data/` durch den Transkriptions-Pfad selbst (Audio wird nicht gespeichert). Persistierte Artefakte:

```
(optional) data/vaults/<vaultId>/<attachmentsDir>/<name>.webm   → nur wenn "Audio speichern" gewählt (über /upload)
```

Nutzerpräferenzen (Sprache, „Audio speichern") liegen in `vaultSettingsStore` (per Nutzer+Vault), also in `data/users/<userId>-preferences.json` → `vaultSettings[vaultId]` — kein neues Schema, ein zusätzliches opakes Feld im vom Client verwalteten Blob.

Server-Konfiguration: über bestehende Config-Präzedenz (`config/default.json` < `server-config.json` < `SLATEBASE_*`-Env). Feature-Toggle `voice-transcription` über den bestehenden `FeatureToggleStore` (`features.json`).

## Error Handling

| Fehlerfall | HTTP-Status | Code | Behandlung |
|------------|-------------|------|------------|
| Feature-Toggle aus | 403 | `FEATURE_DISABLED` | `createFeatureGuard('voice-transcription', ...)` |
| Backend nicht konfiguriert | 503 | `TRANSCRIPTION_NOT_CONFIGURED` | klare Meldung; UI blendet Diktat aus |
| Whisper-Backend nicht erreichbar | 502 | `TRANSCRIPTION_BACKEND_UNAVAILABLE` | generische Meldung an Client, Detail nur im Server-Log |
| Timeout | 504 | `TRANSCRIPTION_TIMEOUT` | Hinweis „Aufnahme evtl. zu lang / Server ausgelastet" |
| Audio zu groß | 413 | `AUDIO_TOO_LARGE` | Limit nennen |
| Kein Schreibrecht | 403 | `ACCESS_DENIED` | `checkWriteAccess` |
| Rate-Limit erreicht | 429 | `RATE_LIMITED` | `SlidingWindowRateLimiter` pro userId |
| Mikrofon verweigert / kein HTTPS (Frontend) | — | — | Toast/`role="alert"` im `DictationIndicator`, kein Request |

## Security & Privacy

- Audio ausschließlich an die konfigurierte, betreiber-eigene Backend-URL — nie an Dritte.
- Transkriptions-Endpunkt: Session-Auth + CSRF + `checkWriteAccess` + eigenes Rate-Limit pro userId (Konvention `quality.md`: jeder session-geschützte, ressourcenintensive Endpunkt braucht eigenes Limit).
- Kein Persistieren des Roh-Audios server-seitig; nur der bewusst gewählte Vault-Anhang.
- `MediaRecorder`/`getUserMedia` verlangen einen sicheren Kontext (HTTPS); im Nicht-HTTPS-Fall klarer Hinweis statt stillem Scheitern.

## Testing Strategy

- **`whisper-client.test.ts`** (Unit, `fetch` gemockt): Erfolgs-Mapping, Timeout, nicht-erreichbares Backend, Fehler-Response-Mapping.
- **`transcription-service.test.ts`** (Unit, `IWhisperClient` gemockt): `isConfigured()`-Logik (URL gesetzt/leer), Sprach-Durchreichung inkl. Auto-Erkennung, Max-Audiogröße, Fehler-Propagierung.
- **`transcriptionRoutes.test.ts`** (Integration): Feature-Guard (403 bei aus), 503 ohne Backend, `checkWriteAccess` (403 ohne Recht), Rate-Limit (429), 413 bei zu großem Audio, Happy-Path-200 mit gemocktem Service.
- **`config.test.ts`**: Env-Overlay, Default-Werte, „nicht konfiguriert" bei fehlender URL.
- **`dictation-recorder.test.ts`** (Frontend, `MediaRecorder`/`getUserMedia` gemockt — beide fehlen in jsdom, Mock in `test-setup.ts` ergänzen): Start/Stop-Zustand, Formatwahl, `getUserMedia`-Verweigerung → Fehler.
- **`dictation-controller.test.ts`** (Frontend, `apiClient.transcribe` gemockt): Text-Insert am Cursor, „Audio speichern"-Pfad ruft Upload + fügt Embed ein, Fehlerpfad fügt keinen Text ein.
- **`DictationIndicator.a11y.test.tsx`**: axe-clean, `role="status"`/`aria-live` für Zustände, `role="alert"` für Fehler.

## Deployment / Betrieb

- Das Whisper-Backend ist **nicht** Teil des Slatebase-Images — der Betreiber stellt es bereit (eigener Container/Dienst) und trägt die URL per Env ein. `docker-compose` bekommt einen dokumentierten, auskommentierten Beispiel-Service (whisper.cpp/faster-whisper) samt GPU-Hinweis.
- README/Steering: Serveranforderung (GPU empfohlen, auf kleinem VPS langsam), Feature standardmäßig aus, Admin-Abschaltbarkeit.
