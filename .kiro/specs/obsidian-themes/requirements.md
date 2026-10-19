# Obsidian Themes (Stufe 1) — Requirements

## Kontext

Ein Obsidian-Theme ist ein Ordner `<Name>/` mit `theme.css` und `manifest.json`
(`name`, `version`, `minAppVersion`, `author`, `authorUrl`). Das CSS überschreibt Obsidians
CSS-Variablen (`--background-primary`, `--text-normal`, `--font-*`, `--h1-size`, …), meist auf
`body`, `.theme-light` und `.theme-dark`, und ergänzt Regeln gegen Obsidians DOM-Klassen
(`.workspace-leaf`, `.markdown-rendered`, `.HyperMD-header`, …).

Ist-Stand in Slatebase (Analyse 2026-10-17, siehe Chat-Verlauf):

- `plugins/compat/obsidian-compat.css` + `obsidian-components.css` definieren ca. 607 Obsidian-
  Variablen (Farbskala, Schrift, Überschriften, Tabellen, Callouts, Nav, Tabs, …) und
  `plugins/compat/body-classes.ts` setzt `theme-light`/`theme-dark` auf `<body>`.
- Die Compat-Variablen sind aber **Einbahnstraße für Plugins**: Im Light-Mode stehen feste Hex-Werte,
  im Dark-Mode zeigen sie auf Slatebase-Tokens (`--background-primary: var(--bg-base)`). Die eigene
  Oberfläche liest `--bg-base`, `--bg-surface`, `--text-primary`, `--accent`, … (155 Tokens in
  `index.css`). Ein Theme, das `--background-primary` setzt, ändert die UI daher fast nicht.
- CSS-Snippets (`backend/src/snippets/`, `SnippetInjector`, `SnippetLifecycle`) sind das Vorbild für die
  Injection. Der Speicherort unterscheidet sich bewusst: Snippets liegen unter `backend/data/snippets/`,
  Themes im Vault unter `.obsidian/themes/` (wie die Obsidian-Plugins, die `plugin-service.ts` dort liest).
- Gemessen an Things (70 KB) und Minimal (267 KB): nur 10 bzw. 12 echte Variablen-Lücken.

## Ziel

Variablen-getriebene Obsidian-Themes (Farben, Schriften, Überschriften, Abstände) können in einem
Vault installiert, aktiviert und gewechselt werden und färben die **gesamte Slatebase-Oberfläche** um.

## Nicht-Ziele (Stufe 2 bzw. später)

- **Struktur-Selektoren** (`.workspace-leaf`, `.nav-file-title`, `.HyperMD-header`,
  `.markdown-preview-view`, `.cm-s-obsidian`, …): Klassen-Aliase an Editor, Leseansicht, Explorer, Tabs
  sind Stufe 2. Strukturlastige Themes (Minimal, AnuPpuccin) sind in Stufe 1 nur teilweise kompatibel.
- Community-Theme-Verzeichnis (`community-css-themes.json`), Online-Installation, Update-Prüfung.
- ZIP-Import (Stufe 1 importiert `theme.css` und optional `manifest.json` als Dateien).
- Style-Settings-Plugin (`--font-text-override` & Co. bleiben undefiniert, `var()` ohne Wert ist harmlos).
- Mehrere gleichzeitig aktive Themes (Obsidian kennt genau eines; Snippets bleiben die Ergänzung).

## Anforderungen

### R1 — Token-Brücke (Obsidian-Variablen steuern die UI)
1.1 Ist ein Theme aktiv, werden die Slatebase-Tokens (`--bg-*`, `--text-*`, `--border-*`, `--accent*`
    und die Typografie-Tokens) von den entsprechenden Obsidian-Variablen abgeleitet. Die Zuordnung steht
    als Tabelle im Design und wird in einem Test gegen die tatsächliche CSS-Datei geprüft.
1.2 Die abgeleiteten Tokens werden auf `body` deklariert (nicht nur `:root`), damit Werte, die ein Theme
    auf `body`, `.theme-light` oder `.theme-dark` setzt, ankommen.
