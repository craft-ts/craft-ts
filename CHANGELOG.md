## 0.7.0-beta.11 (2026-08-15)

### 🚀 Features

- **mcp:** ship a consumer MCP server, Agent Skills, and llms.txt ([690579d](https://github.com/craft-ts/craft-ts/commit/690579d))

### 🩹 Fixes

- **release:** version @craft-ts/mcp from its package.json ([f56c276](https://github.com/craft-ts/craft-ts/commit/f56c276))
- **release:** allow package-lock.json in the version bump ([bde68e9](https://github.com/craft-ts/craft-ts/commit/bde68e9))
- **release:** pack @craft-ts/mcp from an absolute path ([f112973](https://github.com/craft-ts/craft-ts/commit/f112973))

### ❤️ Thank You

- Cursor @cursoragent
- Romain

## 0.7.0-beta.10 (2026-08-15)

### 🩹 Fixes

- **component:** keep DOM listeners across patches and inherit parent route props ([51d1ae7](https://github.com/craft-ts/craft-ts/commit/51d1ae7))

### ❤️ Thank You

- Cursor @cursoragent
- Romain

## 0.7.0-beta.9 (2026-08-15)

### 🚀 Features

- **component:** add fieldControl a11y prop bundles ([0b24c02](https://github.com/craft-ts/craft-ts/commit/0b24c02))
- **component:** add disclosureControl ARIA linking ([c775e33](https://github.com/craft-ts/craft-ts/commit/c775e33))
- **component:** add buttonControl with opt-in keepFocusable ([27f80e6](https://github.com/craft-ts/craft-ts/commit/27f80e6))
- **component:** keep liveRegion mounted as an optional landmark ([db7403e](https://github.com/craft-ts/craft-ts/commit/db7403e))
- **component:** add getByRole and getByLabel template queries ([d0aacf4](https://github.com/craft-ts/craft-ts/commit/d0aacf4))
- **component:** add clickFocus for gesture-sync focusing ([410cf00](https://github.com/craft-ts/craft-ts/commit/410cf00))
- **core:** sync document lang and dir through BrowserDocument ([b65847b](https://github.com/craft-ts/craft-ts/commit/b65847b))

### 🩹 Fixes

- **component:** serialize htmlFor and boolean aria attributes ([2ddc6c2](https://github.com/craft-ts/craft-ts/commit/2ddc6c2))
- **component:** serialize boolean false on aria attributes ([594fc43](https://github.com/craft-ts/craft-ts/commit/594fc43))
- **component:** treat an explicit empty liveRegion label as provided ([1b6d4c1](https://github.com/craft-ts/craft-ts/commit/1b6d4c1))
- **component:** tighten getByRole errors and accessible names ([450eb2d](https://github.com/craft-ts/craft-ts/commit/450eb2d))
- **component:** restore RegExp lastIndex after getByRole name match ([85df08f](https://github.com/craft-ts/craft-ts/commit/85df08f))
- **component:** hide closed disclosure panels and clear label htmlFor ([5f04420](https://github.com/craft-ts/craft-ts/commit/5f04420))
- **core:** yield insertion state reads and writes ([83c9a18](https://github.com/craft-ts/craft-ts/commit/83c9a18))
- **core:** attach runtime meta to abstract inject helpers ([aeb0dc2](https://github.com/craft-ts/craft-ts/commit/aeb0dc2))

### ❤️ Thank You

- Cursor @cursoragent
- Romain

## 0.7.0-beta.8 (2026-08-13)

This was a version bump only, there were no code changes.

## 0.7.0-beta.7 (2026-08-13)

### 🚀 Features

- **component:** CSS variables contract for craft components ([dc6d2e8](https://github.com/craft-ts/craft-ts/commit/dc6d2e8))
- **component:** settledValue + pendingBlock, type-safe suspension ([15a77ab](https://github.com/craft-ts/craft-ts/commit/15a77ab))
- **component:** pendingBlock reloading slot, and reliable boundary recovery ([7dbf767](https://github.com/craft-ts/craft-ts/commit/7dbf767))

### ❤️ Thank You

- Claude Opus 5
- Romain

## 0.7.0-beta.6 (2026-08-12)

### 🚀 Features

- **forms:** support composed field insertions ([9dff8d8](https://github.com/craft-ts/craft-ts/commit/9dff8d8))
- **forms:** enforce grouped exception handling ([d807b88](https://github.com/craft-ts/craft-ts/commit/d807b88))

### ❤️ Thank You

- Romain

## 0.7.0-beta.5 (2026-08-11)

This was a version bump only, there were no code changes.

## 0.7.0-beta.4 (2026-08-11)

### 🩹 Fixes

- **release:** disable target log forwarding ([d34036b](https://github.com/craft-ts/craft-ts/commit/d34036b))

### ❤️ Thank You

- Romain

## 0.7.0-beta.3 (2026-08-11)

### 🩹 Fixes

- **release:** keep correlation tracking disabled in target ([72c35d8](https://github.com/craft-ts/craft-ts/commit/72c35d8))

### ❤️ Thank You

- Romain

## 0.7.0-beta.2 (2026-08-11)

### 🚀 Features

- add yieldable template contracts ([da8ebf1](https://github.com/craft-ts/craft-ts/commit/da8ebf1))
- add fine-grained component reactivity ([31c1a78](https://github.com/craft-ts/craft-ts/commit/31c1a78))
- **component:** merge component host properties ([099883b](https://github.com/craft-ts/craft-ts/commit/099883b))
- **component:** infer Angular directive inputs from node props ([50546af](https://github.com/craft-ts/craft-ts/commit/50546af))
- **component:** support configured Angular directive pipes ([e1076eb](https://github.com/craft-ts/craft-ts/commit/e1076eb))
- **component:** add scoped style registry and customization docs ([55f6432](https://github.com/craft-ts/craft-ts/commit/55f6432))
- **core:** add craftLazy for lazy service imports; rename untilSettled → craftUntilSettled ([c23c616](https://github.com/craft-ts/craft-ts/commit/c23c616))
- **core:** add craftMatch for exhaustive literal-union pattern matching ([1b2197c](https://github.com/craft-ts/craft-ts/commit/1b2197c))
- **core:** add Craft runtime registry ([02181ea](https://github.com/craft-ts/craft-ts/commit/02181ea))
- **core:** add Standard Schema validation primitives ([dfe47a4](https://github.com/craft-ts/craft-ts/commit/dfe47a4))
- **core:** add typed insertion pipes ([79d0ec9](https://github.com/craft-ts/craft-ts/commit/79d0ec9))
- **dev-tools:** add template migration tooling ([5e2ae2e](https://github.com/craft-ts/craft-ts/commit/5e2ae2e))
- **dev-tools:** enforce Craft HTTP transports ([a75157c](https://github.com/craft-ts/craft-ts/commit/a75157c))
- **dev-tools:** forbid Angular input output APIs ([4a37fd9](https://github.com/craft-ts/craft-ts/commit/4a37fd9))
- **dev-tools:** enforce yielded resource triggers ([2c240a8](https://github.com/craft-ts/craft-ts/commit/2c240a8))
- **graph:** polish dependency graph visualization ([fa25d06](https://github.com/craft-ts/craft-ts/commit/fa25d06))
- **release:** actionable git sync errors with fix commands ([e5892e6](https://github.com/craft-ts/craft-ts/commit/e5892e6))
- **routes:** make guarded data yieldable ([dddcd43](https://github.com/craft-ts/craft-ts/commit/dddcd43))
- **tooling:** add local log server and logs MCP server ([70849b6](https://github.com/craft-ts/craft-ts/commit/70849b6))

### 🩹 Fixes

- preserve demo template input state ([29efc15](https://github.com/craft-ts/craft-ts/commit/29efc15))
- **component:** accept literal element nodes ([28c7520](https://github.com/craft-ts/craft-ts/commit/28c7520))
- **demo:** use craft query status type ([c79a51d](https://github.com/craft-ts/craft-ts/commit/c79a51d))
- **demo:** keep app start callback synchronous ([c2939da](https://github.com/craft-ts/craft-ts/commit/c2939da))
- **release:** sync internal dependencies and demo tooling ([812fd0e](https://github.com/craft-ts/craft-ts/commit/812fd0e))

### ❤️ Thank You

- Claude
- Claude Opus 4.8
- Romain

## 0.7.0-beta.1 (2026-08-11)

### 🚀 Features

- add yieldable template contracts ([da8ebf1](https://github.com/craft-ts/craft-ts/commit/da8ebf1))
- add fine-grained component reactivity ([31c1a78](https://github.com/craft-ts/craft-ts/commit/31c1a78))
- **component:** merge component host properties ([099883b](https://github.com/craft-ts/craft-ts/commit/099883b))
- **component:** infer Angular directive inputs from node props ([50546af](https://github.com/craft-ts/craft-ts/commit/50546af))
- **component:** support configured Angular directive pipes ([e1076eb](https://github.com/craft-ts/craft-ts/commit/e1076eb))
- **component:** add scoped style registry and customization docs ([55f6432](https://github.com/craft-ts/craft-ts/commit/55f6432))
- **core:** add craftLazy for lazy service imports; rename untilSettled → craftUntilSettled ([c23c616](https://github.com/craft-ts/craft-ts/commit/c23c616))
- **core:** add craftMatch for exhaustive literal-union pattern matching ([1b2197c](https://github.com/craft-ts/craft-ts/commit/1b2197c))
- **core:** add Craft runtime registry ([02181ea](https://github.com/craft-ts/craft-ts/commit/02181ea))
- **core:** add Standard Schema validation primitives ([dfe47a4](https://github.com/craft-ts/craft-ts/commit/dfe47a4))
- **core:** add typed insertion pipes ([79d0ec9](https://github.com/craft-ts/craft-ts/commit/79d0ec9))
- **dev-tools:** add template migration tooling ([5e2ae2e](https://github.com/craft-ts/craft-ts/commit/5e2ae2e))
- **dev-tools:** enforce Craft HTTP transports ([a75157c](https://github.com/craft-ts/craft-ts/commit/a75157c))
- **dev-tools:** forbid Angular input output APIs ([4a37fd9](https://github.com/craft-ts/craft-ts/commit/4a37fd9))
- **dev-tools:** enforce yielded resource triggers ([2c240a8](https://github.com/craft-ts/craft-ts/commit/2c240a8))
- **graph:** polish dependency graph visualization ([fa25d06](https://github.com/craft-ts/craft-ts/commit/fa25d06))
- **release:** actionable git sync errors with fix commands ([e5892e6](https://github.com/craft-ts/craft-ts/commit/e5892e6))
- **routes:** make guarded data yieldable ([dddcd43](https://github.com/craft-ts/craft-ts/commit/dddcd43))
- **tooling:** add local log server and logs MCP server ([70849b6](https://github.com/craft-ts/craft-ts/commit/70849b6))

### 🩹 Fixes

- preserve demo template input state ([29efc15](https://github.com/craft-ts/craft-ts/commit/29efc15))
- **component:** accept literal element nodes ([28c7520](https://github.com/craft-ts/craft-ts/commit/28c7520))
- **demo:** use craft query status type ([c79a51d](https://github.com/craft-ts/craft-ts/commit/c79a51d))
- **release:** sync internal dependencies and demo tooling ([812fd0e](https://github.com/craft-ts/craft-ts/commit/812fd0e))

### ❤️ Thank You

- Claude
- Claude Opus 4.8
- Romain

## 0.6.0-beta.5 (2026-07-27)

### 🚀 Features

- add yieldable template contracts ([da8ebf1](https://github.com/craft-ts/craft-ts/commit/da8ebf1))
- **component:** merge component host properties ([099883b](https://github.com/craft-ts/craft-ts/commit/099883b))
- **component:** infer Angular directive inputs from node props ([50546af](https://github.com/craft-ts/craft-ts/commit/50546af))
- **component:** support configured Angular directive pipes ([e1076eb](https://github.com/craft-ts/craft-ts/commit/e1076eb))
- **component:** add scoped style registry and customization docs ([55f6432](https://github.com/craft-ts/craft-ts/commit/55f6432))
- **core:** add craftLazy for lazy service imports; rename untilSettled → craftUntilSettled ([c23c616](https://github.com/craft-ts/craft-ts/commit/c23c616))
- **core:** add craftMatch for exhaustive literal-union pattern matching ([1b2197c](https://github.com/craft-ts/craft-ts/commit/1b2197c))
- **release:** actionable git sync errors with fix commands ([e5892e6](https://github.com/craft-ts/craft-ts/commit/e5892e6))
- **tooling:** add local log server and logs MCP server ([70849b6](https://github.com/craft-ts/craft-ts/commit/70849b6))

### 🩹 Fixes

- **component:** accept literal element nodes ([28c7520](https://github.com/craft-ts/craft-ts/commit/28c7520))

### ❤️ Thank You

- Claude
- Claude Opus 4.8
- Romain

## 0.6.0-beta.4 (2026-07-23)

### 🚀 Features

- **core:** add craftLazy for lazy service imports; rename untilSettled → craftUntilSettled ([c23c616](https://github.com/craft-ts/craft-ts/commit/c23c616))
- **release:** actionable git sync errors with fix commands ([e5892e6](https://github.com/craft-ts/craft-ts/commit/e5892e6))

### ❤️ Thank You

- Claude Opus 4.8
- Romain

## 0.6.0-beta.2 (2026-07-20)

This was a version bump only, there were no code changes.

## 0.6.0-beta.1 (2026-07-20)

### 🚀 Features

- Enhance craft-service with provided input handling and branded service providers ([e3507f8](https://github.com/craft-ts/craft-ts/commit/e3507f8))
- add demo component for sending context to AI ([296c10e](https://github.com/craft-ts/craft-ts/commit/296c10e))
- add track functionality for dependency management in craftService ([56009ea](https://github.com/craft-ts/craft-ts/commit/56009ea))
- enhance route and service handling with typed providers and yield support ([c36489c](https://github.com/craft-ts/craft-ts/commit/c36489c))
- add route providers documentation and enhance abstract service functionality ([8c3a4db](https://github.com/craft-ts/craft-ts/commit/8c3a4db))
- implement generator-based redirectTo for type-safe dependency tracking in routes ([8223b4e](https://github.com/craft-ts/craft-ts/commit/8223b4e))
- introduce craftGen for reusable generator factories and enhance routing guards ([45e8f39](https://github.com/craft-ts/craft-ts/commit/45e8f39))
- enhance routing guards to support observables and async results ([6b2a770](https://github.com/craft-ts/craft-ts/commit/6b2a770))
- update version to 0.5.1-beta.0 in package.json ([5b2cace](https://github.com/craft-ts/craft-ts/commit/5b2cace))
- add per-file DI checks and ESLint workflow documentation ([f097662](https://github.com/craft-ts/craft-ts/commit/f097662))
- **core:** infrastructure CraftPrimitiveGen + craftUse ([03e2fc6](https://github.com/craft-ts/craft-ts/commit/03e2fc6))
- ⚠️  **core:** state/query/mutation/asyncProcess/queryParam retournent un générateur ([847ae73](https://github.com/craft-ts/craft-ts/commit/847ae73))
- ⚠️  **core:** suppression de track() ([f8780ce](https://github.com/craft-ts/craft-ts/commit/f8780ce))
- **core:** re-run loader on every imperative method call ([d72118d](https://github.com/craft-ts/craft-ts/commit/d72118d))
- **dev-tools:** codemod migrate-primitive-generators ([25c08b7](https://github.com/craft-ts/craft-ts/commit/25c08b7))
- **dev-tools:** règle require-primitive-generator-unwrap + maj des codemods ([3655a7e](https://github.com/craft-ts/craft-ts/commit/3655a7e))
- **forms:** type submit exception rules ([608753c](https://github.com/craft-ts/craft-ts/commit/608753c))
- **release:** add local multi-repo release command ([1ba0436](https://github.com/craft-ts/craft-ts/commit/1ba0436))
- **routes:** implement exhaustive route exception handling and child route mounting checks ([9bb55e5](https://github.com/craft-ts/craft-ts/commit/9bb55e5))

### 🩹 Fixes

- using afterRecomputation with readonly source ([ae220a7](https://github.com/craft-ts/craft-ts/commit/ae220a7))
- improve documentation clarity and correct typos across multiple files ([52859fb](https://github.com/craft-ts/craft-ts/commit/52859fb))
- **release:** install dependencies before local builds ([cd65e34](https://github.com/craft-ts/craft-ts/commit/cd65e34))

### ⚠️  Breaking Changes

- **core:** suppression de track()  ([f8780ce](https://github.com/craft-ts/craft-ts/commit/f8780ce))
- **core:** state/query/mutation/asyncProcess/queryParam retournent un générateur  ([847ae73](https://github.com/craft-ts/craft-ts/commit/847ae73))

### ❤️ Thank You

- Claude Fable 5
- Claude Opus 4.8
- Romain

## 0.1.0 (2026-03-29)

### 🚀 Features

- **core:** extract insert select changes ([6dcca39](https://github.com/craft-ts/craft-ts/commit/6dcca39))
- **exceptions:** add exceptions component and routing ([c3f12df](https://github.com/craft-ts/craft-ts/commit/c3f12df))

### 🩹 Fixes

- **core:** add missing insert-select implementation ([ae8dc4a](https://github.com/craft-ts/craft-ts/commit/ae8dc4a))

### ❤️ Thank You

- Romain

## 0.0.2 (2026-02-13)

### 🚀 Features

- enhance craft state management with detailed documentation and examples ([3125de5](https://github.com/craft-ts/craft-ts/commit/3125de5))
- enhance async methods tests and add detailed documentation for craft store functionality ([63bafe8](https://github.com/craft-ts/craft-ts/commit/63bafe8))
- add entities utilities and backlog documentation ([aff8650](https://github.com/craft-ts/craft-ts/commit/aff8650))
- enhance pagination placeholder data and add utility functions for entity management ([b589378](https://github.com/craft-ts/craft-ts/commit/b589378))
- enhance resource tracking and management in resourceById implementation ([6760d2a](https://github.com/craft-ts/craft-ts/commit/6760d2a))
- add comprehensive planning for 40 LinkedIn posts promoting craft-ts ([f3f0877](https://github.com/craft-ts/craft-ts/commit/f3f0877))

### 🩹 Fixes

- enable scoped store provider in test setup ([b1ecd7b](https://github.com/craft-ts/craft-ts/commit/b1ecd7b))

### ❤️ Thank You

- Romain