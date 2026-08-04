# fix-register-editor-extension Bugfix Design

## Overview

Das "Editing Toolbar" Plugin (und andere Plugins wie Kanban, Tasks etc.) rufen `this.registerEditorExtension(extension)` auf, um CM6-ViewPlugins (z.B. eine Toolbar-Leiste) in den Editor einzuhängen. Derzeit sind diese Methoden No-Op-Stubs auf der Plugin-Klasse und werden nicht an die vorhandene `registerPluginExtension()`-Infrastruktur in `editor/plugin-extensions.ts` weitergeleitet. Die Infrastruktur (Compartment-Isolation, dynamische Rekonfiguration, `getActivePluginExtensions()` in `CodeMirrorEditor.tsx`) existiert bereits vollständig — nur die Verdrahtung in `onPluginInstantiated` (plugin-context.ts) fehlt.

Der Fix ist minimal: 3 Stellen in einer Datei (`plugin-context.ts`) anpassen.

## Glossary

- **Bug_Condition (C)**: Ein Plugin ruft `this.registerEditorExtension(ext)` oder `this.registerEditorSuggest(suggest)` auf — der Aufruf wird still ignoriert (No-Op)
- **Property (P)**: Die Extension/Suggest wird an die `PluginExtensionManager`-Infrastruktur weitergeleitet und im aktiven CM6-Editor angewandt
- **Preservation**: Alle bestehenden Plugin-Wirings (`addCommand`, `registerView`, `addRibbonIcon`, `addSettingTab`, `registerExtensions`, `registerMarkdownCodeBlockProcessor`, `registerMarkdownPostProcessor`) bleiben unverändert funktional
- **`registerPluginExtension(pluginId, extension)`**: Funktion in `editor/plugin-extensions.ts` — erstellt ein Compartment, speichert die Extension und dispatcht `reconfigure` falls ein EditorView aktiv ist
- **`registerPluginCompletionSource(pluginId, source)`**: Funktion in `editor/plugin-extensions.ts` — registriert einen AutoComplete-Provider mit Error-Wrapping
- **`onPluginInstantiated`**: Callback in `plugin-context.ts` der aufgerufen wird sobald eine Plugin-Instanz erzeugt wurde — hier werden Methoden wie `addCommand`, `loadData` etc. auf die Instanz gepatcht
- **`cleanupPluginRegistrations(pluginId)`**: Cleanup-Funktion die bei Deaktivierung/Error/Vault-Wechsel alle UI-Registrierungen eines Plugins entfernt
- **Vault-Generation-Guard**: `pluginSystemVaultIdRef.current !== newVaultId`-Check der verhindert, dass Registrierungen nach einem Vault-Wechsel noch in den falschen Kontext geschrieben werden

## Bug Details

### Bug Condition

Der Bug manifestiert sich wenn ein Plugin die Obsidian-API `this.registerEditorExtension(extension)` oder `this.registerEditorSuggest(suggest)` aufruft. Die Methoden existieren als No-Op-Stubs in `setting-tab.ts` (Plugin-Klasse) und `plugin-loader.ts` (Bundle-Shim), werden aber nicht in `onPluginInstantiated` mit der echten Infrastruktur verdrahtet — im Gegensatz zu allen anderen Plugin-Methoden (`addCommand`, `registerView`, `addRibbonIcon` etc.).

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type PluginMethodCall
  OUTPUT: boolean
  
  RETURN input.methodName IN ['registerEditorExtension', 'registerEditorSuggest']
         AND input.calledOnPluginInstance = true
         AND input.extension IS a valid CM6 Extension OR CompletionSource
         AND extensionNotAppliedToEditor(input.extension)
