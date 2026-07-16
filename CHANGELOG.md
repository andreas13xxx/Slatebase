# Changelog

## [0.11.0](https://github.com/andreas13xxx/Slatebase/compare/v0.10.2...v0.11.0) (2026-07-16)


### Features

* conflict wizard, auto-resolution, status bar, appearance settings, plugin compat improvements - Sync conflict resolution: 3-step wizard (overview, category detail, resolution), Myers diff algorithm, merge preview, batch operations, SSE live updates - Auto-resolution engine: newer_wins, remote_wins, local_wins, skip strategies with per-vault persistent configuration - Conflict categorizer: content_conflict, local_deleted, remote_deleted, rename_conflict - Conflict resolver: atomic resolve with rollback, batch max 100, error isolation - Status bar: clock, extensible plugin items, toggleable in Settings - Appearance section in Settings (status bar toggle) - Session verification: checkSessionAlive() on app mount, graceful expiry - Plugin compat: workspace.trigger/vault.trigger now fully supported, VaultShim.create() is create-or-get (Calendar plugin compat), ribbon icon registry, tab-view-bridge, plugin event bridge improvements - Welcome vault templates: DE + EN content updates - Steering docs updated (structure, product, lessons-learned) - Test fixes: settingsRegistry (15 sections), compatibility-analyzer, vault-shim, workspace-shim, App.test.tsx (checkSessionAlive mock) ([b1c5283](https://github.com/andreas13xxx/Slatebase/commit/b1c5283369b0be171180eb18532445c975ef3f03))


### Bugfixes

* resolve all ESLint errors in plugin-context, ConflictWizard, DiffView - plugin-context.ts: suppress react-hooks/refs (intentional ref reads for stable singleton context values), react-hooks/immutability (window.app mutations required for Obsidian plugin compat) - ConflictWizard.tsx: move apiClientRef update to useEffect, rename unused err to _err, suppress set-state-in-effect (idiomatic loading pattern), suppress react-refresh/only-export-components (co-located reducer) - DiffView.tsx: move useMemo before early return (hooks must be unconditional) ([8703174](https://github.com/andreas13xxx/Slatebase/commit/870317443d85c1dfffab9cd980aa517e94a31095))

## [0.10.2](https://github.com/andreas13xxx/Slatebase/compare/v0.10.1...v0.10.2) (2026-07-12)


### Bugfixes

* prevent path traversal via plugin ID in manifest and routes - Add strict regex validation (^[a-z0-9][a-z0-9-]{0,63}$) to pluginManifestSchema - Export isValidPluginId() utility for route parameter checks - Add path containment guard in PluginStore.getPluginDir() (defense-in-depth) - Validate :pluginId route params in all 7 plugin endpoints - Add 35 unit tests covering traversal attempts, forbidden chars, schema integration ([1fb7a0c](https://github.com/andreas13xxx/Slatebase/commit/1fb7a0cd68de33cba15f39021bd7edd857bfd2da))
* prevent registry race conditions with async mutex - Add AsyncMutex class (promise-based queue for serializing async ops) - Wrap VaultRegistry.addEntry/removeEntry with mutex.runExclusive() - Wrap VaultShareRegistry add/remove/removeAll/updatePermission - Prevents lost writes when concurrent requests hit read-modify-write ([22661ca](https://github.com/andreas13xxx/Slatebase/commit/22661caa0af02138703b68ba3d710baa88301871))


### Sonstige Änderungen

* add ESLint to backend with CI integration - Add eslint.config.js (flat config, ESLint 10, typescript-eslint) - Add lint script to package.json - Fix 6 pre-existing lint issues (unused vars, useless escape, empty catch) - Add npm run lint step to backend CI job in ci.yml ([7bfdd2c](https://github.com/andreas13xxx/Slatebase/commit/7bfdd2c8f73beb5dae145eed4ee116cd6a625d7e))

## [0.10.1](https://github.com/andreas13xxx/Slatebase/compare/v0.10.0...v0.10.1) (2026-07-12)


### Sonstige Änderungen

* harden SSE auth, add request-id middleware, extract frontend modules ([f657220](https://github.com/andreas13xxx/Slatebase/commit/f657220e8ca5058126167d6b6644a377b99c668d))
* harden SSE auth, add request-id middleware, extract frontend modules ([2944464](https://github.com/andreas13xxx/Slatebase/commit/2944464fb234bc54012cd224cf290f7d6cbf382b))

## [0.10.0](https://github.com/andreas13xxx/Slatebase/compare/v0.9.0...v0.10.0) (2026-06-26)


### Features

* implement block references (Task 12) ([cdc3042](https://github.com/andreas13xxx/Slatebase/commit/cdc3042355a45ba1e4546c639c8f892abbfd153f))


### Bugfixes

* resolve TS2783 duplicate property errors in marker-serializer ([ffffa33](https://github.com/andreas13xxx/Slatebase/commit/ffffa333f0596779393f2f9988c2256ba9c2fbfa))

## [0.9.0](https://github.com/andreas13xxx/Slatebase/compare/v0.8.0...v0.9.0) (2026-06-20)


### Features

* Obsidian Canvas support with node editing and file-path search ([59c5929](https://github.com/andreas13xxx/Slatebase/commit/59c59291b367d9c4e81410f982d2244abd440bcf))


### Bugfixes

* close unclosed CSS rule in CanvasView.css causing production build failure ([dfa76ac](https://github.com/andreas13xxx/Slatebase/commit/dfa76aca398fe7cec29d76f614a0a77ed5f8d109))

## [0.8.0](https://github.com/andreas13xxx/Slatebase/compare/v0.7.0...v0.8.0) (2026-06-18)


### Features

* add welcome vault for new users ([f41927d](https://github.com/andreas13xxx/Slatebase/commit/f41927dcda9118c35312962c110cd3b15bd9c866))
* add welcome vault for new users ([efca592](https://github.com/andreas13xxx/Slatebase/commit/efca5920d05b8f320cb4c23351e322cedab33107))

## [0.7.0](https://github.com/andreas13xxx/Slatebase/compare/v0.6.0...v0.7.0) (2026-06-18)


### Features

* add login version display and remove realtime feature toggle Task 1: Login Version Display - Add version fetch (useEffect + AbortController) to LoginPage - Display version below login form (v-prefix, 'dev' for development) - Add .login-version CSS class with design tokens - Add 4 unit tests for version display Task 2: Realtime Cleanup - Remove 'realtime' feature toggle registration from backend - Remove featureGuard from SSE route deps and middleware chain - Remove onChange listener for realtime toggle (broadcast + shutdown) - Remove isEnabled('realtime') check from HTTP handler - Remove dead connectionManager mutable reference - Remove 'fallback' from ConnectionStatus type - Remove featureEnabled prop from RealtimeProvider - Remove server:feature-disabled event handler - Remove onPollingEnabled/onPollingDisabled callbacks - Remove --connection-fallback CSS token - Simplify ConnectionIndicator (always visible, no visible prop) - Update RealtimeBridge (no isEnabled check needed) - Add EventSource mock to test-setup.ts (jsdom compat) - Add getVersion to App.test.tsx MockApiClient Documentation updated: implementation-plan, specs-overview, lessons-learned, product.md ([2f8eb99](https://github.com/andreas13xxx/Slatebase/commit/2f8eb99097fbd4d7c7ff882c36b57390c5db0a89))
* add Mermaid diagram rendering to ViewMode ([0b4eb47](https://github.com/andreas13xxx/Slatebase/commit/0b4eb4799efe9da25523a212e67177b842291350))
* decouple Command Palette from plugin-compat, add 40+ built-in commands ([f21d0c4](https://github.com/andreas13xxx/Slatebase/commit/f21d0c40aefcf759510001b79e0425f13e13bf52))
* per-user preferences, per-vault config, configurable keybindings - Add server-persistent recent files & favorites (per user) - New backend module: preferences/ (types, store, validation) - API endpoints: GET/PUT /users/me/recent-files, /favorites, /keybindings - Frontend stores sync to backend with 2s debounce, localStorage as cache - Add per-vault configuration (templates dir, daily notes dir) - New backend module: vault-config/ (types, store, validation) - API endpoints: GET/PUT /vaults/:vaultId/config (owner-only write) - TemplateService reads per-vault templates directory (fallback to global) - DailyNoteService reads per-vault config from server - Add configurable keyboard shortcuts - New frontend module: keybindingsStore.ts (14 commands, 4 categories) - Platform-agnostic Mod key (Ctrl on Win/Linux, Meta on Mac) - matchesShortcut() replaces all hardcoded shortcut checks - Refactored: App.tsx, CommandPaletteContainer, SettingsPanel, EditMode - Settings UI additions - New section: Tastaturkuerzel (account category) - New section: Vault-Konfiguration (vault category) - Inline shortcut recording with conflict detection - Update docs: product.md, structure.md, specs-overview.md, lessons-learned.md, implementation-plan.md ([96c3966](https://github.com/andreas13xxx/Slatebase/commit/96c396678b9941fbef0e292efb1d04390e8cd511))
* preferences, vault config, keybindings, mermaid, command palette, unified settings ([2501e70](https://github.com/andreas13xxx/Slatebase/commit/2501e70ef905930bdbeb4fdb2ee68e1580af37a6))
* unified settings panel Consolidates all scattered settings pages into a single categorized panel. - SettingsProvider with useReducer + createSettingsReducer(isAdmin) factory - 3 categories: Konto, Vault, Administration (12 sections total) - CSS Container Query responsive layout (700px threshold) - Ctrl+, shortcut + toolbar gear button - Search with 150ms debounce, sessionStorage persistence - ARIA landmarks, keyboard navigation, focus management - Vault settings use active vault from app state - ProfilePage profile-only mode, embedded ChangePasswordPage - AdminConfigPage hideFeatureToggles, ServerRestartSection - AccountDeletionSection + FeatureTogglesSection extracted - Removed redundant toolbar buttons (profile, sessions, etc.) - Renamed API-Tokens to MCP-Tokens throughout - 116 settings-related tests, all passing ([04f81e2](https://github.com/andreas13xxx/Slatebase/commit/04f81e29a81e3fe3111affa9b194119b90595358))


### Bugfixes

* correct showToast argument order, remove unused React import ([bab577f](https://github.com/andreas13xxx/Slatebase/commit/bab577f5e34b6149bc99d868047c641efbce0669))


### Sonstige Änderungen

* add gitignore for vitest-output, add hook and unified-settings spec ([e1fa694](https://github.com/andreas13xxx/Slatebase/commit/e1fa694bf9875af184b161e310b1ccdb442ef539))

## [0.6.0](https://github.com/andreas13xxx/Slatebase/compare/v0.5.2...v0.6.0) (2026-06-17)


### Features

* tier2-daily-workflow (vault explorer, editor, trash, versioning) ([75a518d](https://github.com/andreas13xxx/Slatebase/commit/75a518d8b42d3453f358d6267fd0aaf1db928dd4))


### Sonstige Änderungen

* add specs for tier2-daily-workflow, login-version-display, welcome-vault, realtime-cleanup, knowledge-graph-v2, collaborative-editing, sync-conflict-resolution ([fe87849](https://github.com/andreas13xxx/Slatebase/commit/fe878495c7803745beb26bb68156330771e77199))

## [0.5.2](https://github.com/andreas13xxx/Slatebase/compare/v0.5.1...v0.5.2) (2026-06-14)


### Bugfixes

* wire presence indicators to ConversationList via module-level br… ([4deaa06](https://github.com/andreas13xxx/Slatebase/commit/4deaa064d6d014982413e8d12ee63e999413726b))

## [0.5.1](https://github.com/andreas13xxx/Slatebase/compare/v0.5.0...v0.5.1) (2026-06-14)


### Sonstige Änderungen

* restructure documentation for end-users vs contributors ([7fdfcc8](https://github.com/andreas13xxx/Slatebase/commit/7fdfcc85296c65cf8734ff7164d9d12ad7b16975))

## [0.5.0](https://github.com/andreas13xxx/Slatebase/compare/v0.4.0...v0.5.0) (2026-06-14)


### Features

* realtime infrastructure with SSE push notifications ([45a6488](https://github.com/andreas13xxx/Slatebase/commit/45a648855a737cc8e4365c2e06be9798e184c275))

## [0.4.0](https://github.com/andreas13xxx/Slatebase/compare/v0.3.3...v0.4.0) (2026-06-13)


### Features

* add vault-wide full-text search and replace (Phase 1) ([2845f0d](https://github.com/andreas13xxx/Slatebase/commit/2845f0dae6a7825e52c5fcfd69b416c952197a66))


### Bugfixes

* remove any casts in search adapter, use unknown return types ([88dd8a6](https://github.com/andreas13xxx/Slatebase/commit/88dd8a6fcc60b12fc793de34b31879cfaf12617b))
* resolve lint errors in search panel and related files ([36e6e99](https://github.com/andreas13xxx/Slatebase/commit/36e6e99b0a671026563d8cf5afea63ed599aca0d))

## [0.3.3](https://github.com/andreas13xxx/Slatebase/compare/v0.3.2...v0.3.3) (2026-06-12)


### Bugfixes

* knowledge graph shows stale data when switching vaults ([ba7e7b6](https://github.com/andreas13xxx/Slatebase/commit/ba7e7b6db214c321423429f99902679b5f34a97f))

## [0.3.2](https://github.com/andreas13xxx/Slatebase/compare/v0.3.1...v0.3.2) (2026-06-12)


### Bugfixes

* graph tab displays vault name instead of hardcoded 'Graph' ([e1d2952](https://github.com/andreas13xxx/Slatebase/commit/e1d295241e80748e6e59cd8203a423353b0df1c7))

## [0.3.1](https://github.com/andreas13xxx/Slatebase/compare/v0.3.0...v0.3.1) (2026-06-12)


### Bugfixes

* graph tab now shows correct vault and includes vault name in tab title ([22ce71e](https://github.com/andreas13xxx/Slatebase/commit/22ce71ea0eab27a025998a98d64d793195365cdb))

## [0.3.0](https://github.com/andreas13xxx/Slatebase/compare/v0.2.0...v0.3.0) (2026-06-12)


### Features

* persist feature toggle state across container restarts ([2d384b9](https://github.com/andreas13xxx/Slatebase/commit/2d384b981f44bf4a13ce38345b9c2748bdadb23f))
* show version badge and update hint in sidebar header ([68d2711](https://github.com/andreas13xxx/Slatebase/commit/68d2711fed984f9538600a85909e587463ea9f9d))


### Bugfixes

* copy version.json into Docker image ([084377b](https://github.com/andreas13xxx/Slatebase/commit/084377b2f165344c9e2d93fe274d582278bca1a8))
* server restart endpoint now actually exits the process ([fc8de04](https://github.com/andreas13xxx/Slatebase/commit/fc8de04a714b76d3fe5ae6bbacc8084f8a4d46ed))


### Sonstige Änderungen

* split docker-compose into production and dev variants ([3f9346f](https://github.com/andreas13xxx/Slatebase/commit/3f9346ffcb58b5004fe15fb63850ca22b0b4b117))

## [0.2.0](https://github.com/andreas13xxx/Slatebase/compare/v0.1.0...v0.2.0) (2026-06-12)


### Features

* Authentifizierung, Nutzerverwaltung und Vault-Freigaben ([a28c8df](https://github.com/andreas13xxx/Slatebase/commit/a28c8dfe973fea5e4a2047de6b398823c0a97438))
* Chat-System, Chat-Enhancements, CONTRIBUTING.md und Steering-Updates ([d0a03c7](https://github.com/andreas13xxx/Slatebase/commit/d0a03c746dcd9066798ae6e4663f82e141b28832))
* CI/CD-Release-Pipeline und Version-Check ([e62a27f](https://github.com/andreas13xxx/Slatebase/commit/e62a27f5515f21d266f7b9871c331bcb92ec6ac2))
* ConfirmModal, Toast-Komponenten und Push-Regel in Steering ([2683766](https://github.com/andreas13xxx/Slatebase/commit/2683766e68ffab8ad99a9a7fa505e4d5402f7645))
* Context Panel, Knowledge Graph, Sync-Verbesserungen ([a0245ac](https://github.com/andreas13xxx/Slatebase/commit/a0245ac6c45f5881e714632640e65501e14dfd24))
* Dateiendungen ausblenden und typspezifische Icons im Explorer und Tabs ([99eaa72](https://github.com/andreas13xxx/Slatebase/commit/99eaa724375a7282841ee382b6c6568cb0049b91))
* Demo-GIF und Playwright-Aufnahme-Script hinzugefuegt ([6921bc3](https://github.com/andreas13xxx/Slatebase/commit/6921bc37b7899b90bc248dc0ec23698e93be6db0))
* Docker-Deployment-Setup (Dockerfiles, Compose, Nginx, Doku) ([055d94c](https://github.com/andreas13xxx/Slatebase/commit/055d94c2faa536cabff05feb02e983e680c26c3d))
* Erweiterte Dateioperationen (Drag&Drop, Kontextmenü, Linkerstellung) ([732f9dc](https://github.com/andreas13xxx/Slatebase/commit/732f9dca0e1b3b42e0f425ce2ac97dc92a7028f4))
* Frontend-Redesign mit modernem Look, Lucide Icons und Bug-Fixes ([40ea4fe](https://github.com/andreas13xxx/Slatebase/commit/40ea4fef642a3dd7c130e7ab6ffb0f127b41a9c9))
* i18n (DE/EN), Color Scheme, einklappbare Sidebar, PDF-Viewer ([918f39e](https://github.com/andreas13xxx/Slatebase/commit/918f39e2bcdc2b167e5046bf96b488a6cd8345fe))
* MCP Context Server, Obsidian-Markdown-Plugins, Sync/Chat-Verbesserungen ([c8acd53](https://github.com/andreas13xxx/Slatebase/commit/c8acd53855b940e8bd20dfded8ad97f8d6a421f4))
* MCP Write-Tools, Plugin-Compat-Layer (Frontend+Backend), Steering-Updates ([8626531](https://github.com/andreas13xxx/Slatebase/commit/8626531559e633e1b771a8e75eaae464b879abdc))
* persistent vault management with full CRUD lifecycle ([fcdd857](https://github.com/andreas13xxx/Slatebase/commit/fcdd8575b2994c66cbbfc4296d915b44607b2a4f))
* tabbed editor with file save, binary viewer, and view/edit modes ([7227f2a](https://github.com/andreas13xxx/Slatebase/commit/7227f2a4cd712202c155c819f1500902a7d8d78f))
* Unified File Explorer, Client-IP-Erkennung, PDF-Embeds, Multi-Vault-Trees ([cf868a2](https://github.com/andreas13xxx/Slatebase/commit/cf868a222cf2e4c94784337e6edb2000bd4ef598))
* Vault-Export (File System Access API + ZIP-Fallback) ([d13fb78](https://github.com/andreas13xxx/Slatebase/commit/d13fb783bf96e9ce8e0c99551027452dd4912716))
* Vault-Sync-Modul, Vault-Status-Indikatoren und Lösch-Workflow-Verbesserungen ([9c85bbe](https://github.com/andreas13xxx/Slatebase/commit/9c85bbef063281b0fbe9724cd0d53f38ddfc9e34))
* Vault-Zugriffskontrolle, Sharing-UI, UX-Verbesserungen ([8024a85](https://github.com/andreas13xxx/Slatebase/commit/8024a857ea10e78e1c715beabea96c5266bb73d8))
* Zentrales Feature-Toggle-System implementiert ([6eb2272](https://github.com/andreas13xxx/Slatebase/commit/6eb22720b1c28dfe8d724759b6658f2ef2441d08))


### Bugfixes

* Backend-Dockerfile auf tsc-Build umgestellt (strip-types löst .js-Imports nicht auf) ([a11a7e3](https://github.com/andreas13xxx/Slatebase/commit/a11a7e3db1a1e3d61ac370886352e30e314b77ed))
* i18n-Typsystem für Docker-Build (TranslationShape + TranslateFn, test-setup exclude) ([d0abc45](https://github.com/andreas13xxx/Slatebase/commit/d0abc458819cf4d43a2092779849d430f1bf85a1))
* resolve all frontend ESLint errors (101 errors -&gt; 0) ([60e16c2](https://github.com/andreas13xxx/Slatebase/commit/60e16c20e317ca62c9060176f76fba9ee5c79463))
* Session-Expiry-Probleme behoben ([3e8988b](https://github.com/andreas13xxx/Slatebase/commit/3e8988bd7b1c0e0bdd640a912e327a40cd85d585))
* skip auth middleware for public /api/v1/version endpoint ([a34ad51](https://github.com/andreas13xxx/Slatebase/commit/a34ad516cac81abce0c13355edc3f3857d634d7f))
* trigger release workflow on master branch (not main) ([255df65](https://github.com/andreas13xxx/Slatebase/commit/255df65034ee867bd657b43616b17a4496e741c8))
* TypeScript-Fehler in Backend-Test-Dateien behoben ([176aa19](https://github.com/andreas13xxx/Slatebase/commit/176aa195734301767942b4b3e19bf6cfe4b5e766))
* TypeScript-Fehler in featureRoutes.test.ts behoben ([7a8412c](https://github.com/andreas13xxx/Slatebase/commit/7a8412c852be17bc4bbdd530eab1c3680e0b60a3))
* use simple release-type and updated release-please action ([134237f](https://github.com/andreas13xxx/Slatebase/commit/134237f8e4f752fd09d6b3f1519c8e39ed1bf846))


### Sonstige Änderungen

* feature-toggles aus Geplante Specs entfernt (bereits fertig) ([33c5459](https://github.com/andreas13xxx/Slatebase/commit/33c5459d8b59ce4fd52f9777c6521adab30598f0))
* fix EditMode and PluginRegistry test assertions ([e02c6eb](https://github.com/andreas13xxx/Slatebase/commit/e02c6eb235f67bd2c0de38343096f2dbfa7cf61d))
* README, AGENTS, DEPLOYMENT und LICENSE aktualisieren ([e174ba3](https://github.com/andreas13xxx/Slatebase/commit/e174ba3a0e122b0f6bf084add353b26223ba50d2))
* README.md ins Hauptverzeichnis verschoben ([a478e85](https://github.com/andreas13xxx/Slatebase/commit/a478e855239694d3c9d4e8dec4ba3ab57b19f97b))
* remove flaky sync PBT tests ([47af8a8](https://github.com/andreas13xxx/Slatebase/commit/47af8a8b99096adbb500b37796a7dd821c32fd16))
* Steering Files hinzufügen und aktualisieren ([f04bc4f](https://github.com/andreas13xxx/Slatebase/commit/f04bc4f6d231132b63052989e4d9f4f1c61b0f3d))
* Steering-Dateien mit Erkenntnissen aus Frontend-Redesign aktualisiert ([858d500](https://github.com/andreas13xxx/Slatebase/commit/858d500e10c59f3dc565e71794722b8414c389aa))
* Steerings und AGENTS.md aktualisiert ([9d09dd5](https://github.com/andreas13xxx/Slatebase/commit/9d09dd597b8d44435a6e385ad2530462bc918a98))
* switch commit messages to English ([150b677](https://github.com/andreas13xxx/Slatebase/commit/150b677b2d109448881f96f994c649b01bcbcbf8))
* Sync und Plugin-Compat als experimentell markiert ([3134108](https://github.com/andreas13xxx/Slatebase/commit/313410822aed8972d389c5a9001d891cb37087ab))
