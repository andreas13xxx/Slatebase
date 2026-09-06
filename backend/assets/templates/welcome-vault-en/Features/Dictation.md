---
tags: [features]
---

# Dictation (Speech Recognition)

Dictation turns spoken words into text and inserts it directly at the cursor position in the editor. Speech recognition runs with **Whisper on your own server** — the recording never leaves the server, there are no external services and no usage fees.

> [!warning] Compute-intensive — not available everywhere
> Whisper needs noticeable compute. On a server without a GPU the transcription is markedly slow. The feature is therefore **off by default** and only appears once an administrator has enabled it **and** configured a Whisper backend. If you don't see the command, the feature isn't set up in your installation (yet).

---

## Prerequisites

- Feature toggle `voice-transcription` enabled (see [[Admin/Feature Toggles]]; **off** by default)
- A Whisper backend is configured server-side (`SLATEBASE_TRANSCRIPTION_BACKEND_URL`) — otherwise the feature stays inert even with the toggle on
- A vault with write access is selected, and a note is open in edit mode
- Microphone access in the browser and a secure connection (HTTPS) — without HTTPS the browser won't grant the microphone

---

## Starting and stopping dictation

1. Open a note in edit mode and place the cursor where you want the text
2. Open the [[Features/Command Palette]] (`Ctrl+P`) and choose **Start/stop dictation**
3. Allow microphone access when the browser asks
4. Speak your text
5. Trigger the same command again (or click **Stop & transcribe** in the recording panel)
6. The recognized text is inserted at the cursor position

While transcribing, a hint shows that it may take a moment depending on server load. That's normal — especially without a GPU.

---

## Choosing the language

The recording panel lets you switch the language:

| Option | Behavior |
|--------|----------|
| Auto-detect | Whisper determines the language itself (default) |
| German | Recognition in German |
| English | Recognition in English |

The choice is remembered per user **and** per vault — so a German-language vault and an English-language vault each keep their own setting.

---

## Saving the recording as an attachment

If you enable **Save audio** in the recording panel, the original recording is also stored as an audio file in the vault's attachments directory (see [[Features/Templates and Daily Notes]] for configuring the attachments folder) and inserted into the note as a playable [[Features/Embeds|embed]] (`![[…]]`). That way the voice recording is kept alongside the text and can be replayed later.

If saving the attachment fails, the transcribed text is not lost — it is inserted regardless.

---

## Privacy

The recording is sent only to the operator-configured Whisper backend and transcribed there. It is **not** persisted server-side — the only exception is the deliberately chosen vault attachment (see above).

---

> [!todo] Exercise
> Dictate a short paragraph into a new note. Set the language to "Auto-detect" once and to German explicitly once, and compare the result. Then enable "Save audio" and check that the audio embed in the note is playable.

---

## Related Features

- [[Features/Command Palette]] — The "Start/stop dictation" command is triggered from here
- [[Features/Embeds]] — How the saved audio recording plays back as an embed
- [[Basics/Editor and Viewer]] — Contains the editor's built-in spellchecker
- [[Admin/Feature Toggles]] — Enable/disable the feature server-wide
