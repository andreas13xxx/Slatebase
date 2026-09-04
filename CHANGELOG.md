# Changelog

## [0.42.2](https://github.com/andreas13xxx/Slatebase/compare/v0.42.1...v0.42.2) (2026-09-04)


### Bugfixes

* close real-plugin CSP gaps found once the SPA document policy went live ([#146](https://github.com/andreas13xxx/Slatebase/issues/146)) ([421f85c](https://github.com/andreas13xxx/Slatebase/commit/421f85c4b7be59efae41c6057c7c2419da66b943))


### Sonstige Änderungen

* bump zod from 3.25.76 to 4.5.4 in /backend ([#135](https://github.com/andreas13xxx/Slatebase/issues/135)) ([2171bef](https://github.com/andreas13xxx/Slatebase/commit/2171befaaea2a63b7c7798b6695ff65f7cc832e7))

## [0.42.1](https://github.com/andreas13xxx/Slatebase/compare/v0.42.0...v0.42.1) (2026-09-04)


### Sonstige Änderungen

* bump the minor-patch group across 1 directory with 7 updates ([#144](https://github.com/andreas13xxx/Slatebase/issues/144)) ([0f7ccb9](https://github.com/andreas13xxx/Slatebase/commit/0f7ccb965c9f572258bdf6f9ee5826e253a5dadc))

## [0.42.0](https://github.com/andreas13xxx/Slatebase/compare/v0.41.3...v0.42.0) (2026-09-04)


### ⚠ BREAKING CHANGES

* **backend:** an empty/unset SLATEBASE_PROXY_ALLOWED_ORIGINS now disables the proxy entirely (403 PROXY_NOT_CONFIGURED) instead of allowing every public address. Plugins using requestUrl() need the env var set to their target hosts to keep working. Documented in docker.env.example and README.md.

### Features

* **backend:** default-deny plugin proxy + DNS-rebinding fix, serve CSP on the SPA document ([#142](https://github.com/andreas13xxx/Slatebase/issues/142)) ([ae71308](https://github.com/andreas13xxx/Slatebase/commit/ae71308632798e94f2078c59ff8714419fa19c65))

## [0.41.3](https://github.com/andreas13xxx/Slatebase/compare/v0.41.2...v0.41.3) (2026-09-04)


### Sonstige Änderungen

* refresh steering, plugin-compat, and welcome vault docs; add wikilink support to plugin markdown renderer ([2d1f97b](https://github.com/andreas13xxx/Slatebase/commit/2d1f97b0941636fd60b736aeef5ffbab52a433dc))

## [0.41.2](https://github.com/andreas13xxx/Slatebase/compare/v0.41.1...v0.41.2) (2026-09-03)


### Sonstige Änderungen

* bump the minor-patch group across 1 directory with 10 updates ([#136](https://github.com/andreas13xxx/Slatebase/issues/136)) ([9827498](https://github.com/andreas13xxx/Slatebase/commit/98274988c5da46009d48962c963efb5440c4acc4))

## [0.41.1](https://github.com/andreas13xxx/Slatebase/compare/v0.41.0...v0.41.1) (2026-09-03)


### Bugfixes

* **backend:** bump fast-uri and qs to close high/moderate audit findings ([081d139](https://github.com/andreas13xxx/Slatebase/commit/081d13967761f01769b7cdd1e75dc7e300232bd7))
* **frontend:** bump browserslist, nanoid, and @babel/core transitives to close audit findings ([dc5cc84](https://github.com/andreas13xxx/Slatebase/commit/dc5cc848ecca3cf1905a80babc66bdb43ff4ace9))

## [0.41.0](https://github.com/andreas13xxx/Slatebase/compare/v0.40.1...v0.41.0) (2026-09-03)


### Features

* nested tag hierarchy, live tag overlay, and link-index folder handling ([ff2aa69](https://github.com/andreas13xxx/Slatebase/commit/ff2aa695bacf0191822dce75e9d4b32e55699d29))

## [0.40.1](https://github.com/andreas13xxx/Slatebase/compare/v0.40.0...v0.40.1) (2026-09-01)


### Bugfixes

* frontmatter null handling, date property control, and Obsidian 1.13 Setting row APIs ([b160498](https://github.com/andreas13xxx/Slatebase/commit/b160498afbafe0c7188249e454aaaafe1f009029))

## [0.40.0](https://github.com/andreas13xxx/Slatebase/compare/v0.39.0...v0.40.0) (2026-09-01)


### Features

* built-in spellchecker, account/vault-scoped settings sync, footnotes ([395d497](https://github.com/andreas13xxx/Slatebase/commit/395d497b6eba91f333526138c021739a59f0d63a))

## [0.39.0](https://github.com/andreas13xxx/Slatebase/compare/v0.38.0...v0.39.0) (2026-08-30)


### Features

* MCP binary file support, customizable toolbar, and template insert mode ([7d13b4f](https://github.com/andreas13xxx/Slatebase/commit/7d13b4f6cc78ad4b73c08f1893ffa163c3d51a17))

## [0.38.0](https://github.com/andreas13xxx/Slatebase/compare/v0.37.2...v0.38.0) (2026-08-29)


### Features

* Git Sync and Mail Import features, MCP realtime writes, settings/editor polish ([37fb31a](https://github.com/andreas13xxx/Slatebase/commit/37fb31a77777133d718cd382a3030d7db500b20f))

## [0.37.2](https://github.com/andreas13xxx/Slatebase/compare/v0.37.1...v0.37.2) (2026-08-28)


### Sonstige Änderungen

* bump the minor-patch group in /backend with 4 updates ([#125](https://github.com/andreas13xxx/Slatebase/issues/125)) ([a61ef23](https://github.com/andreas13xxx/Slatebase/commit/a61ef23c507e99de22ebb552b79e8bf6f61ac5ee))
* bump the minor-patch group in /frontend with 11 updates ([#126](https://github.com/andreas13xxx/Slatebase/issues/126)) ([19e8545](https://github.com/andreas13xxx/Slatebase/commit/19e854539458960cfa58448e2463c051e104594a))

## [0.37.1](https://github.com/andreas13xxx/Slatebase/compare/v0.37.0...v0.37.1) (2026-08-26)


### Bugfixes

* MCP token list previews masked the token hash instead of the raw token ([7384357](https://github.com/andreas13xxx/Slatebase/commit/7384357a08c97c27dd1c31da83f77ce41793e44d))

## [0.37.0](https://github.com/andreas13xxx/Slatebase/compare/v0.36.1...v0.37.0) (2026-08-26)


### Features

* spellcheck, release notes/debug modals, canvas markdown export, and plugin-compat improvements ([0dd03ee](https://github.com/andreas13xxx/Slatebase/commit/0dd03ee2ef98654e66b605e4c6231c0f15ab2967))

## [0.36.1](https://github.com/andreas13xxx/Slatebase/compare/v0.36.0...v0.36.1) (2026-08-25)


### Bugfixes

* prevent stale leaf-detach race from hiding newly opened sidebar plugin views ([60a5325](https://github.com/andreas13xxx/Slatebase/commit/60a5325d59ca8299a12247e9fbc7cbe7bd4d1873))
* stop CRLF/LF text normalization from corrupting binary template assets ([2a65f6f](https://github.com/andreas13xxx/Slatebase/commit/2a65f6fa2abc77a740a64903c4e1a5405c733b20))

## [0.36.0](https://github.com/andreas13xxx/Slatebase/compare/v0.35.0...v0.36.0) (2026-08-24)


### Features

* context menu overhaul, link counts, and plugin-compat fixes ([3c13c3a](https://github.com/andreas13xxx/Slatebase/commit/3c13c3a3c9ca0bf484d2a148655b08b8c840121b))

## [0.35.0](https://github.com/andreas13xxx/Slatebase/compare/v0.34.0...v0.35.0) (2026-08-23)


### Sonstige Änderungen

* release 0.35.0 ([c160d89](https://github.com/andreas13xxx/Slatebase/commit/c160d8921d3c372bb522faff76cda96562581039))

## [0.34.0](https://github.com/andreas13xxx/Slatebase/compare/v0.33.1...v0.34.0) (2026-08-22)


### Features

* inline frontmatter editing, settings design system, test coverage push ([b35ad1e](https://github.com/andreas13xxx/Slatebase/commit/b35ad1ef39b671b98a7fe41fad46b911c99db743))

## [0.33.1](https://github.com/andreas13xxx/Slatebase/compare/v0.33.0...v0.33.1) (2026-08-21)


### Bugfixes

* make ciphertext tamper test deterministic ([cdbb351](https://github.com/andreas13xxx/Slatebase/commit/cdbb35115a0c31830e066bb70385ebaab5303a9d))


### Sonstige Änderungen

* bump the minor-patch group in /backend with 4 updates ([#115](https://github.com/andreas13xxx/Slatebase/issues/115)) ([a67c33d](https://github.com/andreas13xxx/Slatebase/commit/a67c33dfd63b6d198517602cab0cf8cd1abe44af))
* bump the minor-patch group in /frontend with 7 updates ([#116](https://github.com/andreas13xxx/Slatebase/issues/116)) ([46cfa1b](https://github.com/andreas13xxx/Slatebase/commit/46cfa1bfa4cf68d1ff7495881725cc46db424ab0))

## [0.33.0](https://github.com/andreas13xxx/Slatebase/compare/v0.32.0...v0.33.0) (2026-08-19)


### Features

* server-side encrypted storage for plugin secrets ([9494c22](https://github.com/andreas13xxx/Slatebase/commit/9494c223de73979556e733a0ffb0067ff0fb0dcd))
* server-side encrypted storage for plugin secrets ([56e11d1](https://github.com/andreas13xxx/Slatebase/commit/56e11d10786f49949bfa086a9308f517b402abe9))


### Bugfixes

* cast Uint8Array to BufferSource for Web Crypto calls (TS 6.x / @types/node 26) ([af77280](https://github.com/andreas13xxx/Slatebase/commit/af772809280f1977180cf66afbf530a3b4c82b74))
* cast Uint8Array.buffer to ArrayBuffer for TS 6.x / @types/node 26 compat ([88c22e6](https://github.com/andreas13xxx/Slatebase/commit/88c22e625e49ccd9ede4f218a594ba44eeaa64e8))

## [0.32.0](https://github.com/andreas13xxx/Slatebase/compare/v0.31.0...v0.32.0) (2026-08-19)


### Features

* graph polish & link integrity, unified side panel, Iconize compat ([78c9885](https://github.com/andreas13xxx/Slatebase/commit/78c9885e2a8fadff31dc3542deb3833c1c42b0cb))

## [0.31.0](https://github.com/andreas13xxx/Slatebase/compare/v0.30.1...v0.31.0) (2026-08-16)


### Features

* navigation & link polish, bookmarks/status bar/CSS snippets, plugin API 1.13.2 ([6ae0140](https://github.com/andreas13xxx/Slatebase/commit/6ae01401e7b42c7b7b37e662068eb9abe44314d9))

## [0.30.1](https://github.com/andreas13xxx/Slatebase/compare/v0.30.0...v0.30.1) (2026-08-15)


### Bugfixes

* exclude Invalid Date from fc.date() arbitraries in chat state tests ([9117aca](https://github.com/andreas13xxx/Slatebase/commit/9117aca328c6d648e108922b501c4b74eb65d85f))
* update PropertiesView test to expect resolved rem→px computed styles ([d53e5b5](https://github.com/andreas13xxx/Slatebase/commit/d53e5b59678c352c80b802c7f55ccb4678bf93ad))
* use ZodError.issues instead of the deprecated .errors alias ([a937679](https://github.com/andreas13xxx/Slatebase/commit/a9376796d30db761708caf0bd56b18092134590b))


### Sonstige Änderungen

* bump actions/setup-node from 4 to 7 ([#102](https://github.com/andreas13xxx/Slatebase/issues/102)) ([7fe1b21](https://github.com/andreas13xxx/Slatebase/commit/7fe1b216203efa216972fdad27631eb72544ec56))
* bump fast-check from 3.23.2 to 4.9.0 in /frontend ([#108](https://github.com/andreas13xxx/Slatebase/issues/108)) ([0c7198a](https://github.com/andreas13xxx/Slatebase/commit/0c7198a189c0704652cbfd68bf4b7d12f4c048d3))
* bump googleapis/release-please-action from 4 to 5 ([#103](https://github.com/andreas13xxx/Slatebase/issues/103)) ([c142a28](https://github.com/andreas13xxx/Slatebase/commit/c142a28f690091d352be714a90c3b04c3fa5189e))
* bump jsdom from 29.1.1 to 30.0.1 in /frontend ([#109](https://github.com/andreas13xxx/Slatebase/issues/109)) ([f9a692f](https://github.com/andreas13xxx/Slatebase/commit/f9a692f27774e99dee73f53a2640aaf2dbfcee04))
* bump the minor-patch group in /backend with 4 updates ([#104](https://github.com/andreas13xxx/Slatebase/issues/104)) ([8c21ae1](https://github.com/andreas13xxx/Slatebase/commit/8c21ae16331305b74c7d7205f2cacbcf93a86474))
* bump the minor-patch group in /frontend with 10 updates ([#107](https://github.com/andreas13xxx/Slatebase/issues/107)) ([cde36e0](https://github.com/andreas13xxx/Slatebase/commit/cde36e07f8b7e0009012e08b9452f19bb0ae658d))

## [0.30.0](https://github.com/andreas13xxx/Slatebase/compare/v0.29.0...v0.30.0) (2026-08-11)


### Features

* **plugins:** harden compat layer against real community plugin bundles ([4ff8f03](https://github.com/andreas13xxx/Slatebase/commit/4ff8f03b6dac9ce2c74cd0862fb2d33fed8da1ae))

## [0.29.0](https://github.com/andreas13xxx/Slatebase/compare/v0.28.0...v0.29.0) (2026-08-10)


### Features

* accessibility audit, security hardening, and UI improvements ([e3536a6](https://github.com/andreas13xxx/Slatebase/commit/e3536a6749092733a836d5a356544b9ce18b33ee))


### Bugfixes

* correct type errors in adminRoutes and mcpTokenRoutes tests ([561075f](https://github.com/andreas13xxx/Slatebase/commit/561075f1a6f8b44a40ec3766631808e47b13378a))

## [0.28.0](https://github.com/andreas13xxx/Slatebase/compare/v0.27.2...v0.28.0) (2026-08-10)


### Features

* Obsidian API 1.8.7 audit, session robustness, polish specs ([4fe5d38](https://github.com/andreas13xxx/Slatebase/commit/4fe5d3854d1513c9227351b77ce4a2db40007c12))

## [0.27.2](https://github.com/andreas13xxx/Slatebase/compare/v0.27.1...v0.27.2) (2026-08-10)


### Sonstige Änderungen

* stop tracking TypeScript incremental build cache ([116f7b7](https://github.com/andreas13xxx/Slatebase/commit/116f7b7185816a826d55707e2eba5229ae742bba))

## [0.27.1](https://github.com/andreas13xxx/Slatebase/compare/v0.27.0...v0.27.1) (2026-08-09)


### Bugfixes

* address CodeQL findings (XSS, biased random, YAML escaping) ([d176e49](https://github.com/andreas13xxx/Slatebase/commit/d176e4929bd616c88574fb3a1c3450f3a5b3249a))


### Sonstige Änderungen

* add security policy ([4774d5e](https://github.com/andreas13xxx/Slatebase/commit/4774d5ea763f1772dd39efdbd99e5be4251616da))

## [0.27.0](https://github.com/andreas13xxx/Slatebase/compare/v0.26.2...v0.27.0) (2026-08-09)


### Features

* **plugins:** Obsidian core commands, global tooltips, inline HTML allowlist ([aceb46b](https://github.com/andreas13xxx/Slatebase/commit/aceb46bad27c3f9faed825c51e1f944909ef9499))

## [0.26.2](https://github.com/andreas13xxx/Slatebase/compare/v0.26.1...v0.26.2) (2026-08-08)


### Sonstige Änderungen

* bump the minor-patch group across 1 directory with 8 updates ([#93](https://github.com/andreas13xxx/Slatebase/issues/93)) ([8014ccc](https://github.com/andreas13xxx/Slatebase/commit/8014ccc09e511b847088c3bf3c524636d68afe0b))

## [0.26.1](https://github.com/andreas13xxx/Slatebase/compare/v0.26.0...v0.26.1) (2026-08-08)


### Sonstige Änderungen

* update steering, AGENTS.md to reflect current codebase ([0ac8988](https://github.com/andreas13xxx/Slatebase/commit/0ac8988b6a6207ac9039c795f193c468f7e1b279))

## [0.26.0](https://github.com/andreas13xxx/Slatebase/compare/v0.25.4...v0.26.0) (2026-08-07)


### Features

* make Obsidian toolbar plugins work, drop native editor toolbar ([25cfadd](https://github.com/andreas13xxx/Slatebase/commit/25cfadd7d0dcc89c7e5f87562bf0acbf096d2a5f))


### Bugfixes

* fetch plugin stats from aggregated feed instead of per-repo API ([09c09f9](https://github.com/andreas13xxx/Slatebase/commit/09c09f945d59da861f55e051a9dfeb95c1ac4090))


### Sonstige Änderungen

* enforce coverage thresholds in CI ([ad1a5f5](https://github.com/andreas13xxx/Slatebase/commit/ad1a5f5c154ab1a58cd4c5c63df35ca3c090b2c3))
* update steering, implementation plan and learnings ([1517cce](https://github.com/andreas13xxx/Slatebase/commit/1517cced001c35bb4497be7befab958bb523359a))

## [0.25.4](https://github.com/andreas13xxx/Slatebase/compare/v0.25.3...v0.25.4) (2026-08-07)


### Sonstige Änderungen

* bump @modelcontextprotocol/sdk from 1.18.0 to 1.26.0 in /backend ([#86](https://github.com/andreas13xxx/Slatebase/issues/86)) ([4d1e3f2](https://github.com/andreas13xxx/Slatebase/commit/4d1e3f24efedad04f08c4b2bebc8432e16d2973c))
* bump pino from 9.14.0 to 10.3.1 in /backend ([#73](https://github.com/andreas13xxx/Slatebase/issues/73)) ([869a7cf](https://github.com/andreas13xxx/Slatebase/commit/869a7cfffda7cbbb3469bb3ddf8a8c75f2920806))
* bump vite from 8.2.0 to 8.2.1 in /backend ([#90](https://github.com/andreas13xxx/Slatebase/issues/90)) ([11cd77a](https://github.com/andreas13xxx/Slatebase/commit/11cd77aab2d843c5126b3406eaa854cdce02bdfa))

## [0.25.3](https://github.com/andreas13xxx/Slatebase/compare/v0.25.2...v0.25.3) (2026-08-06)


### Bugfixes

* cast transport for exactOptionalPropertyTypes compat with newer MCP SDK ([9d69edd](https://github.com/andreas13xxx/Slatebase/commit/9d69edde2352364eff5522673f42da1e99485ca1))


### Sonstige Änderungen

* bump @hono/node-server from 1.19.14 to 2.0.10 in /backend ([#83](https://github.com/andreas13xxx/Slatebase/issues/83)) ([95ddd41](https://github.com/andreas13xxx/Slatebase/commit/95ddd412d489a0c55a90ed57561310cd76fd4d52))
* bump @testing-library/jest-dom from 6.9.1 to 7.0.0 in /frontend ([#79](https://github.com/andreas13xxx/Slatebase/issues/79)) ([e00944b](https://github.com/andreas13xxx/Slatebase/commit/e00944beef4b450b9a7a6215090812c623890ced))
* bump @types/node from 24.12.4 to 26.1.2 in /frontend ([#77](https://github.com/andreas13xxx/Slatebase/issues/77)) ([45784fc](https://github.com/andreas13xxx/Slatebase/commit/45784fcbecd8a98943b636a6e47086408669764c))
* bump adm-zip from 0.5.16 to 0.6.0 in /backend ([#84](https://github.com/andreas13xxx/Slatebase/issues/84)) ([b69a3fa](https://github.com/andreas13xxx/Slatebase/commit/b69a3fa2af906daf27abb48e0bad7816030b207a))
* bump body-parser from 2.2.2 to 2.3.0 in /backend ([#85](https://github.com/andreas13xxx/Slatebase/issues/85)) ([4aa7bb1](https://github.com/andreas13xxx/Slatebase/commit/4aa7bb18a61c7c61f72ce98b43b486481dde7a08))
* bump fast-check from 3.22.0 to 4.9.0 in /backend ([#74](https://github.com/andreas13xxx/Slatebase/issues/74)) ([b41b597](https://github.com/andreas13xxx/Slatebase/commit/b41b597910259b9847e71659fd27143dfc374297))
* bump hono from 4.12.21 to 4.13.0 in /backend ([#82](https://github.com/andreas13xxx/Slatebase/issues/82)) ([3e526c8](https://github.com/andreas13xxx/Slatebase/commit/3e526c8b57e08d49c4373cbd56db27efc7cf45ab))
* bump lucide-react from 0.511.0 to 1.28.0 in /frontend ([#76](https://github.com/andreas13xxx/Slatebase/issues/76)) ([7c88ba0](https://github.com/andreas13xxx/Slatebase/commit/7c88ba09b507451344a04f7e731a9bfb06bcfe61))
* bump vitest from 3.2.4 to 4.1.10 in /backend ([#72](https://github.com/andreas13xxx/Slatebase/issues/72)) ([314cf38](https://github.com/andreas13xxx/Slatebase/commit/314cf383693a1ff1c394427b532bbade3a1ce834))

## [0.25.2](https://github.com/andreas13xxx/Slatebase/compare/v0.25.1...v0.25.2) (2026-08-06)


### Bugfixes

* cancel scheduled post-FCP plugin load on unmount ([f4926c2](https://github.com/andreas13xxx/Slatebase/commit/f4926c264d75bb442fdf1f0799979618191d7ab2))
* replace fixed-delay persist wait with deterministic flush in cache test ([46ffed9](https://github.com/andreas13xxx/Slatebase/commit/46ffed9e93570f088cce9d5fc584cbc96c6fed5c))
* revert accidental commandRegistry AppShim wiring ([e7805d7](https://github.com/andreas13xxx/Slatebase/commit/e7805d7369588c07e968f3c96674fa860babbddc))
* update to renamed CLang icon export from @react-symbols/icons ([64fa218](https://github.com/andreas13xxx/Slatebase/commit/64fa2180470171fa12b4d0d1a61f5376444f4965))


### Sonstige Änderungen

* add Dependabot config for backend, frontend, and GitHub Actions ([e8141f8](https://github.com/andreas13xxx/Slatebase/commit/e8141f8296ffb6de7ddcd9d17b95bab99dd7c553))
* bump @types/node from 22.19.19 to 26.1.2 in /backend ([#71](https://github.com/andreas13xxx/Slatebase/issues/71)) ([aafbf9d](https://github.com/andreas13xxx/Slatebase/commit/aafbf9d5286650b89d3fa300f724ccebf2db063f))
* bump actions/checkout from 4 to 7 ([#67](https://github.com/andreas13xxx/Slatebase/issues/67)) ([4d362c9](https://github.com/andreas13xxx/Slatebase/commit/4d362c9ebe5205a19db9cd57c00caacc58d62ad7))
* bump docker/build-push-action from 6 to 7 ([#69](https://github.com/andreas13xxx/Slatebase/issues/69)) ([d19ec54](https://github.com/andreas13xxx/Slatebase/commit/d19ec54de3e06503fe1d739a49b345ba35495466))
* bump docker/login-action from 3 to 4 ([#68](https://github.com/andreas13xxx/Slatebase/issues/68)) ([302757e](https://github.com/andreas13xxx/Slatebase/commit/302757e1510f8b5d7126c8ca35c0d1d8224cf8fb))
* bump docker/setup-buildx-action from 3 to 4 ([#66](https://github.com/andreas13xxx/Slatebase/issues/66)) ([e620e81](https://github.com/andreas13xxx/Slatebase/commit/e620e81e959f4714853039cb9d5fccf4a4a7de83))
* bump docker/setup-qemu-action from 3 to 4 ([#65](https://github.com/andreas13xxx/Slatebase/issues/65)) ([61f8d32](https://github.com/andreas13xxx/Slatebase/commit/61f8d3282dd9d63f0508c44b4ea633775475028b))
* bump postcss from 8.5.15 to 8.5.26 in /backend ([#81](https://github.com/andreas13xxx/Slatebase/issues/81)) ([f74e60d](https://github.com/andreas13xxx/Slatebase/commit/f74e60db5327191446c97f1d67e94025480efb51))
* bump the minor-patch group in /frontend with 15 updates ([#75](https://github.com/andreas13xxx/Slatebase/issues/75)) ([340f818](https://github.com/andreas13xxx/Slatebase/commit/340f818eca6a4824b9af0be0f004efe3d9b0af2c))
* consolidate JSON persistence into shared JsonFileStore, add plugin service layer ([feb84da](https://github.com/andreas13xxx/Slatebase/commit/feb84daa5bede90d955d3c0103e281387d3a5f3d))
* **deps-dev:** bump brace-expansion from 5.0.6 to 5.0.9 in /frontend ([#64](https://github.com/andreas13xxx/Slatebase/issues/64)) ([bdac8b7](https://github.com/andreas13xxx/Slatebase/commit/bdac8b78e30f79e74b80f1e5d170e4522c5552eb))
* **deps:** bump dompurify from 3.4.11 to 3.4.13 in /frontend ([#63](https://github.com/andreas13xxx/Slatebase/issues/63)) ([076b18e](https://github.com/andreas13xxx/Slatebase/commit/076b18ef22085464784c32d2ba23048812d4c477))
* **deps:** bump postcss from 8.5.15 to 8.5.26 in /frontend ([#62](https://github.com/andreas13xxx/Slatebase/issues/62)) ([03e0ced](https://github.com/andreas13xxx/Slatebase/commit/03e0ced692a3d1bdf46b4103daba376d36457078))
* **deps:** bump undici from 7.25.0 to 7.29.0 in /frontend ([#61](https://github.com/andreas13xxx/Slatebase/issues/61)) ([ff7530c](https://github.com/andreas13xxx/Slatebase/commit/ff7530cce67d228724d6f42ccc6f00e80dc74c62))

## [0.25.1](https://github.com/andreas13xxx/Slatebase/compare/v0.25.0...v0.25.1) (2026-08-05)


### Bugfixes

* replace all undefined CSS variables with correct design tokens ([2851ffd](https://github.com/andreas13xxx/Slatebase/commit/2851ffd2fdb7e1d140e34067aadeec795acd30e0))

## [0.25.0](https://github.com/andreas13xxx/Slatebase/compare/v0.24.0...v0.25.0) (2026-08-05)


### Features

* mermaid renderer improvements and advanced diagram documentation ([35cb503](https://github.com/andreas13xxx/Slatebase/commit/35cb503d3a16d82b517c3a1f879e74aecb2d3309))
* tab drag reorder, Ctrl+E toggle mode, Ctrl+Shift+F search fix, daily note template placeholders, configurable dailyNoteTemplateName, welcome vault preconfig ([745e663](https://github.com/andreas13xxx/Slatebase/commit/745e663db938d0985e681a358b2f8e15633d9cf5))

## [0.24.0](https://github.com/andreas13xxx/Slatebase/compare/v0.23.1...v0.24.0) (2026-08-05)


### Features

* plugin store UI improvements ([6a66ac8](https://github.com/andreas13xxx/Slatebase/commit/6a66ac8a9d27c6031daffe635a1705460dd83794))
* plugin store UI improvements ([9b4eb38](https://github.com/andreas13xxx/Slatebase/commit/9b4eb3855a868b61d944c67659ead8186ec01eb4))
* **plugins:** scope view container styles to owning plugin, add compat CSS aliases ([d40faef](https://github.com/andreas13xxx/Slatebase/commit/d40faeffd01fe21e944909e727b9cd940341960b))

## [0.23.1](https://github.com/andreas13xxx/Slatebase/compare/v0.23.0...v0.23.1) (2026-08-05)


### Bugfixes

* **plugins:** delegate Plugin.registerHoverLinkSource to the workspace ([66e365f](https://github.com/andreas13xxx/Slatebase/commit/66e365ff97f7591520c7c38e49a508e371af21c0))

## [0.23.0](https://github.com/andreas13xxx/Slatebase/compare/v0.22.0...v0.23.0) (2026-08-05)


### Features

* hover previews for internal links ([df05339](https://github.com/andreas13xxx/Slatebase/commit/df05339cef7d78bacad842cf49b06e0afe110b30))

## [0.22.0](https://github.com/andreas13xxx/Slatebase/compare/v0.21.0...v0.22.0) (2026-08-05)


### Features

* **plugins:** populate block ids in the metadata cache ([512caf5](https://github.com/andreas13xxx/Slatebase/commit/512caf516e07cfdedea8ec30a1a1331a73861f94))

## [0.21.0](https://github.com/andreas13xxx/Slatebase/compare/v0.20.0...v0.21.0) (2026-08-05)


### Features

* **plugins:** implement getSectionInfo for code blocks ([8e744b3](https://github.com/andreas13xxx/Slatebase/commit/8e744b3d4f9548aff645a2abeade83ca43f84b27))

## [0.20.0](https://github.com/andreas13xxx/Slatebase/compare/v0.19.1...v0.20.0) (2026-08-04)


### Features

* **plugins:** make unemulated App/Workspace APIs enumerable ([5c757fb](https://github.com/andreas13xxx/Slatebase/commit/5c757fbc6b6895ef0337712c68c3c0e932acdba8))

## [0.19.1](https://github.com/andreas13xxx/Slatebase/compare/v0.19.0...v0.19.1) (2026-08-04)


### Bugfixes

* **plugins:** register obsidian shims synchronously to win stub race ([90773b5](https://github.com/andreas13xxx/Slatebase/commit/90773b50dc84870a1dbf2fa256b57c6725cda14a))


### Sonstige Änderungen

* **plugins:** extract global installation out of setting-tab.ts ([63fbbe7](https://github.com/andreas13xxx/Slatebase/commit/63fbbe73ea3d3e09d558b6053bf0e5731f6beba7))
* **plugins:** make unimplemented compat APIs announce themselves ([87cdcbf](https://github.com/andreas13xxx/Slatebase/commit/87cdcbfd0da206326ac6fd0e8c22ca98a03061ae))
* **plugins:** move obsidian fallback stubs out of injected JS string ([f20249a](https://github.com/andreas13xxx/Slatebase/commit/f20249ae0dde8ba7078caac895f8e76e1abe0ef5))

## [0.19.0](https://github.com/andreas13xxx/Slatebase/compare/v0.18.1...v0.19.0) (2026-08-04)


### Features

* improve plugin compat layer (CM6 extensions, live-preview, welcome vault templates) ([17cff10](https://github.com/andreas13xxx/Slatebase/commit/17cff10aa3eeb5b9c13bdff48359c855e3f81625))


### Bugfixes

* resolve Kanban board blank page in view and edit mode ([645fade](https://github.com/andreas13xxx/Slatebase/commit/645fadedf5c70773589593e9c7e3a41a0eeeb6ca))

## [0.18.1](https://github.com/andreas13xxx/Slatebase/compare/v0.18.0...v0.18.1) (2026-08-04)


### Sonstige Änderungen

* remove sync references from welcome vault templates and feature toggles ([7409c6d](https://github.com/andreas13xxx/Slatebase/commit/7409c6d462637654b6564bac125a2b086d09ea91))

## [0.18.0](https://github.com/andreas13xxx/Slatebase/compare/v0.17.1...v0.18.0) (2026-08-04)


### Features

* add community plugin store (backend + frontend) ([355d856](https://github.com/andreas13xxx/Slatebase/commit/355d856225ba59f9f48d5cb5b233f2ec2b7b7e9a))

## [0.17.1](https://github.com/andreas13xxx/Slatebase/compare/v0.17.0...v0.17.1) (2026-08-03)


### Sonstige Änderungen

* remove vault-sync module (backend + frontend) ([446ed48](https://github.com/andreas13xxx/Slatebase/commit/446ed484f59a37e252353c7609c27963759d817c))

## [0.17.0](https://github.com/andreas13xxx/Slatebase/compare/v0.16.1...v0.17.0) (2026-08-02)


### Features

* **plugin-compat:** add declarative settings renderer, global extensions, and metadata cache improvements ([1925bf7](https://github.com/andreas13xxx/Slatebase/commit/1925bf7c73bb006840d0398bbc3c2783c25d9a78))

## [0.16.1](https://github.com/andreas13xxx/Slatebase/compare/v0.16.0...v0.16.1) (2026-08-02)


### Sonstige Änderungen

* consolidate steering files and update implementation plan ([31d23a7](https://github.com/andreas13xxx/Slatebase/commit/31d23a77a7e96469884d1430fae939f925f99b45))

## [0.16.0](https://github.com/andreas13xxx/Slatebase/compare/v0.15.1...v0.16.0) (2026-08-02)


### Features

* extend Obsidian plugin compat layer (Tier 1-3 APIs, LiveSync full support, CORS proxy) ([54dbcc4](https://github.com/andreas13xxx/Slatebase/commit/54dbcc47ec959e92fd1c880376dca868d130359d))

## [0.15.1](https://github.com/andreas13xxx/Slatebase/compare/v0.15.0...v0.15.1) (2026-07-27)


### Bugfixes

* deduplicate welcome vault name globally and include templates in Docker image ([1b9fe93](https://github.com/andreas13xxx/Slatebase/commit/1b9fe93052b53f17094726b80b77d7fe0b7a10fb))

## [0.15.0](https://github.com/andreas13xxx/Slatebase/compare/v0.14.0...v0.15.0) (2026-07-23)


### Features

* implement workspace state persistence across page reloads ([618f939](https://github.com/andreas13xxx/Slatebase/commit/618f93905b1b6b29e3b94b62c7082dd92e3c18a5))


### Bugfixes

* clear workspace store between FileExplorer tests ([2f597db](https://github.com/andreas13xxx/Slatebase/commit/2f597dbe92d995904b2dcc83cce530fab5589927))

## [0.14.0](https://github.com/andreas13xxx/Slatebase/compare/v0.13.0...v0.14.0) (2026-07-21)


### Features

* enhance live-preview rendering (tables, mermaid, images, HR, highlight, frontmatter, links) ([86a1022](https://github.com/andreas13xxx/Slatebase/commit/86a1022fc4279ce379a9e921bf4b2da401f5880a))
* enhance live-preview with full element rendering and UX improvements ([75b6ac0](https://github.com/andreas13xxx/Slatebase/commit/75b6ac0780bdd0b8c9c2e88aff6225dc58cee704))

## [0.13.0](https://github.com/andreas13xxx/Slatebase/compare/v0.12.0...v0.13.0) (2026-07-21)


### Features

* implement Live Preview Editor (CodeMirror 6) ([f3e0ce8](https://github.com/andreas13xxx/Slatebase/commit/f3e0ce830f6c2b0f4b6b5d4af75b230fa6c753fe))
* implement Live Preview Editor (CodeMirror 6) ([922175e](https://github.com/andreas13xxx/Slatebase/commit/922175e7559bb0d0bcae8d0e46b5459fc145e500))


### Sonstige Änderungen

* add live-preview-editor spec (CodeMirror 6) and update implementation plan ([b16072d](https://github.com/andreas13xxx/Slatebase/commit/b16072d36577d6ace52234dfad382e5fd38c6e6d))

## [0.12.0](https://github.com/andreas13xxx/Slatebase/compare/v0.11.0...v0.12.0) (2026-07-17)


### Features

* welcome vault v2 — comprehensive guides, on-demand API, settings UI - Backend: POST /api/v1/welcome-vault endpoint with rate limiting (3/h), name deduplication, feature-toggle guard, link-index rebuild - Frontend: IApiClient.createWelcomeVault(), WelcomeVaultSection in Settings, Command Palette 'create-welcome-vault' command, i18n strings (DE/EN) - Templates DE: 35+ guides (Grundlagen, Features, Fortgeschritten, Praxis, Vorlagen, Screenshots) with wikilinks, callouts, and embedded screenshots - Templates EN: full translation of all guides with matching structure - Screenshots: 22 placeholder PNGs for both language variants - Docs: updated implementation-plan, product, structure, lessons-learned, README with new feature and API endpoint ([8a4a814](https://github.com/andreas13xxx/Slatebase/commit/8a4a8144f5e7a6e9293d6697cd57177e67714f05))

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
