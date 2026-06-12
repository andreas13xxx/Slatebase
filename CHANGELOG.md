# Changelog

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
