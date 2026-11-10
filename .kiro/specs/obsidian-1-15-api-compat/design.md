# Design Document: Obsidian 1.15 API-Kompatibilität

## Overview

Kleine, voneinander unabhängige Änderungen im Compat-Layer. Reihenfolge nach Risiko: erst additive APIs, dann die Token-Klassen (unsichere Machbarkeit), zuletzt der Versions-Bump.

## Design-Entscheidungen

1. **Mermaid bleibt echt.** `loadMermaid()` (`plugins/compat/obsidian-api-extensions.ts:834`) lädt bereits das echte `mermaid`-Paket, das `initialize`, `render`, `parse` und `mermaidAPI` mitbringt. Neu: nach dem Laden `window.mermaid = window.pele = mod`. Kein Pele-Paket, keine `.pele-*`-Klassen.
2. **`loadPixi()` als ehrlicher Stub** nach dem Muster von `registerUnsupportedLoaders` (`loadPrism`, `loadPdfJs`); `window.PIXI` bleibt undefiniert.
3. **FileManager:** `trashFile` (`shims/file-manager-shim.ts:307`) fängt Fehler von `vault.trash` und liefert `boolean`. `promptForDeletion` ist neu; es nutzt dieselbe `window.confirm`-Logik wie `promptForFolderDeletion`. Der Interface-Typ in Zeile 45 wird auf `Promise<boolean>` geändert; Aufrufer in `src/` die `void` erwarten, werden per grep geprüft (`trashFile`).
4. **Token-Klassen:** `tokenClassNodeProp` ist eine Eigenschaft pro Lezer-`NodeType`. `EmphasisMark`/`CodeMark` sind für öffnende und schließende Marker derselbe Typ → die Unterscheidung ist über die Prop allein nicht möglich. Mögliche Wege: (a) zusätzlicher Parser-Wrapper, der schließende Marker in einen eigenen NodeType umbenennt; (b) Lücke dokumentieren. Task 4.1 entscheidet nach Verifikation des echten Obsidian-Verhaltens.
5. **Settings-`id`:** reine Weitergabe als `data-setting-id`; keine Logik.

## Komponenten

| Datei | Änderung |
|---|---|
| `shims/file-manager-shim.ts` | `trashFile` → boolean, `promptForDeletion`, Proxy-Whitelist |
| `obsidian-api-extensions.ts` | `loadMermaid` setzt `window.mermaid`/`window.pele`; `loadPixi`; Version |
| `editor/token-class-node-prop.ts` | ggf. `-end`-Klassen |
| `declarative-settings-renderer.ts` | `id` → `data-setting-id` |
| Live-Preview-Math (`editor/live-preview/…`) | Zeilenklasse `HyperMD-math` |
| `App.css` | `--font-preferred-size` |

## Teststrategie

- Unit-Tests je Änderung in eigenen, neu benannten Testdateien (bestehende Tests nicht überschreiben).
- Kein voller vitest-Lauf auf dem 2-Core-Host; nur betroffene Dateien (`file-manager-shim`, `obsidian-api-extensions`, `token-class-node-prop`, `declarative-settings-renderer`, `compatibility-analyzer`).
- Vor dem Push: `npm run lint` und `npm run build` (nicht nur `tsc`), sowie Tests der Verbraucher der geänderten Funktionen.

## Offene Fragen

- Exakte Form der `-end`-Klassen (Task 4.1).
- Ob der Math-Block bei uns zeilenweise dekoriert wird (Task 6.1).
