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

## Ergebnisse der Verifikation (Task 4.1, 3.3)

- **`formatting-*-end`:** Wortlaut im 1.15-Changelog: Schließende Formatierungs-Tokens tragen nun ein `formatting-*-end`-Segment in den Syntaxbaum-Knotennamen; Beispiel: schließendes Inline-Code-Backtick = `formatting_formatting-code_formatting-code-end_inline-code`. Plugins sollen `formatting-code` statt des vollen Namens `formatting-code_inline-code` matchen. Unsere `tokenClassNodeProp`-Werte (`inline-code formatting formatting-code`) enthalten `formatting-code`, die empfohlene Match-Form funktioniert also. Die Unterscheidung öffnend/schließend ist mit einer Prop pro NodeType nicht möglich; ein Parser-Wrapper wäre ein Eingriff in den Editor-Parser mit unverhältnismäßigem Risiko. **Entscheidung (überarbeitet):** Statt eines Parser-Wrappers tauscht der bestehende `syntaxTree()`-Wrapper für Plugins während des `enter`-Callbacks den Node-Typ gegen einen abgeleiteten aus (`closingMarkType`), nur für `CodeMark`/`EmphasisMark`. Parser und Editor bleiben unverändert; dokumentiert in `.kiro/steering/tech.md`.
- **Math-Block:** Block-Math wird als `Decoration.replace`-Widget gerendert (`widget-decorations.ts`); `HyperMD-math` wird zusätzlich als Zeilen-Dekoration je Zeile gesetzt (bleibt auch bei aufgedecktem Quelltext erhalten).
- **API-Quelle:** `obsidian.d.ts` (Master) enthält `promptForDeletion(file): Promise<boolean>` und `SettingDefinitionItem`-`id`; 1.15-Änderungen (z. B. `trashFile` → boolean) sind dort noch nicht nachgezogen.