END FUNCTION
```

### Examples

- **Editing Toolbar**: Plugin ruft `this.registerEditorExtension(ViewPlugin.fromClass(...))` auf → erwartet: Toolbar erscheint über dem Editor. Tatsächlich: nichts passiert, Extension wird verschluckt.
- **Tasks Plugin**: Könnte `this.registerEditorExtension(checkboxDecoration)` aufrufen → erwartet: Checkboxen im Editor interaktiv. Tatsächlich: No-Op.
- **Autocomplete Plugin**: Ruft `this.registerEditorSuggest(new MySuggest(app))` auf → erwartet: Custom-Autocomplete-Provider im Editor. Tatsächlich: No-Op.
- **Plugin ohne Editor-Extensions**: Ruft nur `addCommand()`/`registerView()` auf → weiterhin korrekt verdrahtet (kein Effekt durch den Fix).

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- `instance.addCommand(command)` routet weiterhin an `commandRegistryRef.current.addCommand(pluginId, command)` mit Vault-Generation-Guard
- `instance.addSettingTab(tab)` routet weiterhin an `settingTabRegistryRef.current.register(pluginId, tab)` mit Guard
- `instance.addRibbonIcon(icon, title, cb)` routet weiterhin an `addRibbonIcon(pluginId, icon, title, cb)` mit Guard
- `instance.registerView(viewType, creator)` routet weiterhin an `newWorkspaceShim.registerView(...)` mit Guard
- `instance.registerExtensions(exts, viewType)` routet weiterhin an `registerExtensionsForPlugin(exts, viewType, pluginId)` mit Guard
- `instance.registerMarkdownCodeBlockProcessor(language, handler)` routet weiterhin an `registerCodeBlockProcessor(...)` mit Guard
- `instance.loadData()`/`instance.saveData()` routing an SettingsManager bleibt unverändert
- `cleanupPluginRegistrations(pluginId)` entfernt weiterhin Commands, SettingTabs, RibbonIcons, StatusBarItems, FileViewMatchers, Views
- Editor ohne aktive Plugins rendert weiterhin korrekt (leere Extension-Liste)
- Plugins die `registerEditorExtension` NICHT aufrufen werden durch den Fix nicht beeinflusst

**Scope:**
Alle Inputs die NICHT `registerEditorExtension`/`registerEditorSuggest` betreffen bleiben vollständig unverändert. Der Fix berührt ausschließlich:
- Die `onPluginInstantiated`-Funktion (2 neue Method-Overrides hinzufügen)
- Die `cleanupPluginRegistrations`-Funktion (2 Cleanup-Aufrufe hinzufügen)
- Die Import-Zeile (2 neue Imports aus `editor/plugin-extensions.ts`)

## Hypothesized Root Cause

Die Root Cause ist eindeutig (kein Hypothesieren nötig):

1. **Fehlende Verdrahtung in `onPluginInstantiated`**: Für `addCommand`, `registerView`, `addRibbonIcon`, `addSettingTab`, `registerExtensions` und `registerMarkdownCodeBlockProcessor` existieren bereits Instance-Overrides in `onPluginInstantiated`. Für `registerEditorExtension` und `registerEditorSuggest` wurde dieses Pattern nicht angewandt — die Methoden bleiben auf den No-Op-Stubs aus `setting-tab.ts`.

2. **Fehlender Cleanup in `cleanupPluginRegistrations`**: Die Funktion ruft `removePluginExtensions(pluginId)` und `removePluginCompletionSources(pluginId)` nicht auf. Selbst wenn die Verdrahtung existieren würde, würden Extensions bei Plugin-Deaktivierung nicht entfernt.

3. **Infrastruktur existiert aber ist unerreichbar**: `plugin-extensions.ts` exportiert `registerPluginExtension`, `removePluginExtensions`, `registerPluginCompletionSource`, `removePluginCompletionSources`. `plugin-context.ts` importiert bereits `getActiveEditorView` aus derselben Datei — die fehlenden Funktionen müssen nur zum Import hinzugefügt und an den richtigen Stellen aufgerufen werden.

## Correctness Properties

Property 1: Bug Condition - registerEditorExtension wird an PluginExtensionManager weitergeleitet

_For any_ Plugin-Instanz die `this.registerEditorExtension(extension)` aufruft wobei die Extension ein valides CM6-Extension-Objekt ist, SHALL das System die Extension via `registerPluginExtension(pluginId, extension)` registrieren, sodass sie im aktiven EditorView (falls vorhanden) sofort per Compartment-Reconfigure angewandt wird und bei zukünftigen Editor-Mounts über `getActivePluginExtensions()` eingebunden ist.

**Validates: Requirements 2.1, 2.2**

Property 2: Preservation - Bestehende Plugin-Verdrahtung und Cleanup unverändert

_For any_ Plugin-Instanz die NICHT `registerEditorExtension`/`registerEditorSuggest` aufruft (sondern z.B. `addCommand`, `registerView`, `addRibbonIcon`), SHALL das System exakt das gleiche Verhalten wie vor dem Fix zeigen: Commands werden registriert, Views werden geöffnet, Ribbon-Icons erscheinen, und bei Deaktivierung werden alle Registrierungen sauber entfernt.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

## Fix Implementation

### Changes Required

**File**: `frontend/src/plugins/compat/plugin-context.ts`

**Change 1: Import erweitern**

Die bestehende Import-Zeile `import { getActiveEditorView } from '../../editor/plugin-extensions'` um `registerPluginExtension`, `removePluginExtensions`, `registerPluginCompletionSource`, `removePluginCompletionSources` erweitern.

**Change 2: `onPluginInstantiated` — `registerEditorExtension` verdrahten**

Nach den bestehenden Method-Overrides (z.B. nach `registerMarkdownPostProcessor`) folgendes hinzufügen:

```typescript
// Wire registerEditorExtension to route to the plugin extension manager
instance.registerEditorExtension = (extension: unknown) => {
  if (pluginSystemVaultIdRef.current !== newVaultId || pluginRegistryRef.current !== newRegistry) return
  registerPluginExtension(pluginId, extension as import('@codemirror/state').Extension)
}
```

**Change 3: `onPluginInstantiated` — `registerEditorSuggest` verdrahten**

```typescript
// Wire registerEditorSuggest to route to the plugin completion source registry
instance.registerEditorSuggest = (suggest: unknown) => {
  if (pluginSystemVaultIdRef.current !== newVaultId || pluginRegistryRef.current !== newRegistry) return
  // Obsidian's EditorSuggest wraps a CompletionSource. Extract or adapt it.
  const source = (suggest as { getSuggestions?: unknown })
  if (typeof (source as { provider?: unknown }).provider === 'function') {
    registerPluginCompletionSource(pluginId, (source as { provider: import('@codemirror/autocomplete').CompletionSource }).provider)
  }
}
```

**Change 4: `cleanupPluginRegistrations` — Extension-Cleanup hinzufügen**

```typescript
async function cleanupPluginRegistrations(pluginId: string): Promise<void> {
  commandRegistryRef.current.removeAllForPlugin(pluginId)
  settingTabRegistryRef.current.remove(pluginId)
  removeRibbonIconsForPlugin(pluginId)
  removeStatusBarItemsForPlugin(pluginId)
  unregisterAllFileViewMatchersForPlugin(pluginId)
  await removeActiveFileViewsForPlugin(pluginId)
  await viewRegistryRef.current.detachAllForPlugin(pluginId)
  // Remove CM6 editor extensions and completion sources for this plugin
  removePluginExtensions(pluginId)
  removePluginCompletionSources(pluginId)
}
```

## Testing Strategy

### Validation Approach

Der Fix ist minimal (3 Stellen in einer Datei) und die Infrastruktur ist vollständig getestet (`plugin-extensions.ts` hat klare Semantik). Die Teststrategie fokussiert auf: 1) Exploratory Tests um den Bug vor dem Fix zu bestätigen, 2) Fix-Checking nach der Implementierung, 3) Preservation-Checking für bestehende Funktionalität.

### Exploratory Bug Condition Checking

**Goal**: Bestätigen dass `registerEditorExtension` aktuell ein No-Op ist und Extensions nicht an den PluginExtensionManager weitergeleitet werden.

**Test Plan**: Unit-Test der eine Plugin-Instanz erstellt, `registerEditorExtension` aufruft und prüft dass `registerPluginExtension` NICHT aufgerufen wurde (bzw. die Extension nicht in `getActivePluginExtensions()` erscheint).

**Test Cases**:
1. **No-Op-Bestätigung**: Plugin ruft `registerEditorExtension([])` → `getActivePluginExtensions()` bleibt leer (bestätigt Bug auf unfixed Code)
2. **Cleanup-Lücke**: Plugin wird deaktiviert → `removePluginExtensions` wird nie aufgerufen (bestätigt fehlenden Cleanup)

**Expected Counterexamples**:
- `getActivePluginExtensions()` gibt leeres Array zurück obwohl Extension registriert wurde
- `removePluginExtensions` wird in `cleanupPluginRegistrations` nicht aufgerufen

### Fix Checking

**Goal**: Verifizieren dass nach dem Fix alle `registerEditorExtension`-Aufrufe korrekt an die Infrastruktur weitergeleitet werden.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := onPluginInstantiated_fixed(input)
  ASSERT registerPluginExtension was called with (pluginId, extension)
  ASSERT extension appears in getActivePluginExtensions()
END FOR
```

