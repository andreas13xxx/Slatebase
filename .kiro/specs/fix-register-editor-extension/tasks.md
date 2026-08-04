# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - registerEditorExtension is a No-Op
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists
  - **Scoped PBT Approach**: Scope the property to the concrete case: a plugin calling `registerEditorExtension(extension)` where the extension should appear in `getActivePluginExtensions()` but does not
  - Create a test file `frontend/src/plugins/compat/plugin-context.editor-extension.test.ts`
  - Mock `registerPluginExtension` and `registerPluginCompletionSource` from `editor/plugin-extensions`
  - Instantiate a Plugin via `onPluginInstantiated` callback (simulate the wiring that happens in plugin-context.ts)
  - Call `instance.registerEditorExtension([])` with a mock CM6 Extension
  - Assert that `registerPluginExtension` was called with `(pluginId, extension)` — this will FAIL on unfixed code (No-Op stub)
  - Call `instance.registerEditorSuggest({ provider: mockCompletionSource })` with a mock provider
  - Assert that `registerPluginCompletionSource` was called with `(pluginId, mockCompletionSource)` — this will FAIL on unfixed code
  - Also test that `cleanupPluginRegistrations(pluginId)` calls `removePluginExtensions(pluginId)` and `removePluginCompletionSources(pluginId)` — this will FAIL on unfixed code
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists: registerEditorExtension is a No-Op, registerEditorSuggest is a No-Op, cleanup doesn't remove extensions)
  - Document counterexamples: `registerPluginExtension` never called despite `instance.registerEditorExtension(ext)` being invoked; `removePluginExtensions` never called in cleanup
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Existing Plugin Wiring Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Create tests in the same file `frontend/src/plugins/compat/plugin-context.editor-extension.test.ts` (separate describe block)
  - Observe on UNFIXED code: `instance.addCommand(cmd)` → `commandRegistry.addCommand(pluginId, cmd)` is called correctly
  - Observe on UNFIXED code: `instance.addRibbonIcon(icon, title, cb)` → `addRibbonIcon(pluginId, icon, title, cb)` is called correctly
  - Observe on UNFIXED code: `instance.registerView(viewType, creator)` → `workspaceShim.registerView(...)` is called correctly
  - Observe on UNFIXED code: Vault-Generation-Guard blocks stale registrations when `pluginSystemVaultIdRef` changes
  - Write property-based tests covering: for all plugin method calls that are NOT `registerEditorExtension`/`registerEditorSuggest`, the routing behavior is identical before and after the fix
  - Verify test passes on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 3. Fix for registerEditorExtension/registerEditorSuggest No-Op stubs

  - [x] 3.1 Implement the fix in plugin-context.ts
    - **Change 1: Import erweitern** — Add `registerPluginExtension`, `removePluginExtensions`, `registerPluginCompletionSource`, `removePluginCompletionSources` to the import from `../../editor/plugin-extensions`
    - **Change 2: onPluginInstantiated — registerEditorExtension verdrahten** — After existing method overrides, add: `instance.registerEditorExtension = (extension) => { if (vault-gen-guard) return; registerPluginExtension(pluginId, extension) }`
    - **Change 3: onPluginInstantiated — registerEditorSuggest verdrahten** — Add: `instance.registerEditorSuggest = (suggest) => { if (vault-gen-guard) return; if (typeof suggest.provider === 'function') registerPluginCompletionSource(pluginId, suggest.provider) }`
    - **Change 4: cleanupPluginRegistrations — Extension-Cleanup** — Add `removePluginExtensions(pluginId)` and `removePluginCompletionSources(pluginId)` to the cleanup function
    - _Bug_Condition: isBugCondition(input) where input.methodName IN ['registerEditorExtension', 'registerEditorSuggest'] AND extension not routed to PluginExtensionManager_
    - _Expected_Behavior: Extension is registered via registerPluginExtension(pluginId, extension) and appears in getActivePluginExtensions(); cleanup removes it_
    - _Preservation: All existing wirings (addCommand, registerView, addRibbonIcon, addSettingTab, registerExtensions, registerMarkdownCodeBlockProcessor) unchanged_
    - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 3.2 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - registerEditorExtension routed to PluginExtensionManager
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior (registerPluginExtension called, removePluginExtensions called in cleanup)
    - When this test passes, it confirms the expected behavior is satisfied
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.3 Verify preservation tests still pass
    - **Property 2: Preservation** - Existing Plugin Wiring Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all tests still pass after fix (no regressions)

- [x] 4. Checkpoint - Ensure all tests pass
  - Run full frontend test suite: `npm run test` in `frontend/`
  - Run frontend build: `npm run build` in `frontend/` (TypeScript type-check)
  - Run frontend lint: `npx eslint . --quiet` in `frontend/`
  - Ensure all checks pass, ask the user if questions arise.