1.3 Ohne aktives Theme ist das Erscheinungsbild **pixelgleich** zum heutigen Stand (einzige bewusste
    Ausnahme: die Umbenennung `--text-muted` → `--text-subtle` stellt die gedämpfte Textstufe wieder her,
    siehe tasks.md) (kein Regressionsrisiko
    für alle, die keine Themes nutzen). Die Brücke ist daher nur mit einem Marker am `<html>` aktiv.
1.4 Zyklen (`--bg-base` ↔ `--background-primary`) sind ausgeschlossen: Bei aktivem Theme haben die
    Compat-Variablen eigene Standardwerte und zeigen nicht auf Slatebase-Tokens.
1.5 Hell/Dunkel: `theme-light`/`theme-dark` auf `body` folgen weiterhin `data-theme` und `system`.

### R2 — Variablen-Lücken
2.1 Fehlende, in der offiziellen Obsidian-Referenz (https://docs.obsidian.md/Reference/CSS+variables)
    dokumentierte Variablen werden mit Standardwerten ergänzt. Keine erfundenen Variablen, keine Werte
    für reine Plugin-Variablen (Style Settings, Todoist, …).
2.2 Typografie-Variablen (`--font-text`, `--font-interface`, `--font-monospace`, `--h1…h6-size/color/
    weight/line-height`, `--line-height-normal`, `--file-line-width`, `--bold-*`, `--italic-*`) werden in
    Editor, Leseansicht und Überschriften tatsächlich gelesen.

### R3 — Theme-Speicher (Backend, im Vault)
3.1 Themes sind **Teil des Vaults** und liegen wie in Obsidian unter
    `<vault>/.obsidian/themes/<themeId>/theme.css` + `manifest.json`. Es gibt keinen Speicher unter
    `backend/data/`. Ein aus Obsidian übernommener Vault zeigt seine Themes ohne Import; Themes reisen
    mit dem Vault (Backup, Git-Sync, Kopie).
3.2 Das Backend scannt `.obsidian/themes/` wie `plugin-service.ts` es mit `.obsidian/plugins/` tut
    (direkter Dateizugriff auf Dot-Verzeichnisse; sie bleiben in Baum, Suche und Statistik versteckt).
    Routen unter `/api/v1/vaults/:vaultId/themes`. Berechtigungen: Lesen (Liste, CSS, aktives Theme)
    mit Lesezugriff auf den Vault; Schreiben (Import, Löschen, Aktivieren) nur mit **Schreibzugriff** auf den
    Vault (`IVaultAccessControl`), weil Themes Vault-Dateien ändern und für alle Nutzer gelten.
    Die Plugin-Routen prüfen derzeit nur, dass der Vault existiert (`vaultRegistry.findById`); die
    Schreibprüfung muss die Theme-Route daher selbst ergänzen. Welche Methode von `IVaultAccessControl`
    dafür passt, wird in Phase 4 gegen die Datei-Schreibrouten geprüft.
3.3 Validierung: `themeId` nur `[A-Za-z0-9 _.-]`, keine Pfadtrennzeichen; jeder Zugriff läuft durch
    `validateFilePath()`; `theme.css` max. 2 MB (Minimal hat 267 KB; Snippets bleiben bei 512 KB);
    `manifest.json` optional, unbekannte Felder werden ignoriert, fehlendes `name` fällt auf `themeId` zurück.
    Ein Ordner ohne `theme.css` ist kein Theme und wird nicht gelistet.
3.4 Atomare Schreibzugriffe (temp → `rename()`), Windows-Locking-Retries; ein fehlgeschlagenes Lesen
    heißt „unbekannt", nie „Theme gelöscht". Schreiben der gemeinsamen JSON-Datei (3.6) über
    `shared/json-file-store.ts`.
3.5 Es gibt nichts aufzuräumen, wenn ein Vault gelöscht wird: die Themes liegen im Vault-Ordner.
3.6 Die aktive Auswahl steht in `<vault>/.obsidian/appearance.json` im Feld `cssTheme` (Obsidians Format;
    `""`/fehlend = Standard). Andere Felder der Datei (`theme`, `enabledCssSnippets`, …) bleiben beim
    Schreiben **unverändert erhalten** (Read-Modify-Write unter Mutex; unbekannte Felder durchreichen).
3.7 Sync-Verhalten (geprüft): `sync-engine.ts` synchronisiert Obsidian-Config und -Themes ausdrücklich
    (`MANAGED_GITIGNORE_LINES` ignoriert nur `.obsidian/workspace*.json` und `.obsidian/plugins/*/data.json`).
    `.obsidian/themes/**` und `appearance.json` werden daher mitsynchronisiert; keine Änderung am Ignore-Block nötig.

### R4 — Aktivierung und Injection (Frontend)
4.1 Es ist höchstens ein Theme aktiv. Die Auswahl gilt **für den Vault**, also für alle Nutzer, die ihn
    öffnen (Obsidian-Semantik, `cssTheme` in `appearance.json`). Hell/Dunkel bleibt weiter Nutzersache
    (`data-theme`). Es gibt keine zusätzliche Auswahl in `vaultSettingsStore`/`localStorage`.
4.2 `ThemeInjector` fügt das CSS unscoped in genau einen `<style data-slatebase-theme>`-Tag ein, **vor**
    den Snippet-Tags (Reihenfolge: Basis-CSS < Theme < Snippets), und setzt den Marker aus R1.3.
4.3 `ThemeLifecycle` lädt das aktive Theme beim Vault-Öffnen, ersetzt es beim Vault-Wechsel und entfernt
    es bei Deaktivierung vollständig (Style-Tag + Marker). Ein fehlgeschlagener Ladevorgang ist
    „unbekannt", nicht „gelöscht": Das zuletzt angewendete Theme bleibt, die Auswahl wird nicht verworfen.
4.4 Wird das aktive Theme gelöscht, fällt die Auswahl auf Standard zurück (nur bei eindeutiger 404-Antwort).
4.5 Ändert jemand Theme-Auswahl oder -Dateien, veröffentlicht das Backend `vault:change` (Payload
    `{ vaultId, action, path, userId, username }`, Ziel: Nutzer mit Zugriff, wie `publishVaultChange` im
    MCP-Block von `index.ts`) mit dem Pfad `.obsidian/appearance.json` bzw. `.obsidian/themes/<id>/…`.
    Der auslösende Client wird ausgeschlossen. `ThemeLifecycle` hört auf diese Pfade und lädt neu. Kein
    neuer Event-Typ. Dot-Pfade dürfen den Dateibaum nicht verändern (Verhalten des Baum-Handlers in
    Phase 5 mit Test absichern).

### R5 — Settings-UI
5.1 Neuer Abschnitt „Themes" (Kategorie `vault`, `requiresVault: true`) neben „CSS-Snippets" in
    `state/settingsRegistry.ts`; Labels in `i18n/de.ts` und `en.ts` (UI deutsch).
5.2 Liste der im Vault gefundenen Themes mit Name, Version, Autor, Größe; Aktivieren/Deaktivieren, Löschen
    mit Bestätigung (löscht den Ordner im Vault), Import über Datei-Auswahl (`theme.css`, optional
    `manifest.json`) und Drag & Drop. Ein Hinweis nennt, dass die Auswahl für alle Nutzer des Vaults gilt.
5.3 Der Standard „Slatebase" ist als erster, nicht löschbarer Eintrag sichtbar.
5.4 Barrierefreiheit: `useFocusTrap` in Dialogen, Tastaturbedienung, co-located `*.a11y.test.tsx`.

### R6 — Sicherheit und Hinweise
6.1 Theme-CSS ist Nutzerinhalt und wird wie Snippet-CSS behandelt (nur Größenlimit, ungültige Klammern
    warnen, kein Blockieren).
6.2 Beim Import werden externe Ressourcen erkannt (`@import url(http…)`, `url(http…)`, z. B. Google
    Fonts) und in der UI als Hinweis angezeigt („lädt Inhalte von …"). Die CSP des Servers wird geprüft;
    blockiert sie Fremdquellen, steht das im Hinweis, sonst bleibt es eine Warnung.

### R7 — Dokumentation
7.1 README/Docs (deutsch): Unterstützungsumfang von Stufe 1, bekannte Grenzen (Struktur-Selektoren),
    Anleitung zum Import. Welcome-Vault um einen kurzen Hinweis ergänzen.