### Preservation Checking

**Goal**: Verifizieren dass alle bestehenden Method-Wirings unverändert funktionieren.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT onPluginInstantiated_original(input) = onPluginInstantiated_fixed(input)
END FOR
```

**Testing Approach**: Unit-Tests die die bestehenden Wirings (`addCommand`, `registerView`, etc.) nach dem Fix aufrufen und korrekte Registrierung verifizieren. Da der Fix rein additiv ist (nur neue Code-Zeilen, keine Änderung an bestehenden), ist das Regressions-Risiko minimal.

**Test Cases**:
1. **addCommand Preservation**: Plugin ruft `addCommand` auf → Command erscheint weiterhin in CommandRegistry
2. **registerView Preservation**: Plugin ruft `registerView` auf → View wird weiterhin korrekt registriert
3. **Vault-Guard Preservation**: Vault-Wechsel mid-registration → Guards blockieren weiterhin stale Registrierungen

### Unit Tests

- Test: `registerEditorExtension` leitet an `registerPluginExtension` weiter (mock oder spy auf die Funktion)
- Test: `registerEditorSuggest` leitet an `registerPluginCompletionSource` weiter
- Test: `cleanupPluginRegistrations` ruft `removePluginExtensions` und `removePluginCompletionSources` auf
- Test: Vault-Generation-Guard blockiert `registerEditorExtension` nach Vault-Wechsel
- Test: Plugin ohne Editor-Extensions → kein Effekt durch den Fix

### Property-Based Tests

- Generiere zufällige Sequenzen von Plugin-Method-Calls (addCommand, registerView, registerEditorExtension gemischt) → verifiziere dass jede Methode korrekt geroutet wird
- Generiere zufällige Plugin-Activate/Deactivate-Zyklen → verifiziere dass Cleanup immer alle Registrierungen entfernt (inkl. Extensions)

### Integration Tests

- Lade ein Plugin das `registerEditorExtension` aufruft → verifiziere dass die Extension im Editor-State erscheint
- Deaktiviere das Plugin → verifiziere dass die Extension aus dem Editor entfernt wird (Compartment reconfigured zu leer)
- Vault-Wechsel mit aktivem Extension-Plugin → verifiziere sauberen Übergang
