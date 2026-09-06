/**
 * DictationController — orchestrates a dictation session:
 *   record (MediaRecorder) → transcribe (backend) → insert text at the cursor,
 *   and optionally save the recording as a vault attachment with an embed.
 *
 * A module-level singleton with a subscribable state machine, so a status
 * component (`DictationIndicator`) and the `voice:toggle-dictation` command
 * share one source of truth (same pattern as `dailyNoteService`). The command
 * calls `toggle()`; the indicator renders `getState()`.
 *
 * Text is inserted into the active CM6 editor via `view.dispatch` — the same
 * mechanism the `editor:*` commands use, so undo history stays correct.
 */
import type { IApiClient } from '../../api'
import { getActiveEditorView } from '../plugin-extensions'
import { DictationRecorder, DictationRecorderError, type IDictationRecorder } from './dictation-recorder'

/** State of the dictation session. */
export type DictationStatus = 'idle' | 'recording' | 'processing' | 'error'

export interface DictationState {
  status: DictationStatus
  /** Human-facing error message when `status === 'error'`, else null. */
  error: string | null
}

/** Context the controller needs, refreshed from React on each toggle. */
export interface DictationContext {
  apiClient: IApiClient
  vaultId: string
  /** Whisper language code or 'auto'. */
  language: string
  /** Whether to also store the recording as a vault attachment + embed. */
  saveAudio: boolean
}

const AUDIO_EXTENSION_BY_TYPE: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
}

/** Maps a recording content type to a file extension for the attachment. */
export function extensionForContentType(contentType: string): string {
  const base = contentType.split(';')[0]?.trim() ?? ''
  return AUDIO_EXTENSION_BY_TYPE[base] ?? 'webm'
}

/** Builds the `paste-…`-style attachment filename for a recording. */
export function dictationAttachmentName(now: Date, contentType: string): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  const stamp = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`
  return `dictation-${stamp}.${extensionForContentType(contentType)}`
}

export class DictationController {
  private state: DictationState = { status: 'idle', error: null }
  private readonly recorder: IDictationRecorder
  private readonly subscribers = new Set<() => void>()

  constructor(recorder: IDictationRecorder = new DictationRecorder()) {
    this.recorder = recorder
  }

  getState(): DictationState {
    return this.state
  }

  subscribe(cb: () => void): () => void {
    this.subscribers.add(cb)
    return () => { this.subscribers.delete(cb) }
  }

  private setState(next: DictationState): void {
    this.state = next
    for (const cb of this.subscribers) cb()
  }

  /**
   * Toggles a dictation session: starts recording if idle, otherwise stops and
   * transcribes. In the `error` state a toggle starts fresh.
   */
  async toggle(ctx: DictationContext): Promise<void> {
    if (this.state.status === 'recording') {
      await this.finish(ctx)
      return
    }
    if (this.state.status === 'processing') return
    await this.begin()
  }

  private async begin(): Promise<void> {
    // Require a live editor to insert into — refuse rather than record into nothing.
    if (!getActiveEditorView()) {
      this.setState({ status: 'error', error: 'Open a note in the editor before dictating.' })
      return
    }
    try {
      await this.recorder.start()
      this.setState({ status: 'recording', error: null })
    } catch (err) {
      this.setState({ status: 'error', error: messageForError(err) })
    }
  }

  private async finish(ctx: DictationContext): Promise<void> {
    this.setState({ status: 'processing', error: null })
    let blob: Blob
    let contentType: string
    try {
      const rec = await this.recorder.stop()
      blob = rec.blob
      contentType = rec.contentType
    } catch (err) {
      this.setState({ status: 'error', error: messageForError(err) })
      return
    }

    try {
      const language = ctx.language && ctx.language !== 'auto' ? ctx.language : undefined
      const result = await ctx.apiClient.transcribe(ctx.vaultId, blob, language ? { language } : {})

      let embed: string | null = null
      if (ctx.saveAudio) {
        // Best-effort: a failed attachment save must not lose the transcript.
        embed = await this.saveAttachment(ctx, blob, contentType).catch(() => null)
      }

      insertIntoEditor(result.text, embed)
      this.setState({ status: 'idle', error: null })
    } catch (err) {
      this.setState({ status: 'error', error: messageForError(err) })
    }
  }

  /** Uploads the recording to the vault's attachments dir; returns an embed string. */
  private async saveAttachment(ctx: DictationContext, blob: Blob, contentType: string): Promise<string | null> {
    let attachmentsDir: string
    try {
      attachmentsDir = (await ctx.apiClient.getVaultConfig(ctx.vaultId)).attachmentsDirectory
    } catch {
      attachmentsDir = ''
    }
    const name = dictationAttachmentName(new Date(), contentType)
    const file = new File([blob], name, { type: contentType })
    const { uploaded } = await ctx.apiClient.uploadFiles(ctx.vaultId, [file], attachmentsDir)
    const savedName = uploaded[0]?.fileName ?? name
    return `![[${savedName}]]`
  }

  /** Resets from an error state (used by the UI's dismiss action). */
  reset(): void {
    if (this.state.status === 'recording' || this.state.status === 'processing') {
      this.recorder.cancel()
    }
    this.setState({ status: 'idle', error: null })
  }

  isRecording(): boolean {
    return this.state.status === 'recording'
  }
}

/** Inserts transcribed text (and an optional embed line) at the cursor. */
function insertIntoEditor(text: string, embed: string | null): void {
  const view = getActiveEditorView()
  if (!view) return

  let insert = text
  if (embed) {
    insert = insert.length > 0 ? `${insert}\n\n${embed}\n` : `${embed}\n`
  }
  if (insert.length === 0) return

  const { from, to } = view.state.selection.main
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + insert.length },
    scrollIntoView: true,
  })
  view.focus()
}

/** Maps recorder/transcription errors to a concise, user-facing message. */
function messageForError(err: unknown): string {
  if (err instanceof DictationRecorderError) return err.message
  if (err instanceof Error && err.message) return err.message
  return 'Dictation failed.'
}

// ─── Module Singleton ──────────────────────────────────────────────────────

let controller: DictationController | null = null

/** The shared dictation controller (created lazily). */
export function getDictationController(): DictationController {
  controller ??= new DictationController()
  return controller
}

/**
 * Replaces the shared controller. Test helper.
 * @internal
 */
export function _setDictationController(next: DictationController | null): void {
  controller = next
}
