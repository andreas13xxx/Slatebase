# Bugfix Requirements Document

## Introduction

Das "Editing Toolbar" Obsidian-Plugin (und andere Plugins, die `registerEditorExtension()` oder `registerEditorSuggest()` nutzen) können ihre CM6-Extensions nicht registrieren. Die Methoden auf der Plugin-Klasse sind No-Op-Stubs und werden NICHT an die vorhandene `registerPluginExtension()`/`registerPluginCompletionSource()` Infrastruktur in `plugin-extensions.ts` weitergeleitet. Dadurch erscheint die Plugin-Toolbar nicht im Editor, obwohl das Plugin korrekt geladen und aktiviert wird.

Die CM6-Integration (Compartments, `getActivePluginExtensions()`, `CodeMirrorEditor.tsx` Einbindung) existiert bereits vollständig — nur die Verdrahtung zwischen Plugin-Instanz und dieser Infrastruktur fehlt.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN ein Plugin `this.registerEditorExtension(extension)` aufruft (z.B. Editing Toolbar registriert eine ViewPlugin-Toolbar) THEN wird der Aufruf still ignoriert (No-Op-Stub in `setting-tab.ts` und `plugin-loader.ts`), die Extension wird nicht an den CodeMirror 6 Editor übergeben und die Plugin-Toolbar erscheint nicht.

1.2 WHEN ein Plugin `this.registerEditorSuggest(suggest)` aufruft (z.B. ein Autocomplete-Plugin registriert einen Custom-Provider) THEN wird der Aufruf still ignoriert (No-Op-Stub), der Provider wird nicht in CM6's Autocompletion-System integriert und Plugin-Autocomplete funktioniert nicht.

1.3 WHEN ein Plugin deaktiviert wird, das zuvor Extensions registriert hätte THEN gibt es keine Cleanup-Logik für Plugin-CM6-Extensions in `cleanupPluginRegistrations()`, weil nie Extensions registriert wurden.

### Expected Behavior (Correct)

2.1 WHEN ein Plugin `this.registerEditorExtension(extension)` aufruft THEN SHALL das System die Extension via `registerPluginExtension(pluginId, extension)` an den `PluginExtensionManager` weiterleiten, der sie in einem dedizierten Compartment kapselt und sofort im aktiven Editor anwendet (falls vorhanden) oder beim nächsten Editor-Mount einbindet.

2.2 WHEN ein Plugin `this.registerEditorSuggest(suggest)` aufruft THEN SHALL das System den Suggest-Provider via `registerPluginCompletionSource(pluginId, source)` registrieren, sodass er in CM6's Autocompletion-System verfügbar ist.

2.3 WHEN ein Plugin deaktiviert wird oder bei Vault-Wechsel entladen wird THEN SHALL das System `removePluginExtensions(pluginId)` und `removePluginCompletionSources(pluginId)` aufrufen, um alle CM6-Extensions und Completion-Sources dieses Plugins sauber zu entfernen, ohne den Editor neu laden zu müssen.

### Unchanged Behavior (Regression Prevention)

3.1 WHEN ein Plugin `this.addCommand(command)` aufruft THEN SHALL das System CONTINUE TO den Command in der CommandRegistry registrieren (bestehende Verdrahtung in `onPluginInstantiated` bleibt unverändert).

3.2 WHEN ein Plugin `this.registerView(viewType, creator)` aufruft THEN SHALL das System CONTINUE TO die View im ViewRegistry registrieren und Plugin-View-Tabs korrekt öffnen.

3.3 WHEN ein Plugin, das KEINE CM6-Extensions registriert, geladen und aktiviert wird THEN SHALL das System CONTINUE TO normal funktionieren ohne zusätzliche Fehler oder Performance-Einbußen.

3.4 WHEN der Editor ohne aktive Plugins gemountet wird THEN SHALL CodeMirrorEditor CONTINUE TO die leere `getActivePluginExtensions()` Liste korrekt verarbeiten (keine Fehler bei leerer Extension-Liste).

3.5 WHEN die Vault-Wechsel-Logik alle Plugins entlädt THEN SHALL das System CONTINUE TO die bestehenden Cleanups durchführen (Commands, SettingTabs, RibbonIcons, StatusBar, FileViewMatchers, Views) plus zusätzlich die CM6-Extension-Cleanup.
