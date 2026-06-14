---
inclusion: fileMatch
fileMatchPattern: '**/sync/**'
---

# obsidian-livesync — CouchDB-Dokumentformat & Sync-Algorithmus

Erkenntnisse aus der Quellcode-Analyse von `vrtmrz/obsidian-livesync` (Plugin), `vrtmrz/livesync-commonlib` (Shared Library) und `vrtmrz/octagonal-wheels` (Binary/Crypto Utilities). Stand: Mai 2026.

## Dokument-Typen in CouchDB

| `type`-Feld | Bedeutung | `_id`-Format | Inhalt |
|---|---|---|---|
| `"plain"` | Textdatei (Markdown, SVG, HTML, CSS, JS, XML, Canvas, TXT, CSV) | Dateipfad oder `i:`/`ps:`/`ix:` + Pfad | `children: string[]` → Leaf-IDs |
| `"newnote"` | Binärdatei (alles was nicht `isPlainText()`) | Dateipfad oder `i:`/`ps:`/`ix:` + Pfad | `children: string[]` → Leaf-IDs |
| `"notes"` | Legacy-Format (alt, wird nicht mehr erzeugt) | Dateipfad | `data: string \| string[]` direkt |
| `"leaf"` | Chunk-Daten (Inhaltsfragment) | Hash-basierte ID | `data: string` (ein Chunk) |
| `"chunkpack"` | Gepackte Chunks (Optimierung) | Hash-basierte ID | `data: string` |
| `"versioninfo"` | Chunk-Format-Version | `"obsydian_livesync_version"` | `version: number` |
| `"syncinfo"` | Sync-Metadaten | `"syncinfo"` | `data: string` |
| `"milestoneinfo"` | Milestone | `"_local/obsydian_livesync_milestone"` | — |
| `"nodeinfo"` | Node-Info | `"_local/obsydian_livesync_nodeinfo"` | — |

## Dokument-ID-Prefixes

| Prefix | Bedeutung | Beispiel |
|---|---|---|
| (kein) | Reguläre Vault-Datei | `notes/hello.md` |
| `h:` | Header für chunked Content (veraltet, wird noch gelesen) | `h:notes/hello.md` |
| `i:` | Interne Obsidian-Dateien (.obsidian/) | `i:.obsidian/app.json` |
| `ps:` | Plugin-Settings | `ps:.obsidian/plugins/x/data.json` |
| `ix:` | Index-Dateien | `ix:some-index` |
| `chunk:` | Legacy-Chunk-Format | `chunk:<id>:<index>` |
| `_local/` | CouchDB-lokale Dokumente (nicht repliziert) | `_local/obsydian_livesync_milestone` |
| `_design/` | CouchDB Design-Dokumente | `_design/replicate` |

## Chunk-Speicherung & Reassembly

### Schreiben (Plugin → CouchDB)

1. Datei wird als `Blob` gelesen
2. `ContentSplitter` zerlegt den Blob in Chunks:
   - **Text** (`isPlainText(path)` = `.md .txt .svg .html .csv .css .js .xml .canvas`): Chunks sind **rohe UTF-8-Strings** (gesplittet an Zeilengrenzen, Code-Blöcken, Segmenter-Boundaries)
   - **Binär** (alles andere): Chunks sind **einzeln Base64-kodierte Byte-Abschnitte** (`arrayBufferToBase64Single(buf.slice(start, end))`)
3. Jeder Chunk wird als `EntryLeaf`-Dokument gespeichert (`type: "leaf"`, `data: <chunk-string>`)
4. Das Hauptdokument speichert `children: [leafId1, leafId2, ...]` (geordnet) und `type: "plain" | "newnote"`

### Lesen (CouchDB → Plugin)

1. Hauptdokument laden → `children`-Array
2. Alle Leaf-Dokumente laden → `data`-Strings sammeln (in Reihenfolge der `children`)
3. `LoadedEntry.data = chunks.map(e => e.data)` — bleibt ein **String-Array**
4. Dekodierung via `readContent(doc)`:
   - `isTextDocument(doc)` → `getDocData(doc.data)` = `data.join("")` (Strings zusammenfügen)
   - Binär → `decodeBinary(doc.data)`:
     - Prüft ob erster Chunk mit `%` beginnt (encodedUTF16-Format, veraltet)
     - Sonst: `base64ToArrayBuffer(array)` — **dekodiert jeden Array-Eintrag einzeln** als Base64 und konkateniert die resultierenden Byte-Buffer

### Kritische Erkenntnis für Slatebase

**Binäre Chunks dürfen NICHT als Strings zusammengefügt und dann einmal dekodiert werden.** Jeder Chunk hat eigenes Base64-Padding (`=`). `Buffer.from("QQ==QkM=", 'base64')` stoppt am ersten Padding und gibt nur den ersten Chunk zurück.

Korrekt:
```typescript
const buffers = chunks.map(chunk => Buffer.from(chunk, 'base64'))
const content = Buffer.concat(buffers)
```

## Lösch-Semantik

### Standard (deleteMetadataOfDeletedFiles = false)

Gelöschte/verschobene Dateien werden mit einem **Body-Level-Flag** markiert:
```json
{ "_id": "old-path.md", "type": "plain", "deleted": true, "mtime": 1700000000000 }
```
Das CouchDB-Dokument bleibt **am Leben** (kein `_deleted`). Es erscheint im Changes Feed als normales Dokument.

### Mit deleteMetadataOfDeletedFiles = true

Zusätzlich wird `_deleted: true` gesetzt → CouchDB-Tombstone. Erscheint im Changes Feed mit `change.deleted = true`.

### Verschieben einer Datei

1. Neues Dokument am Zielpfad (mit Inhalt)
2. Tombstone am Ursprungspfad (`deleted: true` im Body)

### Slatebase muss prüfen

```typescript
const isDeleted = change.deleted ?? doc._deleted ?? doc.deleted ?? false
```

## isPlainText() — Textdatei-Erkennung

Aus `livesync-commonlib/src/string_and_binary/path.ts`:
```
.md .txt .svg .html .csv .css .js .xml .canvas → Text (type "plain")
Alles andere → Binär (type "newnote")
```

**Wichtig:** `.svg` ist TEXT, nicht binär. `.json` ist BINÄR (nicht in der Liste).

Das `type`-Feld im Dokument hat immer Vorrang vor der Pfad-basierten Erkennung.

## Interne Dokumente (nicht synchen)

Diese Dokument-IDs sind KEINE Dateipfade und dürfen nicht als Vault-Dateien geschrieben werden:
- `obsydian_livesync_version` (Chunk-Format-Version, Typo ist Original)
- `syncinfo` (Sync-Metadaten)
- `client-config` (Client-Konfiguration, Sync-Settings zwischen Geräten)
- `client-config.yml` (P2P-Netzwerkkonfiguration: peerId, networkId, Peer-Adressen — seit livesync 0.25.x mit P2P-Feature)
- `_local/*` (CouchDB-lokal, werden ohnehin nicht repliziert)
- `_design/*` (CouchDB Design-Docs)

## Obsidian-Konfigurationsdateien (.obsidian/)

Dateien unter `.obsidian/` (Plugin-Settings, App-Konfiguration, Workspace-Layouts, Themes) werden **mitgesynct**. Die Dokument-ID-Prefixes `i:` und `ps:` werden gestrippt, der resultierende Pfad (z.B. `.obsidian/app.json`) wird normal als Datei ins Vault geschrieben.

**Ausgeschlossene Verzeichnisse** (werden NICHT gesynct):
- `.trash/` — Obsidian-Papierkorb (lokale Löschungen, nicht relevant für Sync)
- `.mobile/` — Mobile-App-spezifische Daten

## Eden-Chunks (Legacy)

Ältere Versionen speicherten Chunks inline im Hauptdokument unter `eden: { [chunkId]: { data: string, epoch: number } }`. Wird beim Lesen noch unterstützt, aber nicht mehr geschrieben.

## Verschlüsselung (E2E)

Wenn E2E aktiviert:
- Chunk-Daten werden vor dem Speichern verschlüsselt
- Chunk-IDs bekommen Prefix `e:` (PREFIX_ENCRYPTED_CHUNK)
- Pfade können obfuskiert werden (PREFIX_OBFUSCATED = `+`)
- Verschlüsselungsalgorithmus: AES-GCM mit PBKDF2-abgeleitetem Schlüssel

## Push-Format (Slatebase → CouchDB)

Wenn Slatebase Dateien nach CouchDB pusht, muss das Format kompatibel sein:

### Textdateien
```json
{
  "_id": "notes/hello.md",
  "path": "notes/hello.md",
  "type": "plain",
  "data": "# Hello\nWorld",
  "children": [],
  "mtime": 1700000000000,
  "ctime": 1700000000000,
  "size": 13,
  "eden": {}
}
```

### Binärdateien (klein, ohne Chunking)
```json
{
  "_id": "image.png",
  "path": "image.png",
  "type": "newnote",
  "data": "<base64-encoded-content>",
  "children": [],
  "mtime": 1700000000000,
  "ctime": 1700000000000,
  "size": 1234,
  "eden": {}
}
```

### Löschung (livesync-kompatibel)
```json
{
  "_id": "old-file.md",
  "_rev": "2-existing",
  "path": "old-file.md",
  "type": "plain",
  "deleted": true,
  "children": [],
  "mtime": 1700000000000,
  "ctime": 1699000000000,
  "size": 0,
  "eden": {}
}
```
**Wichtig:** Kein `_deleted: true` verwenden (CouchDB-Tombstone). livesync verwendet standardmäßig Body-Level `deleted: true`. Tombstones werden nach CouchDB-Compaction entfernt und können Sync-Probleme verursachen.

### Hinweis zu Chunking beim Push
livesync erwartet bei großen Dateien separate Leaf-Dokumente + `children`-Array. Slatebase pusht aktuell alles als einzelnes `data`-Feld. Das funktioniert für kleine Dateien, kann aber bei großen Dateien (>CouchDB max_document_size, default 8MB) fehlschlagen. Für volle Kompatibilität müsste Slatebase beim Push ebenfalls chunken.

## Relevante Quellen

- `vrtmrz/livesync-commonlib` @ `61741c1748a48796a4f8ba0ea83ccde5f4e848fa`
  - `src/string_and_binary/chunks.ts` — Chunk-Splitting-Algorithmen
  - `src/string_and_binary/convert.ts` — encodeBinary/decodeBinary
  - `src/string_and_binary/path.ts` — isPlainText()
  - `src/common/utils.ts` — readContent(), getDocData(), decodeBinary()
  - `src/common/models/db.type.ts` — Dokument-Typen (NewEntry, PlainEntry, EntryLeaf)
  - `src/common/models/db.const.ts` — EntryTypes, VERSIONING_DOCID
  - `src/managers/EntryManager/EntryManagerImpls.ts` — respondEntryFromMeta(), putDBEntry()
- `vrtmrz/octagonal-wheels`
  - `src/binary/index.ts` — decodeBinary(), encodeBinary()
  - `src/binary/base64.ts` — base64ToArrayBuffer() (per-chunk decode + concat)
